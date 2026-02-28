import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/prisma/client";

// Force dynamic to prevent caching
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) {
    return new Response("Project ID required", { status: 400 });
  }

  // Verify user has access to the project
  const hasAccess = await prisma.project.findFirst({
    where: {
      id: projectId,
      userToProject: { some: { userId } },
    },
    select: { id: true },
  });

  if (!hasAccess) {
    return new Response("Project not found or access denied", { status: 403 });
  }

  // Set up SSE headers with proxy buffering disabled
  const headers = {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-store, must-revalidate",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // Disable nginx proxy buffering
    "X-Content-Type-Options": "nosniff",
  };

  const stream = new ReadableStream({
    start(controller) {
      let lastStatus: string | null = null;
      let lastStage: string | undefined = undefined;
      let lastProcessed = -1;
      let lastTotal = -1;
      let lastCurrentItem: string | undefined = undefined;
      let isActive = true;

      // Send data to client
      const sendData = (data: any) => {
        if (!isActive) return;
        try {
          controller.enqueue(`data: ${JSON.stringify(data)}\n\n`);
        } catch (e) {
          // Client disconnected
          isActive = false;
        }
      };

      // Check progress and send updates
      const checkProgress = async () => {
        if (!isActive) return;

        try {
          // Use $queryRaw to bypass Prisma's query cache and force a fresh database read
          const indexingRows = await prisma.$queryRaw`
            SELECT status, stage, processed, total, error, "errorSummary", "currentItem"
            FROM "ProjectIndexing"
            WHERE "projectId" = ${projectId}
          `;
          const indexing = Array.isArray(indexingRows) && indexingRows.length > 0 ? indexingRows[0] : null;

          let status: string;
          let stage: string | undefined;
          let processed: number;
          let total: number;
          let message: string | undefined;
          let errorSummary: string | undefined;
          let currentItem: string | undefined;

          if (!indexing) {
            // Check if embeddings exist
            const embeddingCount = await prisma.sourceCodeEmbedding.count({
              where: { projectId },
            });

            if (embeddingCount > 0) {
              status = "COMPLETED";
              processed = embeddingCount;
              total = embeddingCount;
            } else {
              status = "IDLE";
              processed = 0;
              total = 0;
            }
          } else {
            status = indexing.status;
            stage = indexing.stage || undefined;
            processed = Number(indexing.processed);
            total = Number(indexing.total);
            message = indexing.error || undefined;
            errorSummary = indexing.errorSummary || undefined;
            currentItem = indexing.currentItem || undefined;
          }

          // Only send if something changed or it's the first check
          const hasChanged =
            lastStatus !== status ||
            lastStage !== stage ||
            lastProcessed !== processed ||
            lastTotal !== total ||
            lastCurrentItem !== currentItem;

          if (hasChanged) {
            lastStatus = status;
            lastStage = stage;
            lastProcessed = processed;
            lastTotal = total;
            lastCurrentItem = currentItem;

            sendData({ status, stage, processed, total, message, errorSummary, currentItem });
          }

          // Keep connection alive with heartbeat if indexing
          if (status === "INDEXING") {
            setTimeout(checkProgress, 100); // Poll every 100ms during indexing for smoother updates
          } else {
            // Send heartbeat every 30 seconds when idle
            setTimeout(checkProgress, 30000);
          }
        } catch (error) {
          console.error("Error checking indexing progress:", error);
          sendData({
            status: "ERROR",
            processed: 0,
            total: 0,
            message: "Failed to fetch progress",
          });
          setTimeout(checkProgress, 5000);
        }
      };

      // Start checking
      checkProgress();

      // Handle client disconnect
      req.signal.addEventListener("abort", () => {
        isActive = false;
        controller.close();
      });
    },
  });

  return new Response(stream, { headers });
}
