import { Document } from 'langchain/document';
import { batchProcessDocuments } from './ai';
import { prisma } from '@/prisma/client';
import { indexingManager } from '@/lib/indexing-manager';
import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { devError, logError, logInfo, logDebug, logWarning } from './logger';

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

// Fallback rate limit used only until the first response reveals GitHub's real quota.
const GITHUB_RATE_LIMIT_FALLBACK = 5000;

// Maximum concurrent database operations
const MAX_DB_CONCURRENCY = 5; // Adjust based on your DB connection limit

class GithubRateLimiter {
  private static instance: GithubRateLimiter | null = null;
  private queue: Array<() => Promise<any>> = [];
  private processing: boolean = false;

  // Real rate-limit state, updated from GitHub response headers on every request.
  private rateLimitLimit: number = GITHUB_RATE_LIMIT_FALLBACK;
  private rateLimitRemaining: number = GITHUB_RATE_LIMIT_FALLBACK;
  private rateLimitReset: number = 0; // epoch ms when the window resets

  private constructor() {}

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
          devError('Error processing task:', error);
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

  /**
   * Proactively wait if the real GitHub quota is exhausted, using headers
   * received from prior responses. Falls back to the hardcoded limit only
   * before the first response has been seen.
   */
  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();

    // If the reset window has passed, assume the quota has refreshed.
    if (this.rateLimitReset > 0 && now >= this.rateLimitReset) {
      this.rateLimitRemaining = this.rateLimitLimit;
    }

    if (this.rateLimitRemaining <= 0) {
      const waitMs = this.rateLimitReset > 0
        ? Math.max(this.rateLimitReset - now, 0) + 1000
        : 60 * 1000; // fallback wait if reset time unknown
      logWarning('GitHubAPI', true, `Rate limit reached (0/${this.rateLimitLimit} remaining). Waiting ${Math.round(waitMs / 1000)}s until reset.`);
      await new Promise(resolve => setTimeout(resolve, waitMs));
      this.rateLimitRemaining = this.rateLimitLimit;
    }
  }

  /**
   * Update internal rate-limit state from GitHub response headers.
   */
  private updateRateLimitFromHeaders(headers: any): void {
    const limit = parseInt(headers?.['x-ratelimit-limit'] || '');
    const remaining = parseInt(headers?.['x-ratelimit-remaining'] || '');
    const reset = parseInt(headers?.['x-ratelimit-reset'] || '');
    if (!Number.isNaN(limit) && limit > 0) this.rateLimitLimit = limit;
    if (!Number.isNaN(remaining) && remaining >= 0) this.rateLimitRemaining = remaining;
    if (!Number.isNaN(reset) && reset > 0) this.rateLimitReset = reset * 1000; // epoch sec -> ms
  }

  private async githubApiFetch(url: string, options: AxiosRequestConfig = {}): Promise<AxiosResponse> {
    await this.enforceRateLimit();

    // Log the real remaining quota (or fallback estimate before first response).
    const resetsInMin = this.rateLimitReset > 0
      ? Math.max(0, Math.round((this.rateLimitReset - Date.now()) / 60000))
      : null;
    logDebug('GitHubAPI', `GET ${url} \u00b7 ${this.rateLimitRemaining}/${this.rateLimitLimit} remaining${resetsInMin !== null ? ` (resets in ${resetsInMin}m)` : ''}`);

    try {
      const response = await axios.get(url, options);
      // Track GitHub's real rate-limit quota from response headers.
      this.updateRateLimitFromHeaders(response.headers);
      return response;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 403 && error.response.headers['x-ratelimit-remaining'] === '0') {
        this.updateRateLimitFromHeaders(error.response.headers);
        const resetTime = parseInt(error.response.headers['x-ratelimit-reset'] || '0') * 1000;
        const waitTime = Math.max(resetTime - Date.now(), 0) + 1000;
        logWarning('GitHubAPI', true, `Rate limit exceeded. Waiting ${Math.round(waitTime / 1000)}s until ${new Date(resetTime).toISOString()}.`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        return this.githubApiFetch(url, options);
      }
      throw error;
    }
  }

  private async fetchRawContent(url: string): Promise<string> {
    logDebug('GitHubRaw', `Fetching content: ${url}`);
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

  public async loadGithubRepo(
    githubUrl: string,
    githubToken?: string,
    onProgress?: (processed: number, currentFile: string) => Promise<void> | void
  ): Promise<Document[]> {
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
            if (onProgress) await onProgress(docs.length, item.path);
          } catch (error:any) {
            logWarning('GitHubLoader', `Skipping file ${item.path} due to fetch error: ${error.message}`);
          }
        } else if (item.type === 'dir') {
          await processDirectory(item.path);
        }
      }
    };

    await processDirectory();
    logInfo('GitHubLoader', `Loaded ${docs.length} documents from repository: ${githubUrl}`);
    return docs;
  }
}

