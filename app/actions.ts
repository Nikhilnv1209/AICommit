"use server";
import { createFormSchema, TFormData } from "@/utils/schema";
import { prisma } from "@/prisma/client";
import { auth } from "@clerk/nextjs/server";
import { pollCommits } from "@/lib/github";
import { indexGithubRepo, countGithubRepoFiles } from "@/lib/github-loader";
import { aiGenerateEmbeddings, getStreamProvider, streamAIChat } from './../lib/ai';
import { createStreamableValue } from "@ai-sdk/rsc";
import { logError, logInfo } from '@/lib/logger';
import cloudinary from "@/lib/cloudinary";
import { Readable, Transform } from "node:stream";
import type { UploadApiResponse } from "cloudinary";
import { getIndexingProgress as getProgress, resetIndexing } from "@/lib/indexing-progress";

const pollingProjects = new Set<string>();

export async function askQuestion(question: string, projectId: string) {
  const stream = createStreamableValue();
  const provider = getStreamProvider();

  const queryVector = await aiGenerateEmbeddings(question);
  const VectorQuery = `[${queryVector.join(",")}]`;

  const result = await prisma.$queryRaw`
    SELECT "fileName", "sourceCode", "summary",
    1 - ("summeryEmbeddings" <=> ${VectorQuery}::vector) AS similarity
    from "SourceCodeEmbedding" where
    "projectId" = ${projectId} AND
    1 - ("summeryEmbeddings" <=> ${VectorQuery}::vector) > 0.5
    ORDER BY similarity DESC
    LIMIT 10
  ` as { fileName: string, sourceCode: string, summary: string }[];

  let context = "";
  for (const data of result) {
    context += `source: ${data.fileName}
 code content: ${data.sourceCode}
 summary of file: ${data.summary}

`;
  }

  const prompt = `
    AI assistant is a brand new, powerful, human-like artificial intelligence.
    The traits of AI include expert knowledge, helpfulness, cleverness, and articulateness.
    AI is a well-behaved and well-mannered individual.
    AI will answer all questions in the Markdown format, including code snippets, proper Markdown formatting and emojis. Also include proper indentations and line breaks.
    AI will not answer any questions that are not related to the context provided.
    AI has the sum of all knowledge in their brain, and is able to accurately answer nearly any question about any topic in conversation.
    If the question is asking about code or a specific file, AI will provide the detailed answer, giving step by step instructions, including code snippets.
    START CONTEXT BLOCK
    ${context}
    END OF CONTEXT BLOCK

    START QUESTION
    ${question}
    END OF QUESTION
    AI assistant will take into account any CONTEXT BLOCK that is provided in a conversation.
    If the context does not provide the answer to question, the AI assistant will say, "I'm sorry, but I don't know the answer to that question".
    AI assistant will not apologize for previous responses, but instead will indicate new information was gained.
    AI assistant will not invent anything that is not drawn directly from the context.
  `;

  (async () => {
    try {
      for await (const chunk of streamAIChat(prompt)) {
        stream.update(chunk);
      }
      stream.done();
    } catch (error) {
      logError('AskQuestion', `Error streaming from ${provider.name}:`, error);
      stream.error(new Error("Failed to generate response"));
    }
  })();

  return {
    output: stream.value,
    fileReference: result,
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

    return getProgress(projectId);
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

    // Delete existing embeddings first
    await prisma.sourceCodeEmbedding.deleteMany({ where: { projectId } });
    
    // Reset indexing status
    await resetIndexing(projectId);

    // Start indexing in background
    indexGithubRepo(projectId, project.githubUrl!, project.githubToken || undefined).catch(err => {
      logError('ReindexError', 'Error reindexing project:', { projectId, message: err.message });
    });

    return { success: true, message: 'Reindexing started' };
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

    // Determine required credits (1 per file), then atomically deduct and create project
    const fileCount = await countGithubRepoFiles(result.data.repoUrl, result.data.githubToken || undefined);

    const { project, remainingCredits } = await prisma.$transaction(async (tx) => {
      const dec = await tx.user.updateMany({
        where: { id: userId, credits: { gte: fileCount } },
        data: { credits: { decrement: fileCount } },
      });
      if (dec.count === 0) {
        throw new Error(`Insufficient credits. Required: ${fileCount}.`);
      }

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

    // Start indexing the repo in the background
    // We don't await these operations to avoid timeout issues
    // They will run asynchronously with rate limiting
    if (!pollingProjects.has(project.id)) {
      pollingProjects.add(project.id);
      Promise.resolve().then(async () => {
        try {
          // Index repo files
          if (project.githubToken) {
            await indexGithubRepo(project.id, project.githubUrl!, project.githubToken);
          } else {
            await indexGithubRepo(project.id, project.githubUrl!);
          }

          // Poll commits after indexing is complete
          await pollCommits(project.id, project.githubUrl!);

        } catch (error) {
          logError('BackgroundIndexing', 'Background indexing error:', error);
        } finally {
          pollingProjects.delete(project.id); // Remove from polling set
        }
      });
    }

    const suffix = typeof remainingCredits === 'number' ? ` Remaining credits: ${remainingCredits}.` : '';
    return { success: `Project "${project.name}" created successfully! Indexing has started in the background.${suffix}` };
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

export async function getProjectCommits(projectId: string, githubUrl?: string) {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error("User not found.");

    // Start polling in the background, don't await
    if (githubUrl && !pollingProjects.has(projectId)) {
      pollingProjects.add(projectId);
      Promise.resolve().then(async () => {
        try {
          await pollCommits(projectId, githubUrl);
        } catch (e) {
          // Improved error handling
          const errorDetails = e && typeof e === 'object' ? e : 'Unknown error';
          logError('PollCommits', 'Error polling commits in background:', errorDetails);
        } finally {
          pollingProjects.delete(projectId); // Remove from polling set
        }
      });
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
    if (!cursor && opts?.githubUrl && !pollingProjects.has(projectId)) {
      pollingProjects.add(projectId);
      Promise.resolve().then(async () => {
        try {
          await pollCommits(projectId, opts.githubUrl!);
        } catch (e) {
          const errorDetails = e && typeof e === 'object' ? e : 'Unknown error';
          logError('PollCommits', 'Error polling commits in background:', errorDetails);
        } finally {
          pollingProjects.delete(projectId);
        }
      });
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
