import { Document } from '@langchain/core/documents';
import winston from 'winston';

// Configure Winston logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => `${timestamp} [${level}]: ${message}`)
  ),
  transports: [new winston.transports.Console()],
});

// ============================================================
// PROVIDER TYPES
// ============================================================

export type ProviderType = 'opencode' | 'cohere';

export interface AIProvider {
  summarize(prompt: string): Promise<string>;
  name: string;
}

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  name: string;
}

// ============================================================
// UNIFIED RATE LIMITER
// ============================================================

interface QueueItem<T> {
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
  retryCount: number;
  addedAt: number;
}

interface RateLimitConfig {
  maxRequestsPerMinute: number;
  cooldownMs: number;
}

const DEFAULT_RATE_LIMITS: Record<string, RateLimitConfig> = {
  'deepseek-v4-flash': { maxRequestsPerMinute: 60, cooldownMs: 60000 },
  'embed-english-v3.0': { maxRequestsPerMinute: 2000, cooldownMs: 60000 },
  'embed-english-light-v3.0': { maxRequestsPerMinute: 2000, cooldownMs: 60000 },
  'embed-multilingual-v3.0': { maxRequestsPerMinute: 2000, cooldownMs: 60000 },
  'embed-multilingual-light-v3.0': { maxRequestsPerMinute: 2000, cooldownMs: 60000 },
  'embed-v4.0': { maxRequestsPerMinute: 2000, cooldownMs: 60000 },
};

class UnifiedRateLimiter {
  private queue: QueueItem<any>[] = [];
  private requestsThisMinute: number = 0;
  private lastResetTime: number = Date.now();
  private processingQueue: boolean = false;
  private readonly maxRetries: number = 3;
  private readonly modelName: string;
  private readonly maxRequestsPerMinute: number;
  private readonly cooldownMs: number;

  constructor(modelName: string) {
    this.modelName = modelName;
    const config = DEFAULT_RATE_LIMITS[modelName] || { maxRequestsPerMinute: 30, cooldownMs: 60000 };
    this.maxRequestsPerMinute = config.maxRequestsPerMinute;
    this.cooldownMs = config.cooldownMs;
    logger.info(`Initialized rate limiter for ${modelName}: ${this.maxRequestsPerMinute} req/min`);
  }

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

  private async processQueue(): Promise<void> {
    if (this.queue.length === 0) {
      this.processingQueue = false;
      return;
    }

    this.processingQueue = true;
    const now = Date.now();

    if (now - this.lastResetTime > this.cooldownMs) {
      this.requestsThisMinute = 0;
      this.lastResetTime = now;
    }

    if (this.requestsThisMinute >= this.maxRequestsPerMinute) {
      const timeToWait = this.cooldownMs - (now - this.lastResetTime);
      setTimeout(() => this.processQueue(), timeToWait);
      return;
    }

    const item = this.queue.shift();
    if (!item) {
      this.processingQueue = false;
      return;
    }

    try {
      this.requestsThisMinute++;
      const result = await item.execute();
      item.resolve(result);
      setTimeout(() => this.processQueue(), 50);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (errorMsg.includes('429') || errorMsg.toLowerCase().includes('rate limit')) {
        const retryCount = item.retryCount + 1;
        if (retryCount <= this.maxRetries) {
          this.queue.push({ ...item, retryCount });
          setTimeout(() => this.processQueue(), this.cooldownMs);
        } else {
          item.reject(error);
          setTimeout(() => this.processQueue(), 50);
        }
      } else {
        item.reject(error);
        setTimeout(() => this.processQueue(), 50);
      }
    }
  }
}

const rateLimiters: Map<string, UnifiedRateLimiter> = new Map();

function getRateLimiter(modelName: string): UnifiedRateLimiter {
  if (!rateLimiters.has(modelName)) {
    rateLimiters.set(modelName, new UnifiedRateLimiter(modelName));
  }
  return rateLimiters.get(modelName)!;
}

// ============================================================
// OPENCODE ZEN PROVIDER (Summarization + Chat — OpenAI-compatible)
// ============================================================

