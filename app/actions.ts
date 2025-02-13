"use server"

import { prisma } from "@/prisma/client";
import { createFormSchema, TFormData } from "@/utils/schema";
import { auth } from "@clerk/nextjs/server";

export async function submitCreateForm (formdata: TFormData){
  const result = createFormSchema.safeParse(formdata);
  const { userId }  = await auth()
  if (!result.success) {
    return {error: result.error.format()}
  }

  console.log(result.data)

  const project = await prisma.project.create({
    data: {
      name: result.data.projectName,
      githubUrl: result.data.repoUrl,
      UserToProject: {
        create: {
          userId: userId!
        }
      }
    }
  })

  return {success: `Project created successfully ${project}`}

} 