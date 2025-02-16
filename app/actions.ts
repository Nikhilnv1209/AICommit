"use server";

import { createFormSchema, TFormData } from "@/utils/schema";
import { prisma } from "@/prisma/client";
import { auth } from "@clerk/nextjs/server";

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
        UserToProject: { create: { userId: userId! } },
      },
    });

    return { success: `Project "${project.name}" created successfully!` };
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
  } catch (error) {
    console.log("Error:", error);
    return [];
  }
}