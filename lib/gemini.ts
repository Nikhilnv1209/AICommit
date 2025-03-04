import { GoogleGenerativeAI, GenerateContentResponse } from '@google/generative-ai';
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

// Rate limit configuration
const RATE_LIMITS: {
  [model: string]: {
    maxRequestsPerMinute: number;
    cooldownMs: number;
  };
} = {
  'gemini-2.0-flash-lite': {
    maxRequestsPerMinute: 30,
    cooldownMs: 60 * 1000, // 60 seconds
  },
  'text-embedding-004': {
    maxRequestsPerMinute: 1500,
    cooldownMs: 60 * 1000, // 60 seconds
  },
};

// Queue item interface with generic type
interface QueueItem<T> {
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
  retryCount: number;
  addedAt: number;
}

class ModelRateLimiter {
  private queue: QueueItem<any>[] = [];
  private requestsThisMinute: number = 0;
  private lastResetTime: number = Date.now();
  private processingQueue: boolean = false;
  private readonly maxRetries: number = 3;
  private readonly model: string;
  private readonly maxRequestsPerMinute: number;
  private readonly cooldownMs: number;

  constructor(model: string) {
    this.model = model;
    this.maxRequestsPerMinute = RATE_LIMITS[model]?.maxRequestsPerMinute ?? 30;
    this.cooldownMs = RATE_LIMITS[model]?.cooldownMs ?? 60 * 1000;
    logger.info(`Initialized rate limiter for model: ${model}`);
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

      logger.debug(`Enqueued request for ${this.model}. Queue size: ${this.queue.length}`);

      if (!this.processingQueue) {
        this.processQueue();
      }
    });
  }

  private async processQueue(): Promise<void> {
    if (this.queue.length === 0) {
      this.processingQueue = false;
      logger.debug(`Queue empty for ${this.model}. Processing stopped.`);
      return;
    }

    this.processingQueue = true;

    const now = Date.now();
    if (now - this.lastResetTime > this.cooldownMs) {
      this.requestsThisMinute = 0;
      this.lastResetTime = now;
      logger.debug(`Reset rate limit counter for ${this.model}`);
    }

    if (this.requestsThisMinute >= this.maxRequestsPerMinute) {
      const timeToWait = this.cooldownMs - (now - this.lastResetTime);
      logger.warn(`Rate limit reached for ${this.model}. Waiting ${timeToWait}ms.`);
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
      logger.debug(`Processing request for ${this.model}. Requests this minute: ${this.requestsThisMinute}`);
      const result = await item.execute();
      item.resolve(result);
      setTimeout(() => this.processQueue(), 50); // Continue with small delay
    } catch (error) {
      if (
        (error instanceof Error && (error.message.includes('429') || error.message.includes('rate limit'))) &&
        item.retryCount < this.maxRetries
      ) {
        logger.warn(`Rate limit error for ${this.model}. Retrying (attempt ${item.retryCount + 1}/${this.maxRetries})`);
        this.queue.push({ ...item, retryCount: item.retryCount + 1 });
        setTimeout(() => this.processQueue(), this.cooldownMs);
      } else {
        logger.error(`Failed processing request for ${this.model} after ${item.retryCount} retries: ${error}`);
        item.reject(error);
        setTimeout(() => this.processQueue(), 50); // Continue even on failure
      }
    }
  }
}

// Singleton rate limiters
const rateLimiters: Record<string, ModelRateLimiter> = {
  'gemini-2.0-flash-lite': new ModelRateLimiter('gemini-2.0-flash-lite'),
  'text-embedding-004': new ModelRateLimiter('text-embedding-004'),
};

// Initialize Google Generative AI client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '');
const generativeModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite' });
const embeddingModel = genAI.getGenerativeModel({ model: 'text-embedding-004' });

// Rate-limited API functions
export const aiSummarizeCommit = async (commitDiff: string): Promise<string> => {
  return rateLimiters['gemini-2.0-flash-lite'].enqueue(async () => {
    const prompt = `
      You are an expert programmer summarizing a git diff.
      Git diff format reminder:
      - Metadata lines (e.g., \`diff --git a/file b/file\`) indicate file changes.
      - \`+\` lines are added, \`-\` lines are deleted, others are context.
      Here is the git diff:
      \`\`\`diff
      ${commitDiff}
      \`\`\`
      Provide a concise summary of changes in bullet points. Avoid file names unless necessary.
    `;

    try {
      const response = await generativeModel.generateContent([prompt]);
      const text = response.response.text();
      logger.info(`Successfully summarized commit diff ${commitDiff.slice(0, 100)}`);
      return text;
    } catch (error) {
      logger.error(`Error summarizing commit: ${error}`);
      throw error;
    }
  });
};

export const aiSummarizeCode = async (doc: Document): Promise<string> => {
  return rateLimiters['gemini-2.0-flash-lite'].enqueue(async () => {
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
      const response = await generativeModel.generateContent([prompt]);
      const text = response.response.text();
      logger.info(`Summarized code for ${source}`);
      return text;
    } catch (error) {
      logger.error(`Error summarizing code for ${source}: ${error}`);
      throw error;
    }
  });
};

export const aiGenerateEmbeddings = async (summary: string): Promise<number[]> => {
  return rateLimiters['text-embedding-004'].enqueue(async () => {
    try {
      const result = await embeddingModel.embedContent(summary);
      logger.info(`Generated embeddings for summary`);
      return result.embedding.values;
    } catch (error) {
      logger.error(`Error generating embeddings: ${error}`);
      throw error;
    }
  });
};

// Batch processing result type
interface BatchResult {
  summary: string;
  embedding: number[];
  sourceCode: string;
  fileName: string;
}

export const batchProcessDocuments = async (
  docs: Document[],
  batchSize: number = 10
): Promise<BatchResult[]> => {
  const results: BatchResult[] = [];

  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = docs.slice(i, i + batchSize);

    try {
      const summaryPromises = batch.map((doc) => aiSummarizeCode(doc));
      const summaries = await Promise.all(summaryPromises);

      const embeddingPromises = summaries.map((summary) => aiGenerateEmbeddings(summary));
      const embeddings = await Promise.all(embeddingPromises);

      for (let j = 0; j < batch.length; j++) {
        results.push({
          summary: summaries[j],
          embedding: embeddings[j],
          sourceCode: batch[j].pageContent, // No need for JSON.parse/stringify
          fileName: batch[j].metadata.source as string,
        });
      }

      logger.info(`Processed batch ${i / batchSize + 1}/${Math.ceil(docs.length / batchSize)}`);
    } catch (error) {
      logger.error(`Error processing batch ${i / batchSize + 1}: ${error}`);
      throw error;
    }
  }

  return results;
};