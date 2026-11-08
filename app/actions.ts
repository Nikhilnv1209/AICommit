"use server";
import { createFormSchema, TFormData } from "@/utils/schema";
import { prisma } from "@/prisma/client";
import { auth } from "@clerk/nextjs/server";
import { pollCommits } from "@/lib/github";
import { indexGithubRepo, countGithubRepoFiles } from "@/lib/github-loader";
import { aiGenerateEmbeddings, streamAIChat, streamAIChatWithMessages, isNotConfiguredError } from './../lib/ai';
import { buildProvider, hasServerFallback, DEFAULT_BASE_URL } from "@/lib/ai-config";
import { encrypt, decrypt, isEncryptionAvailable } from "@/lib/crypto";
import { chargeCredits, refundCredits, shouldCharge, CREDIT_COSTS, InsufficientCreditsError } from "@/lib/credits";
import { createStreamableValue } from "@ai-sdk/rsc";
import { logError, logInfo } from '@/lib/logger';
import cloudinary from "@/lib/cloudinary";
import { Readable, Transform } from "node:stream";
import type { UploadApiResponse } from "cloudinary";
import { getIndexingProgress as getProgress, resetIndexing } from "@/lib/indexing-progress";
import { indexingManager } from "@/lib/indexing-manager";
import { buildGraph, type GraphType } from "@/lib/graph-extraction";

export async function askQuestion(question: string, projectId: string) {
  const stream = createStreamableValue();

  const { userId } = await auth();
  if (!userId) {
    stream.error(new Error("User not found."));
    stream.done();
    return { output: stream.value, fileReference: [] as any };
  }

  let queryVector: number[];
  try {
    queryVector = await aiGenerateEmbeddings(userId, question);
  } catch (error) {
    if (isNotConfiguredError(error)) {
      stream.error(new Error("AI not configured. Add your API key in Settings."));
    } else {
      stream.error(new Error("Failed to generate embeddings."));
    }
    stream.done();
    return { output: stream.value, fileReference: [] as any };
  }
  const VectorQuery = `[${queryVector.join(",")}]`;

  // Vector similarity search — find files whose summaries match the question
  const result = await prisma.$queryRaw`
    SELECT "fileName", "sourceCode", "summary",
    1 - ("summeryEmbeddings" <=> ${VectorQuery}::vector) AS similarity
    from "SourceCodeEmbedding" where
    "projectId" = ${projectId} AND
    1 - ("summeryEmbeddings" <=> ${VectorQuery}::vector) > 0.5
    ORDER BY similarity DESC
    LIMIT 10
  ` as { fileName: string, sourceCode: string, summary: string, similarity: number }[];

  // Determine the mode: specific (high similarity) vs general (overview)
  const hasStrongMatch = result.length > 0 && result[0].similarity > 0.5;

  let prompt: string;
  let fileReference: { fileName: string; sourceCode: string; summary: string }[] = [];

  if (hasStrongMatch) {
    // ── SPECIFIC MODE: send full source code of matched files ──
    fileReference = result.map(r => ({ fileName: r.fileName, sourceCode: r.sourceCode, summary: r.summary }));

    let context = "";
    for (const data of result) {
      context += `source: ${data.fileName}
 code content: ${data.sourceCode}
 summary of file: ${data.summary}

`;
    }

    prompt = `
    AI assistant is a senior software engineer with access to the project's source code.
    Answer in Markdown format with code snippets where relevant.

    START CONTEXT BLOCK (matched files)
    ${context}
    END OF CONTEXT BLOCK

    START QUESTION
    ${question}
    END OF QUESTION

    Rules:
    - Answer based on the code context provided above.
    - If asking about a specific file, provide step-by-step details with code snippets.
    - If the context does not contain the answer, say "I don't have enough context to answer that."
    - Do not invent information not present in the context.
    `;
  } else {
    // ── GENERAL MODE: send all file summaries (no full code — keeps prompt compact) ──
    const allFiles = await prisma.sourceCodeEmbedding.findMany({
      where: { projectId },
      select: { fileName: true, summary: true },
    });

    const summaryList = allFiles
      .map(f => `- ${f.fileName}: ${f.summary}`)
      .join("\n");

    prompt = `
    AI assistant is a senior software engineer helping someone understand a codebase.
    Below is a list of every file in the project with a short AI-generated summary of what each does.
    Answer in Markdown format.

    START FILE SUMMARIES (${allFiles.length} files)
    ${summaryList}
    END FILE SUMMARIES

    START QUESTION
    ${question}
    END OF QUESTION

    Rules:
    - This is an overview/general question. Answer based on the file summaries above.
    - When relevant, mention which file(s) are related to the answer.
    - If the question is about a specific implementation detail, mention which file to look at and suggest asking a more specific question about that file.
    - Do not invent files or functionality not described in the summaries.
    `;
  }

  (async () => {
    // Charge a credit for the chat (only when on the server fallback;
    // BYO keys are free). Refund automatically if the stream fails.
    let chargeId: string | null = null;
    try {
      if (await shouldCharge(userId, "CHAT")) {
        const charge = await chargeCredits(userId, CREDIT_COSTS.CHAT, "CHAT", {
          projectId,
          description: `Q&A: ${question.slice(0, 60)}`,
        });
        chargeId = charge.id;
      }
    } catch (e: any) {
      stream.error(e instanceof InsufficientCreditsError
        ? e
        : new Error("Could not start the request."));
      stream.done();
      return;
    }

    try {
      for await (const chunk of streamAIChat(userId, prompt)) {
        stream.update(chunk);
      }
      stream.done();
    } catch (error) {
      logError('AskQuestion', `Error streaming response:`, error);
      if (chargeId) await refundCredits(userId, chargeId, "AskQuestion stream failed");
      if (isNotConfiguredError(error)) {
        stream.error(new Error("AI not configured. Add your API key in Settings."));
      } else {
        stream.error(new Error("Failed to generate response"));
      }
      stream.done();
    }
  })();

  return {
    output: stream.value,
    fileReference,
  };
}

