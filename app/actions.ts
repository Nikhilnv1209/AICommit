"use server";

import { createFormSchema, TFormData } from "@/utils/schema";
import { prisma } from "@/prisma/client";
import { auth } from "@clerk/nextjs/server";
import { pollCommits } from "@/lib/github";
import { indexGithubRepo } from "@/lib/github-loader";

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
      }
    });

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
    if (githubUrl) {
      Promise.resolve().then(async () => {
        try {
          await pollCommits(projectId, githubUrl);
        } catch (e) {
          // Improved error handling
          const errorDetails = e && typeof e === 'object' ? e : 'Unknown error';
          console.error("Error polling commits in background:", errorDetails);
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