/** Process embeddings in controlled batches to avoid connection limit issues */
async function processEmbeddingsInBatches(
  embeddings: Array<{ sourceCode: string; fileName: string; summary: string; embedding: any }>,
  projectId: string,
  concurrency: number,
  onProgress?: (processed: number) => void
): Promise<{ success: number; failed: number }> {
  const results: Array<{ success: boolean; id?: string; fileName: string; error?: any }> = [];
  let activePromises: Promise<any>[] = [];
  let processedCount = 0;

  for (let i = 0; i < embeddings.length; i++) {
    const embedding = embeddings[i];
    logDebug('EmbeddingProcessor', `Processing entry ${i + 1} of ${embeddings.length}`);

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

        processedCount += 1;
        logDebug('EmbeddingProcessor', `Created embedding ${i + 1} of ${embeddings.length} for file ${embedding.fileName}`);
        if (onProgress) onProgress(processedCount);
        return { success: true, id: sourceCodeEmbedding.id, fileName: embedding.fileName };
      } catch (err: any) {
        logError('EmbeddingProcessor', `Error saving embedding ${i + 1} of ${embeddings.length} for ${embedding.fileName}:`, {
          message: err.message,
          stack: err.stack,
        });
        processedCount += 1; // count failed as processed for progress visibility
        if (onProgress) onProgress(processedCount);
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

/** Index a GitHub repository with IndexingManager integration */
export const indexGithubRepo = async (projectId: string, githubUrl: string, githubToken?: string) => {
  const rateLimiter = GithubRateLimiter.getInstance();
  try {
    logInfo('Indexing', `Starting indexing for project ${projectId}`);

    // Stage 1: FETCHING - loading files from GitHub
    await indexingManager.updateStage(projectId, 'FETCHING');
    // Small delay to allow SSE to propagate the stage change to clients
    await new Promise(resolve => setTimeout(resolve, 200));
    const effectiveToken = githubToken || process.env.GITHUB_TOKEN;

    // Determine total file count upfront so the FETCHING stage shows real progress
    let fetchTotal = 0;
    try {
      fetchTotal = await countGithubRepoFiles(githubUrl, effectiveToken);
    } catch {
      // Count is best-effort; fetching continues without a total
    }
    await indexingManager.updateProgress(projectId, 0, fetchTotal, 'Fetching files...');

    const docs = await rateLimiter.loadGithubRepo(
      githubUrl,
      effectiveToken,
      async (processed, fileName) => {
        const total = fetchTotal > 0 ? fetchTotal : processed;
        await indexingManager.updateProgress(projectId, processed, total, fileName);
      }
    );
    logInfo('Indexing', `Loaded ${docs.length} documents for project ${projectId}`);

    // Stage 2: PROCESSING - generating summaries, embeddings, and saving to DB
    await indexingManager.updateStage(projectId, 'PROCESSING');
    // Small delay to allow SSE to propagate the stage change to clients
    await new Promise(resolve => setTimeout(resolve, 200));

    // Process documents with progress updates throughout the entire stage
    const results = await batchProcessDocuments(
      docs,
      async (processed, fileName) => {
        // Update progress as each file is processed (summary + embedding generated)
        await indexingManager.updateProgress(projectId, processed, docs.length, fileName);
        logDebug('Indexing', `Progress: ${processed}/${docs.length} - ${fileName}`);
      }
    );

    logInfo('Indexing', `Generated ${results.length} embeddings for project ${projectId}`);

    // Save all embeddings to database
    const { success, failed } = await processEmbeddingsInBatches(
      results,
      projectId,
      MAX_DB_CONCURRENCY
    );

    // Record summary for error display
    await indexingManager.recordErrorSummary(projectId, success, failed);

    // Small delay to let final progress (100%) propagate to UI before stage changes
    await new Promise(resolve => setTimeout(resolve, 500));

    logInfo('IndexingComplete', `Repo indexing completed. Success: ${success}, Failed: ${failed}`, true);
    return { success, failed };
  } catch (error: any) {
    logError('IndexingError', 'Error indexing GitHub repository:', {
      projectId,
      githubUrl,
      message: error.message,
      stack: error.stack,
    });
    throw error;
  }
};

/** Count eligible files in a GitHub repo (used for credit checks) - OPTIMIZED: Uses Git Trees API (3 calls instead of N) */
export const countGithubRepoFiles = async (githubUrl: string, githubToken?: string): Promise<number> => {
  const rateLimiter = GithubRateLimiter.getInstance();
  const [_, __, ___, owner, repo] = githubUrl.split('/');
  
  // Use user token if provided, otherwise fall back to environment token for better rate limits
  const effectiveToken = githubToken || process.env.GITHUB_TOKEN;
  const headers = effectiveToken ? { Authorization: `token ${effectiveToken}` } : {};

  // Step 1: Get default branch name (1 API call)
  const repoUrl = `https://api.github.com/repos/${owner}/${repo}`;
  const repoResponse = await rateLimiter.apiGet(repoUrl, { headers });
  const defaultBranch = repoResponse.data.default_branch || 'main';

  // Step 2: Get the latest commit SHA of the default branch (1 API call)
  const branchUrl = `https://api.github.com/repos/${owner}/${repo}/branches/${defaultBranch}`;
  const branchResponse = await rateLimiter.apiGet(branchUrl, { headers });
  const commitSha = branchResponse.data.commit.sha;

  // Step 3: Get entire tree recursively (1 API call - returns ALL files in one response)
  const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${commitSha}?recursive=1`;
  const treeResponse = await rateLimiter.apiGet(treeUrl, { headers });
  
  // Count files, excluding ignored extensions
  const count = treeResponse.data.tree
    ? treeResponse.data.tree.filter((item: any) => 
        item.type === 'blob' && !IGNORE_FILES.some((f: string) => item.path.toLowerCase().endsWith(f))
      ).length
    : 0;

  return count;
}