export async function checkRepoCredits(repoUrl: string, githubToken?: string) {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error("User not found.");

    if (!repoUrl || !repoUrl.startsWith("https://github.com/")) {
      throw new Error("Invalid GitHub URL");
    }

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { credits: true } });
    if (!user) throw new Error("User not found.");

    const fileCount = await countGithubRepoFiles(repoUrl, githubToken);
    const sufficient = user.credits >= fileCount;

    return { fileCount, userCredits: user.credits, sufficient };
  } catch (error: any) {
    const message = error?.message || "Failed to check credits";
    return { error: message };
  }
}

export async function getIndexingProgress(projectId: string) {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error("User not found.");
    if (!projectId) throw new Error("Project id required");

    // Optionally verify user has access to the project
    const hasAccess = await prisma.project.findFirst({
      where: {
        id: projectId,
        userToProject: { some: { userId } },
      },
      select: { id: true },
    });
    if (!hasAccess) throw new Error("Project not found or access denied");

    // Use IndexingManager for consistent status
    const status = await indexingManager.getStatus(projectId);
    return {
      status: status.status,
      processed: status.processed,
      total: status.total,
      message: status.message,
      isActive: status.isActive,
    };
  } catch (error: any) {
    return { status: 'IDLE', processed: 0, total: 0, error: error?.message || 'Failed to get progress' } as any;
  }
}

export async function reindexProject(projectId: string) {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error("User not found.");
    if (!projectId) throw new Error("Project id required");

    // Verify user has access to the project
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        userToProject: { some: { userId } },
      },
    });
    if (!project) throw new Error("Project not found or access denied");

    // Don't delete existing embeddings — the indexer diffs per-file
    // using contentHash and only re-processes changed/new files.
    
    // Reset indexing status
    await indexingManager.resetIndexing(projectId);

    // Start indexing using IndexingManager
    const result = await indexingManager.startIndexing(projectId, project.githubUrl!, project.githubToken || undefined);

    if (!result.success) {
      return { error: result.message };
    }

    return { success: true, message: result.message };
  } catch (error: any) {
    return { error: error?.message || 'Failed to reindex project' };
  }
}