const OPENCODE_BASE_URL = process.env.OPENCODE_BASE_URL || 'https://opencode.ai/zen/v1';
const OPENCODE_API_KEY = process.env.OPENCODE_API_KEY || 'public';
const OPENCODE_MODEL = process.env.OPENCODE_MODEL || 'deepseek-v4-flash';

class OpenCodeProvider implements AIProvider {
  name = 'opencode';
  private client: any;
  private model: string;

  constructor() {
    const OpenAI = require('openai');
    this.client = new OpenAI({
      apiKey: OPENCODE_API_KEY,
      baseURL: OPENCODE_BASE_URL,
    });
    this.model = OPENCODE_MODEL;
    logger.info(`OpenCode provider initialized: baseURL=${OPENCODE_BASE_URL}, model=${this.model}`);
  }

  async summarize(prompt: string): Promise<string> {
    const limiter = getRateLimiter(this.model);
    return limiter.enqueue(async () => {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 8000,
      });
      const msg = response.choices[0]?.message;
      const content = msg?.content;
      // Some OpenAI-compatible models (e.g. reasoning models) put the answer
      // in reasoning_content and leave content null on the first pass.
      const fallback = (msg as any)?.reasoning_content || (msg as any)?.reasoning;
      const result = (content && content.trim())
        ? content
        : (fallback && fallback.trim())
          ? fallback
          : '';
      if (!result) {
        logger.warn(`[OpenCodeProvider] Empty response from ${this.model}. message=${JSON.stringify(msg)}`);
      }
      return result || 'No summary available.';
    });
  }
}

// ============================================================
// COHERE PROVIDER (Embeddings only)
// ============================================================

class CohereProvider implements EmbeddingProvider {
  name = 'cohere';
  private client: any;
  private embedModel: string;

  constructor() {
    const { CohereClientV2 } = require('cohere-ai');
    this.client = new CohereClientV2({
      token: process.env.COHERE_API_KEY ?? '',
    });
    this.embedModel = process.env.COHERE_EMBED_MODEL || 'embed-english-v3.0';
    logger.info(`Cohere provider initialized with model: ${this.embedModel}`);
  }

  async embed(text: string): Promise<number[]> {
    const limiter = getRateLimiter(this.embedModel);
    const safeText = (text || '').trim() || 'empty document';
    return limiter.enqueue(async () => {
      const response = await this.client.embed({
        model: this.embedModel,
        texts: [safeText],
        inputType: 'search_document',
        embeddingTypes: ['float'],
      });
      return response.embeddings.float[0];
    });
  }
}

// ============================================================
// PROVIDER FACTORY
// ============================================================

let mainProviderInstance: AIProvider | null = null;
let embedProviderInstance: EmbeddingProvider | null = null;

export function getMainProvider(): AIProvider {
  if (mainProviderInstance) return mainProviderInstance;
  mainProviderInstance = new OpenCodeProvider();
  return mainProviderInstance;
}

export function getEmbedProvider(): EmbeddingProvider {
  if (embedProviderInstance) return embedProviderInstance;
  embedProviderInstance = new CohereProvider();
  return embedProviderInstance;
}

// ============================================================
// STREAMING PROVIDER (for Q&A with context)
// ============================================================

export interface StreamProvider {
  stream(prompt: string): AsyncGenerator<string, void, unknown>;
  name: string;
}

class OpenCodeStreamProvider implements StreamProvider {
  name = 'opencode';
  private client: any;
  private model: string;

  constructor() {
    const OpenAI = require('openai');
    this.client = new OpenAI({
      apiKey: OPENCODE_API_KEY,
      baseURL: OPENCODE_BASE_URL,
    });
    this.model = OPENCODE_MODEL;
    logger.info(`OpenCode streaming provider initialized: model=${this.model}`);
  }

  async *stream(prompt: string): AsyncGenerator<string, void, unknown> {
    const limiter = getRateLimiter(this.model);
    const response = await limiter.enqueue(async () => {
      return await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        stream: true,
        temperature: 0.2,
        max_tokens: 16000,
      });
    });

    for await (const chunk of response) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) yield content;
    }
  }
}

