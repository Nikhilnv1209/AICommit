export type IndexStatus = 'IDLE' | 'INDEXING' | 'COMPLETED' | 'ERROR';

type ProgressState = {
  status: IndexStatus;
  processed: number;
  total: number;
  message?: string;
};

let prismaInstance: any = null;

async function getPrisma() {
  if (!prismaInstance) {
    const { PrismaClient } = require('@prisma/client');
    prismaInstance = new PrismaClient();
  }
  return prismaInstance;
}

export async function startIndexing(projectId: string) {
  const prisma = await getPrisma();
  // Upsert the indexing record
  await prisma.projectIndexing.upsert({
    where: { projectId },
    update: { 
      status: 'INDEXING', 
      error: null,
      processed: 0,
      total: 0,
      startedAt: new Date(),
      completedAt: null,
    },
    create: { 
      projectId,
      status: 'INDEXING', 
      error: null,
      processed: 0,
      total: 0,
      startedAt: new Date(),
    },
  });
}

export async function setTotal(projectId: string, total: number) {
  const prisma = await getPrisma();
  await prisma.projectIndexing.update({
    where: { projectId },
    data: { total },
  });
}

export async function setProcessed(projectId: string, processed: number) {
  const prisma = await getPrisma();
  await prisma.projectIndexing.update({
    where: { projectId },
    data: { processed },
  });
}

export async function incrementProcessed(projectId: string, inc: number = 1) {
  const prisma = await getPrisma();
  await prisma.projectIndexing.updateMany({
    where: { projectId },
    data: { processed: { increment: inc } },
  });
}

export async function completeIndexing(projectId: string, totalProcessed: number = 0) {
  const prisma = await getPrisma();
  await prisma.projectIndexing.upsert({
    where: { projectId },
    update: { 
      status: 'COMPLETED', 
      error: null,
      processed: totalProcessed,
      completedAt: new Date(),
    },
    create: { 
      projectId,
      status: 'COMPLETED', 
      error: null,
      processed: totalProcessed,
      total: totalProcessed,
      completedAt: new Date(),
    },
  });
}

export async function errorIndexing(projectId: string, message?: string) {
  const prisma = await getPrisma();
  await prisma.projectIndexing.upsert({
    where: { projectId },
    update: { status: 'ERROR', error: message || null },
    create: { projectId, status: 'ERROR', error: message || null },
  });
}

export async function resetIndexing(projectId: string) {
  const prisma = await getPrisma();
  await prisma.projectIndexing.upsert({
    where: { projectId },
    update: { 
      status: 'IDLE', 
      error: null,
      processed: 0,
      total: 0,
      startedAt: null,
      completedAt: null,
    },
    create: { 
      projectId,
      status: 'IDLE', 
      error: null,
      processed: 0,
      total: 0,
    },
  });
}

export async function getIndexingProgress(projectId: string): Promise<ProgressState> {
  const prisma = await getPrisma();
  
  try {
    // First check if indexing record exists
    const indexing = await prisma.projectIndexing.findUnique({
      where: { projectId },
    });

    // If no indexing record exists, check if embeddings exist
    if (!indexing) {
      const embeddingCount = await prisma.sourceCodeEmbedding.count({
        where: { projectId },
      });
      
      if (embeddingCount > 0) {
        return { status: 'COMPLETED', processed: embeddingCount, total: embeddingCount };
      }
      return { status: 'IDLE', processed: 0, total: 0 };
    }

    const dbStatus = (indexing.status || 'IDLE') as IndexStatus;
    
    // Return current status from database as-is
    // Don't auto-complete - let the actual indexer manage state
    if (dbStatus === 'INDEXING') {
      return { 
        status: 'INDEXING', 
        processed: indexing.processed, 
        total: indexing.total,
      };
    }

    // Return current status from database
    const processed = dbStatus === 'COMPLETED' 
      ? (await prisma.sourceCodeEmbedding.count({ where: { projectId } }))
      : indexing.processed;
    
    return { 
      status: dbStatus, 
      processed, 
      total: indexing.total || processed,
      message: indexing.error || undefined 
    };
  } catch (error) {
    console.error('Error getting indexing progress:', error);
    return { status: 'ERROR', processed: 0, total: 0, message: 'Failed to fetch indexing status' };
  }
}