export async function submitCreateForm(formdata: TFormData) {
  try {
    const result = createFormSchema.safeParse(formdata); // Server-side validation

    if (!result.success) {
      throw new Error("Invalid form data.");
    }

    const { userId } = await auth();
    if (!userId) throw new Error("User not found.");

    // Pre-check credits so users can't create a project they can't afford.
    // The actual deduction happens on success inside the indexer (charge-on-
    // success), so failed files are never billed. Free if BYO embedding keys.
    const fileCount = await countGithubRepoFiles(result.data.repoUrl, result.data.githubToken || undefined);
    const indexingBillsCredits = await shouldCharge(userId, "EMBEDDING");
    if (indexingBillsCredits) {
      const creditsNeeded = fileCount * CREDIT_COSTS.INDEX;
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { credits: true } });
      if (!user || user.credits < creditsNeeded) {
        throw new Error(`Insufficient credits. Required: ${creditsNeeded}.`);
      }
    }

    const { project, remainingCredits } = await prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          name: result.data.projectName,
          githubUrl: result.data.repoUrl,
          githubToken: result.data.githubToken || null,
          userToProject: { create: { userId: userId! } },
        },
      });

      const userAfter = await tx.user.findUnique({ where: { id: userId }, select: { credits: true } });
      return { project: created, remainingCredits: userAfter?.credits ?? null };
    });

    if (!project) throw new Error("Failed to create the project.");

    // Start indexing using IndexingManager
    // This handles isolation, progress tracking, and fault tolerance
    await indexingManager.startIndexing(project.id, project.githubUrl!, project.githubToken || undefined).catch(err => {
      logError('BackgroundIndexing', 'Background indexing error:', { projectId: project.id, message: err.message });
    });

    const suffix = typeof remainingCredits === 'number' ? ` Remaining credits: ${remainingCredits}.` : '';
    return { success: `Project "${project.name}" created successfully! Indexing has started in the background.${suffix}`, projectId: project.id };
  } catch (error: any) {
    logError('ProjectCreation', 'Error creating project:', error);
    const message = error?.message || "Failed to create the project. Please try again.";
    return { error: message };
  }
}

export async function getProjects() {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error("User not found.");

    const projects = await prisma.project.findMany({
      where: {
        userToProject: {
          some: {
            userId: userId!,
          },
        },
        deletedAt: null,
      },
      orderBy: {
        createdAt: "desc",
      }
    });

    return projects;
  } catch (error: any) {
    logError('GetProjects', 'Error fetching projects:', error.message);
    return [];
  }
}

/**
 * Poll for new commits and, when any were found, re-index incrementally.
 *
 * Indexing diffs files by blob SHA, so refreshing an otherwise unchanged
 * project costs one tree request and no file downloads. Without this, the
 * stored source stayed frozen at the last manual re-index.
 */
async function pollCommitsAndRefreshCodebase(projectId: string, githubUrl: string) {
  const result = await pollCommits(projectId, githubUrl)

  if (result.count > 0) {
    const status = await indexingManager.getStatus(projectId)
    if (!status.isActive) {
      await indexingManager.startIndexing(projectId, githubUrl)
    }
  }

  return result
}

export async function getProjectCommits(projectId: string, githubUrl?: string) {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error("User not found.");

    // Start polling commits in the background via IndexingManager
    // This ensures proper isolation and doesn't block the response
    if (githubUrl) {
      // Get current status to avoid starting if already polling
      const status = await indexingManager.getStatus(projectId);
      if (!status.isActive) {
        Promise.resolve().then(async () => {
          try {
            await pollCommitsAndRefreshCodebase(projectId, githubUrl);
          } catch (e) {
            const errorDetails = e && typeof e === 'object' ? e : 'Unknown error';
            logError('PollCommits', 'Error polling commits in background:', errorDetails);
          }
        });
      }
    }

    // Return existing commits immediately
    const commits = await prisma.commit.findMany({
      where: {
        projectId,
      }, orderBy: {
        commitDate: "desc",
      }
    });

    return commits;
  } catch (error) {
    logError('Actions', 'Error occurred:', error);
    return [];
  }
}

// Paginated commits (cursor-based)
export async function getProjectCommitsPage(
  projectId: string,
  opts?: { limit?: number; cursor?: string | null; githubUrl?: string }
) {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error("User not found.");

    const limit = Math.max(1, Math.min(50, opts?.limit ?? 10));
    const cursor = opts?.cursor ?? null;

    // Kick off background polling on first page only (no cursor), same as getProjectCommits
    if (!cursor && opts?.githubUrl) {
      const status = await indexingManager.getStatus(projectId);
      if (!status.isActive) {
        Promise.resolve().then(async () => {
          try {
            await pollCommitsAndRefreshCodebase(projectId, opts.githubUrl!);
          } catch (e) {
            const errorDetails = e && typeof e === 'object' ? e : 'Unknown error';
            logError('PollCommits', 'Error polling commits in background:', errorDetails);
          }
        });
      }
    }

    const commits = await prisma.commit.findMany({
      where: { projectId },
      orderBy: { commitDate: "desc" },
      take: limit + 1,
      ...(cursor
        ? { cursor: { id: cursor }, skip: 1 } // skip the cursor item itself
        : {}),
    });

    let nextCursor: string | null = null;
    let items = commits;
    if (commits.length > limit) {
      const next = commits[limit];
      nextCursor = next.id;
      items = commits.slice(0, limit);
    }

    return { items, nextCursor };
  } catch (error) {
    logError('Actions', 'Error occurred:', error);
    return { items: [], nextCursor: null };
  }
}