let streamProviderInstance: StreamProvider | null = null;

export function getStreamProvider(): StreamProvider {
  if (streamProviderInstance) return streamProviderInstance;
  streamProviderInstance = new OpenCodeStreamProvider();
  return streamProviderInstance;
}

export async function* streamAIChat(prompt: string): AsyncGenerator<string, void, unknown> {
  const provider = getStreamProvider();
  logger.info(`[${provider.name}] Streaming chat response`);
  try {
    for await (const chunk of provider.stream(prompt)) {
      yield chunk;
    }
  } catch (error) {
    logger.error(`[${provider.name}] Error in streaming chat:`, error);
    throw error;
  }
}

// ============================================================
// EXPORTED FUNCTIONS
// ============================================================

export const aiSummarizeCommit = async (commitDiff: string): Promise<string> => {
  const provider = getMainProvider();
  const prompt = `
    You are an expert programmer summarizing a git diff.
    Git diff format reminder:
    - Metadata lines (e.g., \`diff --git a/file b/file\`) indicate file changes.
    - \`+\` lines are added, \`-\` lines are deleted, others are context.
    Here is the git diff:
    \`\`\`diff
    ${commitDiff}
    \`\`\`
    Provide a concise summary of changes in bullet points. Avoid file names unless necessary and *please provide the summary in no more than 100 words*.
  `;
  try {
    const result = await provider.summarize(prompt);
    return result;
  } catch (error) {
    logger.error(`[${provider.name}] Error summarizing commit:`, error);
    throw error;
  }
};

export const aiSummarizeCode = async (doc: Document): Promise<string> => {
  const provider = getMainProvider();
  const source = doc.metadata.source as string;
  const code = doc.pageContent.slice(0, 10000);
  const prompt = `
    You are a senior software engineer onboarding a junior engineer.
    Explain the purpose of the ${source} file in under 100 words.
    Code:
    ---
    ${code}
    ---
  `;
  try {
    const result = await provider.summarize(prompt);
    return result;
  } catch (error) {
    logger.error(`[${provider.name}] Error summarizing code for ${source}:`, error);
    throw error;
  }
};

export const aiGenerateEmbeddings = async (summary: string): Promise<number[]> => {
  const provider = getEmbedProvider();
  try {
    const result = await provider.embed(summary);
    return result;
  } catch (error) {
    logger.error(`[${provider.name}] Error generating embeddings:`, error);
    throw error;
  }
};

// Batch processing result type
export interface BatchResult {
  summary: string;
  embedding: number[];
  sourceCode: string;
  fileName: string;
}

export const batchProcessDocuments = async (
  docs: Document[],
  onProgress?: (processed: number, fileName: string) => void | Promise<void>
): Promise<BatchResult[]> => {
  const results: BatchResult[] = [];
  const mainProvider = getMainProvider();
  const embedProvider = getEmbedProvider();

  logger.info(`[BatchProcess] Starting with ${docs.length} docs, mainProvider=${mainProvider.name}, embedProvider=${embedProvider.name}`);

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    const source = doc.metadata.source as string;

    try {
      const code = doc.pageContent.slice(0, 10000);
      const prompt = `You are a senior software engineer. Explain the purpose of ${source} in under 100 words. Code: ---${code}---`;
      const summary = await mainProvider.summarize(prompt);

      const embedding = await embedProvider.embed(summary);

      results.push({
        summary,
        embedding,
        sourceCode: doc.pageContent,
        fileName: source,
      });

      if (onProgress) {
        const progressResult = onProgress(i + 1, source);
        if (progressResult instanceof Promise) {
          await progressResult;
        }
      }

      logger.info(`[BatchProcess] Processed ${i + 1}/${docs.length}: ${source}`);
    } catch (error) {
      logger.error(`[BatchProcess] Error processing ${source}:`, error);
      throw error;
    }
  }

  logger.info(`[BatchProcess] Completed processing ${docs.length} documents`);
  return results;
};
