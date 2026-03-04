import { logError, logInfo, logDebug } from './logger';
import { indexGithubRepo } from './github-loader';
import { pollCommits, getRepoCommits, PollCommitsProgress } from './github';
import { prisma } from '@/prisma/client';
import crypto from 'crypto';

// Unique server instance ID
const SERVER_ID = crypto.randomUUID();

// Timeout configuration - if no heartbeat in 5 minutes, consider it stuck
const INDEXING_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const HEARTBEAT_INTERVAL_MS = 30 * 1000; // 30 seconds

// Track active indexing jobs in memory
const activeIndexingJobs = new Map<string, {
  projectId: string;
  githubUrl: string;
  githubToken?: string;
  startTime: Date;
  abortController: AbortController;
}>();

type IndexStatus = 'IDLE' | 'INDEXING' | 'COMPLETED' | 'ERROR' | 'TIMEOUT';

/**
 * IndexingManager - Manages project indexing with proper isolation, fault tolerance, and resumption
 */
export class IndexingManager {
  private static instance: IndexingManager | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  private constructor() {
    // Start heartbeat checker
    this.startHeartbeatChecker();
  }

  public static getInstance(): IndexingManager {
    if (!IndexingManager.instance) {
      IndexingManager.instance = new IndexingManager();
    }
    return IndexingManager.instance;
  }

  /**
   * Check if a project is currently being indexed
   */
  public isIndexing(projectId: string): boolean {
    return activeIndexingJobs.has(projectId);
  }

  /**
   * Get all currently active indexing jobs
   */
  public getActiveJobs(): string[] {
    return Array.from(activeIndexingJobs.keys());
  }

  /**
   * Start indexing a project
   * Returns true if indexing was started, false if already indexing
   */
  public async startIndexing(
    projectId: string, 
    githubUrl: string, 
    githubToken?: string
  ): Promise<{ success: boolean; message: string }> {
    // Check if already indexing in this server instance
    if (activeIndexingJobs.has(projectId)) {
      logDebug('IndexingManager', `Project ${projectId} is already being indexed in this instance`);
      return { success: false, message: 'Project is already being indexed' };
    }

    // Check database state
    const existingIndexing = await prisma.projectIndexing.findUnique({
      where: { projectId },
    });

    if (existingIndexing?.status === 'INDEXING') {
      // Check if it's stuck (no heartbeat for > 5 minutes)
      const lastHeartbeat = existingIndexing.lastHeartbeat;
      if (lastHeartbeat && Date.now() - lastHeartbeat.getTime() < INDEXING_TIMEOUT_MS) {
        logDebug('IndexingManager', `Project ${projectId} is being indexed by another instance`);
        return { success: false, message: 'Project is already being indexed by another process' };
      }
      
      // It's stuck, we can take over
      logInfo('IndexingManager', `Taking over stuck indexing for project ${projectId}`);
    }

    // Create abort controller for cancellation support
    const abortController = new AbortController();

    // Store job info
    activeIndexingJobs.set(projectId, {
      projectId,
      githubUrl,
      githubToken,
      startTime: new Date(),
      abortController,
    });

    // Update database to mark as indexing with this server
    await prisma.projectIndexing.upsert({
      where: { projectId },
      update: {
        status: 'INDEXING',
        processed: 0,
        total: 0,
        error: null,
        serverId: SERVER_ID,
        lastHeartbeat: new Date(),
        startedAt: new Date(),
        completedAt: null,
      },
      create: {
        projectId,
        status: 'INDEXING',
        processed: 0,
        total: 0,
        serverId: SERVER_ID,
        lastHeartbeat: new Date(),
        startedAt: new Date(),
      },
    });

    // Start indexing in background
    this.runIndexing(projectId, githubUrl, githubToken, abortController).catch((error) => {
      logError('IndexingManager', `Unexpected error during indexing for ${projectId}:`, error);
      this.markAsError(projectId, error?.message || 'Unknown error');
    });

    logInfo('IndexingManager', `Started indexing for project ${projectId}`);
    return { success: true, message: 'Indexing started' };
  }

  /**
   * Cancel indexing for a project
   */
  public async cancelIndexing(projectId: string): Promise<void> {
    const job = activeIndexingJobs.get(projectId);
    if (job) {
      job.abortController.abort();
      activeIndexingJobs.delete(projectId);
      
      await prisma.projectIndexing.update({
        where: { projectId },
        data: {
          status: 'ERROR',
          error: 'Indexing was cancelled by user',
        },
      });
      
      logInfo('IndexingManager', `Cancelled indexing for project ${projectId}`);
    }
  }