export async function archiveProject(projectId: string) {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error("User not found.");

    // Atomically find the project by its ID and user access, and update it.
    // This avoids a separate read query for verification.
    const archivedProject = await prisma.project.update({
      where: {
        id: projectId,
        userToProject: {
          some: {
            userId: userId,
          },
        },
      },
      data: {
        deletedAt: new Date(),
      },
    });

    return { success: true, project: archivedProject };
  } catch (error: any) {
    // Prisma throws an error if the record to update is not found.
    // We can treat that as a "not found or access denied" case.
    logError('ArchiveProject', 'Error archiving project:', error);
    return { success: false, error: "Project not found or access denied." };
  }
}


export async function saveQuestion(projectId: string, question: string, answer:string, fileReferences: any) {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error("User not found.");

    const savedQuestion = await prisma.question.create({
      data: {
        question,
        answer,
        projectId,
        userId,
        fileReferences
      },
    });

    return savedQuestion;
  } catch (error) {
    logError('Actions', 'Error occurred:', error);
    return null;
  }
}

export async function getQuestions(projectId: string) {
  try {
    const questions = await prisma.question.findMany({
      where: {
        projectId,
      },
      include: {
        user: true,
      },
      orderBy: {
        createdAt: "desc",
      }
    });

    return questions;
  } catch (error) {
    logError('Actions', 'Error occurred:', error);
    return null;
  }
}

// Cloudinary upload with streamed progress updates
export async function uploadFileToCloudinary(
  file: File,
  opts?: { folder?: string; resource_type?: "image" | "video" | "raw" | "auto" }
) {
  const progress = createStreamableValue<number>(0);

  const { folder = "uploads", resource_type = "auto" } = opts || {};

  // Wrap upload in a promise and stream progress as the file is piped
  const result: Promise<UploadApiResponse> = new Promise((resolve, reject) => {
    try {
      const totalSize = (file as any).size ? Number((file as any).size) : 0;
      let sent = 0;

      const meter = new Transform({
        transform(chunk, _enc, cb) {
          sent += (chunk as Buffer).length;
          if (totalSize > 0) {
            const pct = Math.min(99, Math.floor((sent / totalSize) * 100));
            progress.update(pct);
          }
          this.push(chunk);
          cb();
        },
      });

      const upload = cloudinary.uploader.upload_stream(
        { folder, resource_type },
        (error, res) => {
          if (error || !res) {
            progress.error(new Error("Cloudinary upload failed"));
            return reject(error || new Error("No response from Cloudinary"));
          }
          progress.update(100);
          progress.done();
          resolve(res as UploadApiResponse);
        }
      );

      // Convert the web ReadableStream from File to a Node stream and pipe
      const nodeReadable = Readable.fromWeb(file.stream() as any);
      nodeReadable.pipe(meter).pipe(upload);
    } catch (err) {
      progress.error(new Error("Upload initialization failed"));
      reject(err);
    }
  });

  return {
    progress: progress.value,
    result,
  };
}

// Meeting actions
export async function createMeeting(projectId: string, name: string, meetingUrl: string) {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error("User not found.");

    // Verify user has access to the project
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        userToProject: {
          some: {
            userId: userId,
          },
        },
      },
    });

    if (!project) throw new Error("Project not found or access denied.");

    // Create the meeting with PROCESSING status by default
    const meeting = await prisma.meeting.create({
      data: {
        name,
        meetingUrl,
        projectId,
        status: "PROCESSING",
      },
    });

    return { success: true, meeting };
  } catch (error: any) {
    logError('CreateMeeting', 'Error creating meeting:', error);
    return { success: false, error: error.message || "Failed to create meeting." };
  }
}

