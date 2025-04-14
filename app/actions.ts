"use server";
import { createFormSchema, TFormData } from "@/utils/schema";
import { prisma } from "@/prisma/client";
import { auth } from "@clerk/nextjs/server";
import { pollCommits } from "@/lib/github";
import { indexGithubRepo } from "@/lib/github-loader";
import { aiGenerateEmbeddings } from './../lib/gemini';
import { streamText } from "ai";
import { createStreamableValue } from "ai/rsc";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

const pollingProjects = new Set<string>();

const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY
});

export async function askQuestion(question: string, projectId: string) {
  const stream = createStreamableValue();

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
    context += `source: ${data.fileName}\n code content: ${data.sourceCode}\n summary of file: ${data.summary}\n\n`;
  }

  (async () => {
    const { textStream } = streamText({
      model: google("gemini-2.0-flash-001"),
      prompt: `
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
      `,
    });

    for await (const delta of textStream) {
      stream.update(delta);
    }
    stream.done(); // Ensure the stream is finalized
  })();

  return {
    output: stream.value,
    fileReference: result,
  };
}

export async function submitCreateForm(formdata: TFormData) {
  try {
    const result = createFormSchema.safeParse(formdata); // Server-side validation

    if (!result.success) {
      throw new Error("Invalid form data.");
    }

    const { userId } = await auth();
    if (!userId) throw new Error("User not found.");

    const project = await prisma.project.create({
      data: {
        name: result.data.projectName,
        githubUrl: result.data.repoUrl,
        githubToken: result.data.githubToken || null,
        UserToProject: { create: { userId: userId! } },
      },
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
          console.error("Background indexing error:", error);
        } finally {
          pollingProjects.delete(project.id); // Remove from polling set
        }
      });
    }

    return { success: `Project "${project.name}" created successfully! Indexing has started in the background.` };
  } catch (error) {
    console.log("Error:", error);
    return { error: "Failed to create the project. Please try again." };
  }
}

export async function getProjects() {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error("User not found.");

    const projects = await prisma.project.findMany({
      where: {
        UserToProject: {
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
    console.log("Error: from getProjects", error.message as string);
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
          console.error("Error polling commits in background:", errorDetails);
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
    console.log("Error:", error);
    return [];
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
    console.log("Error:", error);
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
    console.log("Error:", error);
    return null;
  }
}