  /**
   * Resume any interrupted indexing on server startup
   */
  public async resumeInterruptedIndexing(): Promise<void> {
    logInfo('IndexingManager', 'Checking for interrupted indexing jobs...');

    // Find all projects stuck in INDEXING state
    const stuckProjects = await prisma.projectIndexing.findMany({
      where: { 
        status: 'INDEXING',
        OR: [
          { serverId: SERVER_ID }, // Our own interrupted jobs
          { lastHeartbeat: { lt: new Date(Date.now() - INDEXING_TIMEOUT_MS) } }, // Timed out jobs
        ],
      },
      include: { project: true },
    });

    if (stuckProjects.length === 0) {
      logInfo('IndexingManager', 'No interrupted indexing jobs found');
      return;
    }

    logInfo('IndexingManager', `Found ${stuckProjects.length} interrupted indexing jobs`);

    for (const stuckProject of stuckProjects) {
      const projectId = stuckProject.projectId;
      const githubUrl = stuckProject.project.githubUrl;
      const githubToken = stuckProject.project.githubToken || undefined;

      logInfo('IndexingManager', `Resuming indexing for project ${projectId}`);

      // Update status to indicate we're taking over
      await prisma.projectIndexing.update({
        where: { projectId },
        data: {
          serverId: SERVER_ID,
          lastHeartbeat: new Date(),
          error: 'Resumed after interruption',
        },
      });

      // Start fresh indexing
      await this.startIndexing(projectId, githubUrl, githubToken);
    }
  }

  /**
   * Update heartbeat for an active indexing job
   */
  public async updateHeartbeat(projectId: string): Promise<void> {
    if (!activeIndexingJobs.has(projectId)) return;

    await prisma.projectIndexing.update({
      where: { projectId },
      data: { lastHeartbeat: new Date() },
    });
  }

  /**
   * Update progress for an active indexing job
   */
  public async updateProgress(projectId: string, processed: number, total: number, currentItem?: string): Promise<void> {
    if (!activeIndexingJobs.has(projectId)) return;

    await prisma.projectIndexing.update({
      where: { projectId },
      data: {
        processed,
        total,
        currentItem: currentItem || null,
        lastHeartbeat: new Date(),
      },
    });
  }

  /**
   * Update current stage (FETCHING, PROCESSING)
   * Only updates when stage actually changes - minimal DB writes
   */
  public async updateStage(projectId: string, stage: string): Promise<void> {
    if (!activeIndexingJobs.has(projectId)) return;

    await prisma.projectIndexing.update({
      where: { projectId },
      data: {
        stage,
        lastHeartbeat: new Date(),
      },
    });

    logDebug('IndexingManager', `Project ${projectId} entered stage: ${stage}`);
  }

  /**
   * Record error summary at completion
   */
  public async recordErrorSummary(projectId: string, successCount: number, failedCount: number): Promise<void> {
    if (!activeIndexingJobs.has(projectId)) return;

    const summary = failedCount > 0
      ? `${successCount} files succeeded, ${failedCount} failed`
      : undefined;

    await prisma.projectIndexing.update({
      where: { projectId },
      data: { errorSummary: summary },
    });
  }

  /**
   * Mark indexing as completed
   */
  public async markAsCompleted(projectId: string, totalProcessed: number, summary?: string): Promise<void> {
    activeIndexingJobs.delete(projectId);

    await prisma.projectIndexing.update({
      where: { projectId },
      data: {
        status: 'COMPLETED',
        processed: totalProcessed,
        total: totalProcessed,
        error: null,
        errorSummary: summary || null,
        completedAt: new Date(),
        lastHeartbeat: new Date(),
      },
    });

    logInfo('IndexingManager', `Completed indexing for project ${projectId}`);
  }

  /**
   * Mark indexing as errored
   */
  public async markAsError(projectId: string, errorMessage: string): Promise<void> {
    activeIndexingJobs.delete(projectId);

    await prisma.projectIndexing.update({
      where: { projectId },
      data: {
        status: 'ERROR',
        error: errorMessage,
        lastHeartbeat: new Date(),
      },
    });

    logError('IndexingManager', `Error during indexing for project ${projectId}: ${errorMessage}`);
  }

  /**
   * Mark indexing as timed out
   */
  public async markAsTimeout(projectId: string): Promise<void> {
    activeIndexingJobs.delete(projectId);

    await prisma.projectIndexing.update({
      where: { projectId },
      data: {
        status: 'TIMEOUT',
        error: 'Indexing timed out - no progress for 5 minutes',
        lastHeartbeat: new Date(),
      },
    });

    logError('IndexingManager', `Indexing timed out for project ${projectId}`);
  }

  /**
   * Reset indexing state to IDLE
   */
  public async resetIndexing(projectId: string): Promise<void> {
    activeIndexingJobs.delete(projectId);

    await prisma.projectIndexing.upsert({
      where: { projectId },
      update: {
        status: 'IDLE',
        processed: 0,
        total: 0,
        error: null,
        serverId: null,
        lastHeartbeat: null,
        startedAt: null,
        completedAt: null,
      },
      create: {
        projectId,
        status: 'IDLE',
      },
    });

    logInfo('IndexingManager', `Reset indexing state for project ${projectId}`);
  }