export async function getMeetings(projectId: string) {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error("User not found.");

    // Get all meetings for the project, while also verifying user access in a single query.
    const meetings = await prisma.meeting.findMany({
      where: {
        projectId,
        project: {
          userToProject: {
            some: {
              userId: userId,
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      include: {
        issues: true,
      },
    });

    return { success: true, meetings };
  } catch (error: any) {
    logError('GetMeetings', 'Error fetching meetings:', error);
    return { success: false, error: error.message || "Failed to fetch meetings." };
  }
}

export async function getMeetingById(meetingId: string) {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error("User not found.");

    // Get the meeting and verify user has access to its project
    const meeting = await prisma.meeting.findFirst({
      where: {
        id: meetingId,
        project: {
          userToProject: {
            some: {
              userId: userId,
            },
          },
        },
      },
      include: {
        issues: true,
      },
    });

    if (!meeting) throw new Error("Meeting not found or access denied.");

    return { success: true, meeting };
  } catch (error: any) {
    logError('GetMeeting', 'Error fetching meeting:', error);
    return { success: false, error: error.message || "Failed to fetch meeting." };
  }
}

export async function deleteMeeting(meetingId: string, meetingUrl: string) {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error("User not found.");

    // By performing deletes within a transaction, we make the operation atomic.
    // If any part fails, the entire transaction is rolled back.
    await prisma.$transaction([
      prisma.issue.deleteMany({
        where: {
          meetingId: meetingId,
        },
      }),
      prisma.meeting.delete({
        where: {
          id: meetingId,
          project: {
            userToProject: {
              some: {
                userId: userId,
              },
            },
          },
        },
      }),
    ]);

    // After the transaction is successful, delete the file from Cloudinary
    if (meetingUrl) {
      try {
        const publicId = meetingUrl.split("/").pop()?.split(".")[0];
        if (publicId) {
          await cloudinary.uploader.destroy(publicId, { resource_type: 'video' });
        }
      } catch (cloudinaryError) {
        logError('Cloudinary', 'Cloudinary deletion failed:', cloudinaryError, true); // Log in production since this is billing-related
        // Decide if you want to return an error to the user.
        // For now, we'll just log it and still return success for the DB deletion.
      }
    }

    return { success: true };
  } catch (error: any) {
    logError('DeleteMeeting', 'Error deleting meeting:', error);
    return { success: false, error: "Failed to delete meeting." };
  }
}

export async function getProjectTeam(projectId: string) {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error("User not found.");

    const team = await prisma.userToProject.findMany({
      where: {
        projectId: projectId,
      },
      include: {
        user: true,
      },
    });

    return { success: true, team };
  } catch (error: any) {
    logError('GetProjectTeam', 'Error fetching project team:', error);
    return { success: false, error: error.message || "Failed to fetch project team." };
  }
}

export async function getUserCredits() {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error("User not found.");

    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        credits: true,
      },
    });

    if (!user) throw new Error("User not found in database.");

    return { success: true, credits: user.credits };
  } catch (error: any) {
    logError('GetUserCredits', 'Error fetching user credits:', error);
    return { success: false, error: error.message || "Failed to fetch credits." };
  }
}

// ============================================================
// AI CONFIGURATION
// ============================================================

export interface ProviderConfigView {
  baseUrl: string;
  model: string;
  hasApiKey: boolean; // never return the key itself
  /** Where this section's config would resolve from right now. */
  source: "user" | "server" | "none";
}

export interface AIConfigView {
  chat: ProviderConfigView;
  embedding: ProviderConfigView;
  encryptionEnabled: boolean;
}

function emptySection(source: ProviderConfigView["source"]): ProviderConfigView {
  return { baseUrl: DEFAULT_BASE_URL, model: "", hasApiKey: false, source };
}

export async function getAIConfig(): Promise<{ success: boolean; config?: AIConfigView; error?: string }> {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error("User not found.");

    const rows = await prisma.userAIConfig.findMany({ where: { userId } });
    const byPurpose = new Map(rows.map(r => [r.purpose, r]));

    const chat = byPurpose.get("CHAT");
    const embedding = byPurpose.get("EMBEDDING");

    return {
      success: true,
      config: {
        chat: chat
          ? { baseUrl: chat.baseUrl, model: chat.model, hasApiKey: true, source: "user" }
          : emptySection(hasServerFallback("CHAT") ? "server" : "none"),
        embedding: embedding
          ? { baseUrl: embedding.baseUrl, model: embedding.model, hasApiKey: true, source: "user" }
          : emptySection(hasServerFallback("EMBEDDING") ? "server" : "none"),
        encryptionEnabled: isEncryptionAvailable(),
      },
    };
  } catch (error: any) {
    logError('GetAIConfig', 'Error fetching AI config:', error);
    return { success: false, error: error.message || "Failed to fetch AI config." };
  }
}

