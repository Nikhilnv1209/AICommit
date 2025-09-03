import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/prisma/client";

const JoinProjectPage = async ({ params }: { params: { projectId: string } }) => {
  const { userId } = await auth();
  const user = await currentUser();

  // The middleware should protect this page, so user and userId should exist.
  // But as a safeguard, we check again.
  if (!userId || !user) {
    redirect("/sign-in");
  }

  // Check if user exists in our DB, if not, create them.
  const dbUser = await prisma.user.findUnique({ where: { id: userId } });

  if (!dbUser) {
    await prisma.user.create({
      data: {
        id: userId,
        emailAddress: user.emailAddresses[0].emailAddress,
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        imageUrl: user.imageUrl,
      },
    });
  }

  // Check if project exists.
  const project = await prisma.project.findUnique({
    where: { id: params.projectId },
  });

  if (!project) {
    // Project not found, redirect to dashboard.
    redirect("/dashboard");
  }

  // Add user to the project. Using upsert to avoid errors if the user is already in the project.
  await prisma.userToProject.upsert({
    where: {
      userId_projectId: {
        userId: userId,
        projectId: params.projectId,
      },
    },
    update: {}, // No update needed if it exists
    create: {
      userId: userId,
      projectId: params.projectId,
    },
  });

  // Redirect to the dashboard.
  redirect("/dashboard");

  return null; // This page doesn't render anything.
};

export default JoinProjectPage;