  /**
   * Get indexing status for a project
   */
  public async getStatus(projectId: string): Promise<{
    status: IndexStatus;
    processed: number;
    total: number;
    message?: string;
    isActive: boolean;
  }> {
    const indexing = await prisma.projectIndexing.findUnique({
      where: { projectId },
    });

    if (!indexing) {
      return { status: 'IDLE', processed: 0, total: 0, isActive: false };
    }

    return {
      status: (indexing.status as IndexStatus) || 'IDLE',
      processed: indexing.processed,
      total: indexing.total,
      message: indexing.error || undefined,
      isActive: activeIndexingJobs.has(projectId),
    };
  }

  /**
   * Private: Run the actual indexing
   */
  private async runIndexing(
    projectId: string,
    githubUrl: string,
    githubToken: string | undefined,
    abortController: AbortController
  ): Promise<void> {
    let commitSummary = '';
    
    try {
      // Index the repository
      const result = await indexGithubRepo(projectId, githubUrl, githubToken);

      // Check if aborted
      if (abortController.signal.aborted) {
        return;
      }

      // Check for unprocessed commits and process them if any
      const unprocessedCount = await this.getUnprocessedCommitCount(projectId, githubUrl);
      
      if (unprocessedCount > 0) {
        // Set stage to COMMIT_DIFFS
        await this.updateStage(projectId, 'COMMIT_DIFFS');
        await this.updateProgress(projectId, 0, unprocessedCount, 'Starting...');
        
        logInfo('IndexingManager', `Processing ${unprocessedCount} commits for project ${projectId}`);
        
        // Poll commits with progress callback
        await pollCommits(projectId, githubUrl, (progress: PollCommitsProgress) => {
          this.updateProgress(projectId, progress.current, progress.total, progress.currentCommit);
        });
        
        // Small delay to let final progress propagate to UI
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Build summary string
        commitSummary = `Indexed ${result.success} files | Summarized ${unprocessedCount} commits`;
      } else {
        commitSummary = `Indexing: ${result.success} files | Commits: No new commits`;
      }

      // Mark as completed with commit summary
      await this.markAsCompleted(projectId, result.success, commitSummary);

    } catch (error: any) {
      if (abortController.signal.aborted) {
        logInfo('IndexingManager', `Indexing cancelled for project ${projectId}`);
        return;
      }

      await this.markAsError(projectId, error?.message || 'Unknown error during indexing');
    }
  }

  /**
   * Private: Get count of unprocessed commits
   */
  private async getUnprocessedCommitCount(projectId: string, githubUrl: string): Promise<number> {
    try {
      const allCommits = await getRepoCommits(githubUrl);
      const processedCommits = await prisma.commit.findMany({
        where: { projectId },
        select: { commitHash: true }
      });
      const processedHashes = new Set(processedCommits.map(c => c.commitHash));
      return allCommits.filter(c => !processedHashes.has(c.commitHash)).length;
    } catch (error) {
      logError('IndexingManager', 'Error getting unprocessed commit count:', error);
      return 0;
    }
  }

  /**
   * Private: Start heartbeat checker
   */
  private startHeartbeatChecker(): void {
    this.heartbeatInterval = setInterval(async () => {
      const now = Date.now();

      for (const [projectId, job] of activeIndexingJobs.entries()) {
        // Check if job has been running too long without progress
        const runtime = now - job.startTime.getTime();
        
        // If running for more than 30 minutes, something is wrong
        if (runtime > 30 * 60 * 1000) {
          logError('IndexingManager', `Indexing for project ${projectId} has been running for 30+ minutes, marking as timeout`);
          await this.markAsTimeout(projectId);
        }
      }

      // Check database for projects that should be ours but we've lost track of
      const ourProjects = await prisma.projectIndexing.findMany({
        where: {
          status: 'INDEXING',
          serverId: SERVER_ID,
        },
      });

      for (const project of ourProjects) {
        if (!activeIndexingJobs.has(project.projectId)) {
          // We have a project marked as indexing but no active job
          // This shouldn't happen, but recover from it
          logError('IndexingManager', `Found orphaned indexing record for ${project.projectId}, marking as error`);
          await this.markAsError(project.projectId, 'Indexing process was lost');
        }
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  /**
   * Clean up on shutdown
   */
  public async shutdown(): Promise<void> {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    // Cancel all active jobs
    const jobs = Array.from(activeIndexingJobs.keys());
    for (const projectId of jobs) {
      await this.cancelIndexing(projectId);
    }

    logInfo('IndexingManager', 'Shutdown complete');
  }
}

// Export singleton instance
export const indexingManager = IndexingManager.getInstance();

// Export server ID for debugging
export { SERVER_ID };