export async function saveAIConfigSection(input: {
  purpose: "CHAT" | "EMBEDDING";
  baseUrl: string;
  apiKey: string;
  model: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error("User not found.");

    if (!isEncryptionAvailable()) {
      return { success: false, error: "Server is missing AI_CONFIG_ENCRYPTION_KEY — cannot store API keys." };
    }

    const purpose = input.purpose;
    const baseUrl = (input.baseUrl || "").trim() || DEFAULT_BASE_URL;
    const model = (input.model || "").trim();

    if (!model) {
      return { success: false, error: `${purpose} model is required.` };
    }

    // If the user didn't re-enter their API key, keep the existing one.
    let apiKeyEnc: string;
    const existing = await prisma.userAIConfig.findUnique({
      where: { userId_purpose: { userId, purpose } },
    });
    const apiKey = (input.apiKey || "").trim();
    if (!apiKey) {
      if (!existing) {
        return { success: false, error: "API key is required." };
      }
      apiKeyEnc = existing.apiKeyEnc;
    } else {
      apiKeyEnc = encrypt(apiKey);
    }

    await prisma.userAIConfig.upsert({
      where: { userId_purpose: { userId, purpose } },
      update: { baseUrl, apiKeyEnc, model },
      create: { userId, purpose, baseUrl, apiKeyEnc, model },
    });

    return { success: true };
  } catch (error: any) {
    logError('SaveAIConfig', 'Error saving AI config:', error);
    return { success: false, error: error.message || "Failed to save AI config." };
  }
}

export async function deleteAIConfigSection(input: {
  purpose: "CHAT" | "EMBEDDING";
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error("User not found.");

    await prisma.userAIConfig.deleteMany({
      where: { userId, purpose: input.purpose },
    });

    return { success: true };
  } catch (error: any) {
    logError('DeleteAIConfig', 'Error deleting AI config:', error);
    return { success: false, error: error.message || "Failed to delete AI config." };
  }
}

export async function testAIConfigSection(input: {
  purpose: "CHAT" | "EMBEDDING";
  baseUrl: string;
  apiKey: string;
  model: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error("User not found.");

    const purpose = input.purpose;
    const baseUrl = (input.baseUrl || "").trim() || DEFAULT_BASE_URL;
    const model = (input.model || "").trim();
    if (!model) {
      return { success: false, error: `${purpose} model is required.` };
    }

    // If no API key supplied, reuse the stored (decrypted) key for the test.
    let apiKey = (input.apiKey || "").trim();
    if (!apiKey) {
      const row = await prisma.userAIConfig.findUnique({
        where: { userId_purpose: { userId, purpose } },
      });
      if (!row) return { success: false, error: "No API key to test." };
      try {
        apiKey = decrypt(row.apiKeyEnc);
      } catch {
        // Most likely the server's encryption key was rotated since the key
        // was saved. Ask the user to re-enter it.
        return {
          success: false,
          error: "Stored API key could not be decrypted (the server's encryption key may have changed). Please re-enter your API key and save again.",
        };
      }
    }

    const provider = buildProvider({ apiKey, baseUrl, model });

    if (purpose === "CHAT") {
      try {
        await provider.chat.completions.create({
          model,
          messages: [{ role: "user", content: "Reply with the single word: ok" }],
          max_tokens: 16,
        });
      } catch (e: any) {
        return { success: false, error: `Chat test failed: ${e?.message || e}` };
      }
    } else {
      // EMBEDDING test — dimensions:1024 to match the vector column
      try {
        const response = await provider.embeddings.create({
          model,
          input: "test",
          dimensions: 1024,
        });
        const dim = response.data[0]?.embedding?.length ?? 0;
        if (dim !== 1024) {
          return {
            success: false,
            error: `Embedding model returned ${dim} dimensions, but the database stores 1024. Choose a model that supports dimensions=1024.`,
          };
        }
      } catch (e: any) {
        return { success: false, error: `Embedding test failed: ${e?.message || e}` };
      }
    }

    return { success: true };
  } catch (error: any) {
    logError('TestAIConfig', 'Error testing AI config:', error);
    return { success: false, error: error.message || "Failed to test AI config." };
  }
}

// ============================================================
// CONVERSATIONAL Q&A
// ============================================================

export async function createConversation(projectId: string) {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error("User not found.");

    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        userToProject: { some: { userId } },
      },
    });
    if (!project) throw new Error("Project not found or access denied");

    const conversation = await prisma.conversation.create({
      data: { projectId, title: "New conversation" },
    });

    return { success: true, conversationId: conversation.id };
  } catch (error: any) {
    logError('CreateConversation', 'Error creating conversation:', error);
    return { success: false, error: error.message };
  }
}

