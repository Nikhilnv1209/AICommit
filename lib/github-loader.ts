import { Document } from 'langchain/document';
import { batchProcessDocuments } from './gemini';
import { prisma } from '@/prisma/client';
import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';

// Shared ignore list for non-source/binary files
const IGNORE_FILES: string[] = [
  '.gitignore',
  'yarn.lock',
  'package-lock.json',
  'pnpm-lock.yaml',
  '.DS_Store',
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg', '.tiff', '.webp', '.ico',
  '.ttf', '.otf', '.woff', '.woff2', '.eot',
  '.bin', '.exe', '.dll', '.so', '.dylib',
  '.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a', '.mid', '.midi',
  '.mp4', '.avi', '.mov', '.wmv', '.mkv',
  '.zip', '.rar', '.tar', '.gz', '.7z', '.xz', '.iso',
  '.pdf',
  '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx',
  '.db', '.sqlite', '.mdb',
  '.obj', '.fbx', '.stl', '.dae', '.dwg', '.dxf',
  '.h5', '.ckpt', '.pth', '.pb',
  '.apk', '.ipa',
  '.jar', '.war',
  '.pak',
];

// GitHub API rate limits for unauthenticated users
const GITHUB_API_RATE_LIMIT = {
  maxRequestsPerHour: 60,
  cooldownMs: 60 * 60 * 1000, // 1 hour in milliseconds
};

// Maximum concurrent database operations
const MAX_DB_CONCURRENCY = 5; // Adjust based on your DB connection limit

class GithubRateLimiter {
  private static instance: GithubRateLimiter | null = null;
  private queue: Array<() => Promise<any>> = [];
  private processing: boolean = false;
  private apiRequestCount: number = 0;
  private lastResetTime: number = Date.now();

  private constructor() {
    setInterval(() => {
      this.apiRequestCount = 0;
      this.lastResetTime = Date.now();
      console.log('API rate limit reset via interval');
    }, GITHUB_API_RATE_LIMIT.cooldownMs);
  }

  public static getInstance(): GithubRateLimiter {
    if (!GithubRateLimiter.instance) {
      GithubRateLimiter.instance = new GithubRateLimiter();
    }
    return GithubRateLimiter.instance;
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (task) {
        try {
          await task();
        } catch (error) {
          console.error('Error processing task:', error);
        }
      }
    }

