import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/prisma/client";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";

const JoinProjectPage = async ({ params }: { params: Promise<{ projectId: string }> }) => {
  const { projectId } = await params;
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
    where: { id: projectId },
  });

  if (!project) {
    recordAudit.request({
      action: AUDIT_ACTIONS.PROJECT_JOIN,
      status: "failure",
      actorId: userId,
      projectId,
      error: "project_not_found",
    });
    // Project not found, redirect to dashboard.
    redirect("/dashboard");
  }

  // Add user to the project. Using upsert to avoid errors if the user is already in the project.
  await prisma.userToProject.upsert({
    where: {
      userId_projectId: {
        userId: userId,
        projectId: projectId,
      },
    },
    update: {}, // No update needed if it exists
    create: {
      userId: userId,
      projectId: projectId,
    },
  });

  recordAudit.request({
    action: AUDIT_ACTIONS.PROJECT_JOIN,
    actorId: userId,
    projectId: projectId,
    target: project.name,
  });

  // Redirect to the dashboard.
  redirect("/dashboard");

  return null; // This page doesn't render anything.
};

export default JoinProjectPage;