export async function getConversations(projectId: string) {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error("User not found.");

    const conversations = await prisma.conversation.findMany({
      where: { projectId, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        updatedAt: true,
        _count: { select: { messages: true } },
      },
    });

    return { success: true, conversations };
  } catch (error: any) {
    logError('GetConversations', 'Error fetching conversations:', error);
    return { success: false, conversations: [] };
  }
}

export async function deleteConversation(conversationId: string) {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error("User not found.");

    // Soft delete: mark as deleted immediately
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { deletedAt: new Date() },
    });

    // Schedule hard delete after 30s (fire-and-forget, off the critical path)
    setTimeout(async () => {
      try {
        await prisma.conversation.delete({
          where: { id: conversationId },
        });
      } catch {
        // Already deleted or doesn't exist — ignore
      }
    }, 30_000);

    return { success: true };
  } catch (error: any) {
    logError('DeleteConversation', 'Error:', error);
    return { success: false, error: error.message };
  }
}

export async function getGraphData(projectId: string, graphType: GraphType) {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error("User not found.");

    const files = await prisma.sourceCodeEmbedding.findMany({
      where: { projectId },
      select: { fileName: true, sourceCode: true, summary: true },
    });

    if (files.length === 0) {
      return { success: true, graph: { nodes: [], links: [] } };
    }

    const graph = await buildGraph(
      files.map(f => ({ fileName: f.fileName, sourceCode: f.sourceCode, summary: f.summary })),
      graphType
    );

    return { success: true, graph };
  } catch (error: any) {
    logError('GetGraphData', 'Error:', error);
    return { success: false, graph: { nodes: [], links: [] } };
  }
}

export async function getConversationMessages(conversationId: string) {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error("User not found.");

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        project: { select: { id: true } },
      },
    });

    if (!conversation) throw new Error("Conversation not found");

    // Verify access
    const access = await prisma.project.findFirst({
      where: {
        id: conversation.projectId,
        userToProject: { some: { userId } },
      },
    });
    if (!access) throw new Error("Access denied");

    return {
      success: true,
      messages: conversation.messages,
      projectId: conversation.projectId,
    };
  } catch (error: any) {
    logError('GetConversationMessages', 'Error fetching messages:', error);
    return { success: false, messages: [], projectId: null };
  }
}