    this.processing = false;
  }

  public async enqueue<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await task();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      this.processQueue();
    });
  }

  // Public wrappers to reuse internals safely
  public async apiGet(url: string, options: AxiosRequestConfig = {}) {
    return this.githubApiFetch(url, options);
  }

  public async getDefaultBranchPublic(githubUrl: string, githubToken?: string) {
    return this.getDefaultBranch(githubUrl, githubToken);
  }

  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    if (now - this.lastResetTime >= GITHUB_API_RATE_LIMIT.cooldownMs) {
      this.apiRequestCount = 0;
      this.lastResetTime = now;
      console.log('API rate limit reset due to time elapsed');
    }

    if (this.apiRequestCount >= GITHUB_API_RATE_LIMIT.maxRequestsPerHour) {
      const waitTime = GITHUB_API_RATE_LIMIT.cooldownMs - (now - this.lastResetTime);
      console.log(`API rate limit reached (${this.apiRequestCount}/${GITHUB_API_RATE_LIMIT.maxRequestsPerHour}). Waiting ${waitTime}ms until reset.`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.apiRequestCount = 0;
      this.lastResetTime = Date.now();
    }
  }

  private async githubApiFetch(url: string, options: AxiosRequestConfig = {}): Promise<AxiosResponse> {
    await this.enforceRateLimit();
    this.apiRequestCount++;
    console.log(`Making GitHub API request ${this.apiRequestCount}/${GITHUB_API_RATE_LIMIT.maxRequestsPerHour}: ${url}`);

    try {
      const response = await axios.get(url, options);
      return response;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 403 && error.response.headers['x-ratelimit-remaining'] === '0') {
        const resetTime = parseInt(error.response.headers['x-ratelimit-reset'] || '0') * 1000;
        const waitTime = Math.max(resetTime - Date.now(), 0) + 1000;
        console.log(`Rate limit exceeded. Waiting ${waitTime}ms until ${new Date(resetTime).toISOString()}.`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        return this.githubApiFetch(url, options);
      }
      throw error;
    }
  }

  private async fetchRawContent(url: string): Promise<string> {
    console.log(`Fetching raw content: ${url}`);
    const response = await axios.get<string>(url, { responseType: 'text' });
    return response.data;
  }

  private async getDefaultBranch(githubUrl: string, githubToken?: string): Promise<string> {
    const apiUrl = githubUrl.replace('github.com', 'api.github.com/repos');
    const config: AxiosRequestConfig = {
      headers: githubToken ? { Authorization: `token ${githubToken}` } : {},
    };
    const response = await this.githubApiFetch(apiUrl, config);
    return response.data.default_branch || 'main';
  }

  public async loadGithubRepo(githubUrl: string, githubToken?: string): Promise<Document[]> {
    const defaultBranch = await this.enqueue(() => this.getDefaultBranch(githubUrl, githubToken));
    const [_, __, ___, owner, repo] = githubUrl.split('/');
    const baseApiUrl = `https://api.github.com/repos/${owner}/${repo}/contents`;
    const baseRawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${defaultBranch}`;
    const headers = githubToken ? { Authorization: `token ${githubToken}` } : {};

    const docs: Document[] = [];
    

    const fetchContents = async (path: string): Promise<any[]> => {
      const url = `${baseApiUrl}/${path}?ref=${defaultBranch}`;
      const response = await this.githubApiFetch(url, { headers });
      return response.data;
    };

    const processDirectory = async (path: string = ''): Promise<void> => {
      const items = await this.enqueue(() => fetchContents(path));
      for (const item of items) {
        if (item.type === 'file' && !IGNORE_FILES.some((f: string) => item.name.toLowerCase().endsWith(f))) {
          const rawUrl = `${baseRawUrl}/${item.path}`;
          try {
            const content = await this.fetchRawContent(rawUrl);
            docs.push({
              pageContent: content,
              metadata: { source: item.path },
            });
          } catch (error:any) {
            console.warn(`Skipping file ${item.path} due to fetch error: ${error.message}`);
          }
        } else if (item.type === 'dir') {
          await processDirectory(item.path);
        }
      }
    };

    await processDirectory();
    console.log(`Loaded ${docs.length} documents from GitHub repository: ${githubUrl}`);
    return docs;
  }
}

/** Process embeddings in controlled batches to avoid connection limit issues */
async function processEmbeddingsInBatches(
  embeddings: Array<{ sourceCode: string; fileName: string; summary: string; embedding: any }>,
  projectId: string,
  concurrency: number
): Promise<{ success: number; failed: number }> {
  const results: Array<{ success: boolean; id?: string; fileName: string; error?: any }> = [];
  let activePromises: Promise<any>[] = [];

  for (let i = 0; i < embeddings.length; i++) {
    const embedding = embeddings[i];
    console.log(`Processing database entry ${i + 1} of ${embeddings.length}`);

    const promise = (async () => {
      try {
        const sourceCodeEmbedding = await prisma.sourceCodeEmbedding.create({
          data: {
            sourceCode: embedding.sourceCode,
            fileName: embedding.fileName,
            summary: embedding.summary,
            projectId,
          },
        });

        await prisma.$queryRaw`
          UPDATE "SourceCodeEmbedding"
          SET "summeryEmbeddings" = ${embedding.embedding}::vector
          WHERE "id" = ${sourceCodeEmbedding.id}
        `;

        console.log(`Created embedding ${i + 1} of ${embeddings.length} for file ${embedding.fileName}`);
        return { success: true, id: sourceCodeEmbedding.id, fileName: embedding.fileName };
      } catch (err: any) {
        console.error(`Error saving embedding ${i + 1} of ${embeddings.length} for ${embedding.fileName}:`, {
          message: err.message,
          stack: err.stack,
        });
        return { success: false, error: err, fileName: embedding.fileName };
      }
    })();

    activePromises.push(promise);

    if (activePromises.length >= concurrency || i === embeddings.length - 1) {
      const batchResults = await Promise.all(activePromises);
      results.push(...batchResults);
      activePromises = []; // Reset for next batch
    }
  }

  const successCount = results.filter(r => r.success).length;
  const failedCount = results.length - successCount;
  return { success: successCount, failed: failedCount };
}

/** Index a GitHub repository */
export const indexGithubRepo = async (projectId: string, githubUrl: string, githubToken?: string) => {
  const rateLimiter = GithubRateLimiter.getInstance();
  try {
    const docs = await rateLimiter.loadGithubRepo(githubUrl, githubToken);
    const batchSize = 10;
    const allEmbeddings = await batchProcessDocuments(docs, batchSize);

    const { success, failed } = await processEmbeddingsInBatches(allEmbeddings, projectId, MAX_DB_CONCURRENCY);

    console.log(`GitHub repo indexing completed. Success: ${success}, Failed: ${failed}`);
    return { success, failed };
  } catch (error: any) {
    console.error('Error indexing GitHub repository:', {
      projectId,
      githubUrl,
      message: error.message,
      stack: error.stack,
    });
    throw error;
  }
};

/** Count eligible files in a GitHub repo (used for credit checks) */
export const countGithubRepoFiles = async (githubUrl: string, githubToken?: string): Promise<number> => {
  const rateLimiter = GithubRateLimiter.getInstance();
  const defaultBranch = await rateLimiter.enqueue(() => rateLimiter.getDefaultBranchPublic(githubUrl, githubToken));
  const [_, __, ___, owner, repo] = githubUrl.split('/');
  const baseApiUrl = `https://api.github.com/repos/${owner}/${repo}/contents`;
  const headers = githubToken ? { Authorization: `token ${githubToken}` } : {};

  let count = 0;

  const fetchContents = async (path: string): Promise<any[]> => {
    const url = `${baseApiUrl}/${path}?ref=${defaultBranch}`;
    const response = await rateLimiter.apiGet(url, { headers });
    return response.data;
  };

  const processDirectory = async (path: string = ''): Promise<void> => {
    const items = await rateLimiter.enqueue(() => fetchContents(path));
    for (const item of items) {
      if (item.type === 'file' && !IGNORE_FILES.some((f: string) => item.name.toLowerCase().endsWith(f))) {
        count += 1;
      } else if (item.type === 'dir') {
        await processDirectory(item.path);
      }
    }
  };

  await processDirectory();
  return count;
}
