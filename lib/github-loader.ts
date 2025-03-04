import { GithubRepoLoader } from '@langchain/community/document_loaders/web/github';
import { getDefaultBranch } from './github';
import { batchProcessDocuments } from './gemini';
import { prisma } from '@/prisma/client';

// GitHub API rate limits (unauthenticated)
const GITHUB_RATE_LIMIT = {
  maxRequestsPerHour: 60, // 1 request per minute
  cooldownMs: 60 * 1000, // 1 minute
};

// Queue item for GitHub requests
interface GithubQueueItem<T> {
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: any) => void;
  retryCount: number;
  addedAt: number;
}

// Rate limiter class for GitHub API
class GithubRateLimiter {
  private queue: GithubQueueItem<any>[] = [];
  private requestsThisHour: number = 0;
  private lastResetTime: number = Date.now();
  private processingQueue: boolean = false;
  private readonly maxRetries: number = 5;

  constructor() {}

  async enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        execute: fn,
        resolve,
        reject,
        retryCount: 0,
        addedAt: Date.now(),
      });

      if (!this.processingQueue) {
        this.processQueue();
      }
    });
  }

  private async processQueue() {
    if (this.queue.length === 0) {
      this.processingQueue = false;
      return;
    }

    this.processingQueue = true;

    const now = Date.now();
    if (now - this.lastResetTime >= GITHUB_RATE_LIMIT.cooldownMs) {
      this.requestsThisHour = 0;
      this.lastResetTime = now;
    }

    if (this.requestsThisHour >= GITHUB_RATE_LIMIT.maxRequestsPerHour) {
      const timeToWait = GITHUB_RATE_LIMIT.cooldownMs - (now - this.lastResetTime);
      console.log(`GitHub rate limit reached. Waiting ${timeToWait}ms.`);
      setTimeout(() => this.processQueue(), timeToWait);
      return;
    }

    const item = this.queue.shift();
    if (!item) {
      this.processingQueue = false;
      return;
    }

    try {
      this.requestsThisHour++;
      const result = await item.execute();
      item.resolve(result);
    } catch (error: any) {
      if (error.response?.status === 403 && item.retryCount < this.maxRetries) {
        console.log(`GitHub 403 error. Retrying (${item.retryCount + 1}/${this.maxRetries}) after cooldown.`);
        this.queue.push({ ...item, retryCount: item.retryCount + 1 });
        setTimeout(() => this.processQueue(), GITHUB_RATE_LIMIT.cooldownMs);
      } else {
        item.reject(error);
        this.processQueue(); // Continue processing even on failure
      }
    }

    setTimeout(() => this.processQueue(), 100); // Small delay to avoid tight loops
  }
}

// Singleton GitHub rate limiter
const githubRateLimiter = new GithubRateLimiter();

const loadGithubRepo = async (githubUrl: string, githubToken?: string) => {
  const default_branch = await githubRateLimiter.enqueue(() => getDefaultBranch(githubUrl));

  const loader = new GithubRepoLoader(githubUrl, {
    accessToken: githubToken || "",
    branch: default_branch || "main",
    ignoreFiles: [
      'package-lock.json',
      'yarn.lock',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
      'pnpmfile.js',
      '.DS_Store',
      'bun.lockb',
    ],
    recursive: true,
    unknown: "warn",
    maxConcurrency: 5, // Still allows parallel fetching up to rate limit
  });

  try {
    // Wrap loader.load() in rate limiter
    const docs = await githubRateLimiter.enqueue(() => loader.load());
    return docs;
  } catch (error: any) {
    if (error.response?.status === 403) {
      throw new Error("Rate limit hit. Please provide a GitHub token or wait.");
    }
    console.error("Error loading repo:", error);
    throw error;
  }
};

export const indexGithubRepo = async (projectId: string, githubUrl: string, githubToken?: string | undefined) => {
  try {
    // Load the repository documents with rate limiting
    const docs = await loadGithubRepo(githubUrl, githubToken);
    console.log(`Loaded ${docs.length} documents from GitHub repository`);

    // Process documents in batches with existing Gemini rate limiting
    const batchSize = 10;
    const allEmbeddings = await batchProcessDocuments(docs, batchSize);

    // Save embeddings to database
    const results = await Promise.allSettled(
      allEmbeddings.map(async (embedding, index) => {
        console.log(`Processing database entry ${index + 1} of ${allEmbeddings.length}`);

        try {
          const sourceCodeEmbedding = await prisma.sourceCodeEmbedding.create({
            data: {
              sourceCode: embedding.sourceCode,
              fileName: embedding.fileName,
              summary: embedding.summary,
              projectId,
            },
          });

          console.log(`Created embedding ${index + 1} of ${allEmbeddings.length} for file ${embedding.fileName}`);

          await prisma.$executeRaw`
            UPDATE "SourceCodeEmbedding"
            SET "summeryEmbeddings" = ${embedding.embedding}::vector
            WHERE "id" = ${sourceCodeEmbedding.id}
          `;

          return { success: true, id: sourceCodeEmbedding.id, fileName: embedding.fileName };
        } catch (err) {
          console.error(`Error saving embedding for ${embedding.fileName}:`, err);
          return { success: false, error: err, fileName: embedding.fileName };
        }
      })
    );

    const successCount = results.filter((r) => r.status === "fulfilled" && (r.value as any).success).length;
    const failedCount = results.length - successCount;

    console.log(`GitHub repo indexing completed. Success: ${successCount}, Failed: ${failedCount}`);

    return { success: successCount, failed: failedCount };
  } catch (error) {
    console.error("Error indexing GitHub repository:", error);
    throw error;
  }
};