// Shared helper: RAG retrieval + stream AI response + auto-save
async function buildAndStreamResponse(
  conversationId: string,
  content: string,
  projectId: string,
  userId: string
) {
  const stream = createStreamableValue();

  try {
    // Fetch conversation history (last 20 messages to stay within token limits)
    const history = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
      take: 20,
    });

    // RAG retrieval for the latest user message (two-mode logic)
    const queryVector = await aiGenerateEmbeddings(userId, content);
    const VectorQuery = `[${queryVector.join(",")}]`;

    const result = await prisma.$queryRaw`
      SELECT "fileName", "sourceCode", "summary",
      1 - ("summeryEmbeddings" <=> ${VectorQuery}::vector) AS similarity
      from "SourceCodeEmbedding" where
      "projectId" = ${projectId} AND
      1 - ("summeryEmbeddings" <=> ${VectorQuery}::vector) > 0.3
      ORDER BY similarity DESC
      LIMIT 10
    ` as { fileName: string, sourceCode: string, summary: string, similarity: number }[];

    const hasStrongMatch = result.length > 0 && result[0].similarity > 0.3;
    let fileReference: { fileName: string; sourceCode: string; summary: string }[] = [];
    let contextBlock = "";

    if (hasStrongMatch) {
      fileReference = result.map(r => ({ fileName: r.fileName, sourceCode: r.sourceCode, summary: r.summary }));
      for (const data of result) {
        contextBlock += `source: ${data.fileName}
 code content: ${data.sourceCode}
 summary of file: ${data.summary}

`;
      }
    } else {
      const allFiles = await prisma.sourceCodeEmbedding.findMany({
        where: { projectId },
        select: { fileName: true, summary: true },
      });
      contextBlock = `FILE SUMMARIES (${allFiles.length} files):
${allFiles.map(f => `- ${f.fileName}: ${f.summary}`).join("\n")}`;
    }

    // Build the chat messages array (OpenAI format) with system prompt + context
    const chatMessages = [
      {
        role: "system",
        content: hasStrongMatch
          ? `You are a senior software engineer with access to the project's source code. Answer in Markdown format with code snippets where relevant. Base your answer on the code context provided. If the exact file isn't in the context but is referenced by other files, mention what you found and point the user to the relevant files. Be helpful — share what you can deduce from the available context rather than refusing. Do not invent information.

CONTEXT BLOCK (matched files):
${contextBlock}`
          : `You are a senior software engineer helping someone understand a codebase. Below is a list of every file with a short summary. Answer in Markdown format. When relevant, mention which file(s) are related and what they do based on the summaries. If a file is referenced by name but not in the list, mention that it likely exists and suggest the user ask about it specifically. Do not invent files or functionality not described in the summaries.

${contextBlock}`,
      },
      ...history.map(m => ({
        role: m.role,
        content: m.content,
      })),
    ];

    // Stream the AI response and auto-save it
    (async () => {
      // Charge a credit for the message (server fallback only; BYO keys free).
      // Refund automatically if the stream fails.
      let chargeId: string | null = null;
      try {
        if (await shouldCharge(userId, "CHAT")) {
          const charge = await chargeCredits(userId, CREDIT_COSTS.CHAT, "CHAT", {
            projectId,
            description: `Chat: ${content.slice(0, 60)}`,
          });
          chargeId = charge.id;
        }
      } catch (e: any) {
        stream.error(e instanceof InsufficientCreditsError ? e : new Error("Could not start the request."));
        stream.done();
        return;
      }

      let fullResponse = "";
      try {
        for await (const chunk of streamAIChatWithMessages(userId, chatMessages as any)) {
          if (chunk.type === "thinking") {
            stream.update({ type: "thinking", content: chunk.content });
          } else {
            fullResponse += chunk.content;
            stream.update({ type: "answer", content: chunk.content });
          }
        }

        // Save to DB BEFORE signaling stream done
        // so the client's DB refresh finds the message
        await prisma.message.create({
          data: {
            conversationId,
            role: "assistant",
            content: fullResponse,
            fileReferences: fileReference.length > 0 ? fileReference : undefined,
          },
        });

        await prisma.conversation.update({
          where: { id: conversationId },
          data: { updatedAt: new Date() },
        });

        stream.done();
      } catch (error) {
        logError('StreamResponse', `Error streaming response:`, error);
        if (chargeId) await refundCredits(userId, chargeId, "Conversation stream failed");
        if (isNotConfiguredError(error)) {
          stream.error(new Error("AI not configured. Add your API key in Settings."));
        } else {
          stream.error(new Error("Failed to generate response"));
        }
        stream.done();
      }
    })();

    return { output: stream.value, fileReference };
  } catch (error: any) {
    logError('BuildAndStream', 'Error:', error);
    stream.error(new Error(error.message || "Failed to generate response"));
    return { output: stream.value, fileReference: [] };
  }
}

export async function sendMessage(
  conversationId: string,
  content: string,
  projectId: string
) {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error("User not found.");

    // Save user message immediately
    await prisma.message.create({
      data: { conversationId, role: "user", content },
    });

    // Auto-title the conversation from the first user message
    await prisma.conversation.updateMany({
      where: { id: conversationId, title: "New conversation" },
      data: { title: content.slice(0, 50) },
    });

    return await buildAndStreamResponse(conversationId, content, projectId, userId);
  } catch (error: any) {
    logError('SendMessage', 'Error in sendMessage:', error);
    const stream = createStreamableValue();
    stream.error(new Error(error.message || "Failed to send message"));
    return { output: stream.value, fileReference: [] };
  }
}

export async function editMessage(
  messageId: string,
  newContent: string,
  conversationId: string,
  projectId: string
) {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error("User not found.");

    // Find the edited message to get its timestamp
    const editedMessage = await prisma.message.findUnique({
      where: { id: messageId },
      select: { createdAt: true },
    });
    if (!editedMessage) throw new Error("Message not found");

    // Delete the edited message and all messages after it
    await prisma.message.deleteMany({
      where: {
        conversationId,
        createdAt: { gte: editedMessage.createdAt },
      },
    });

    // Create new user message with edited content
    await prisma.message.create({
      data: { conversationId, role: "user", content: newContent },
    });

    return await buildAndStreamResponse(conversationId, newContent, projectId, userId);
  } catch (error: any) {
    logError('EditMessage', 'Error in editMessage:', error);
    const stream = createStreamableValue();
    stream.error(new Error(error.message || "Failed to edit message"));
    return { output: stream.value, fileReference: [] };
  }
}
