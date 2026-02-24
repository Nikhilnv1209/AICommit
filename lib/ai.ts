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

export type ProviderType = 'gemini' | 'zhipu' | 'cohere' | 'sarvam';

export interface AIProvider {
  // Main model (for summarization)
  summarize(prompt: string): Promise<string>;
  
  // Embeddings model
  embed(text: string): Promise<number[]>;
  
  // Provider name for logging
  name: string;
}

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  name: string;
}

// ============================================================
// UNIFIED RATE LIMITER (works across all providers)
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

// Default conservative rate limits (can be overridden by env)
const DEFAULT_RATE_LIMITS: Record<string, RateLimitConfig> = {
  // Gemini models
  'gemini-2.0-flash': { maxRequestsPerMinute: 15, cooldownMs: 60000 },
  'gemini-2.0-flash-001': { maxRequestsPerMinute: 15, cooldownMs: 60000 },
  'text-embedding-004': { maxRequestsPerMinute: 1500, cooldownMs: 60000 },
  
  // Z.AI models (conservative defaults - adjust based on your plan)
  'glm-4.7-flash': { maxRequestsPerMinute: 60, cooldownMs: 60000 },
  'glm-5': { maxRequestsPerMinute: 60, cooldownMs: 60000 },
  'glm-4-flash': { maxRequestsPerMinute: 60, cooldownMs: 60000 },
  'glm-4': { maxRequestsPerMinute: 60, cooldownMs: 60000 },
  'glm-3-turbo': { maxRequestsPerMinute: 120, cooldownMs: 60000 },
  'embedding-3': { maxRequestsPerMinute: 100, cooldownMs: 60000 },

  // Cohere models (2000 req/min)
  'embed-english-v3.0': { maxRequestsPerMinute: 2000, cooldownMs: 60000 },
  'embed-english-light-v3.0': { maxRequestsPerMinute: 2000, cooldownMs: 60000 },
  'embed-multilingual-v3.0': { maxRequestsPerMinute: 2000, cooldownMs: 60000 },
  'embed-multilingual-light-v3.0': { maxRequestsPerMinute: 2000, cooldownMs: 60000 },
  'embed-v4.0': { maxRequestsPerMinute: 2000, cooldownMs: 60000 },

  // Sarvam models (conservative default)
  'sarvam-m': { maxRequestsPerMinute: 60, cooldownMs: 60000 },
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
    logger.info(`[RateLimiter:${modelName}] Queue state: empty, processing=${this.processingQueue}`);
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
      
      logger.info(`[RateLimiter:${this.modelName}] Enqueued request, queue length=${this.queue.length}, processing=${this.processingQueue}`);

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

    // Reset counter if cooldown passed
    if (now - this.lastResetTime > this.cooldownMs) {
      this.requestsThisMinute = 0;
      this.lastResetTime = now;
      logger.info(`[RateLimiter:${this.modelName}] Counter reset, requestsThisMinute=${this.requestsThisMinute}`);
    }

    // Wait if rate limit reached
    if (this.requestsThisMinute >= this.maxRequestsPerMinute) {
      const timeToWait = this.cooldownMs - (now - this.lastResetTime);
      logger.warn(`[RateLimiter:${this.modelName}] Rate limit reached (${this.requestsThisMinute}/${this.maxRequestsPerMinute}). Waiting ${timeToWait}ms`);
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
      logger.info(`[RateLimiter:${this.modelName}] Processing request ${this.requestsThisMinute}/${this.maxRequestsPerMinute}, queue length=${this.queue.length}`);
      const result = await item.execute();
      item.resolve(result);
      setTimeout(() => this.processQueue(), 50);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (errorMsg.includes('429') || errorMsg.toLowerCase().includes('rate limit')) {
        const retryCount = item.retryCount + 1;
        logger.warn(`Rate limit error for ${this.modelName}. Retry ${retryCount}/${this.maxRetries}`);
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

// Rate limiter cache
const rateLimiters: Map<string, UnifiedRateLimiter> = new Map();

function getRateLimiter(modelName: string): UnifiedRateLimiter {
  if (!rateLimiters.has(modelName)) {
    rateLimiters.set(modelName, new UnifiedRateLimiter(modelName));
  }
  return rateLimiters.get(modelName)!;
}

// ============================================================
// GEMINI PROVIDER
// ============================================================

class GeminiProvider implements AIProvider, EmbeddingProvider {
  name = 'gemini';
  private summarizeModel: any;
  private embedModel: any;

  constructor() {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '');
    
    this.summarizeModel = genAI.getGenerativeModel({ 
      model: process.env.GEMINI_SUMMARIZE_MODEL || 'gemini-2.0-flash' 
    });
    this.embedModel = genAI.getGenerativeModel({ 
      model: process.env.GEMINI_EMBED_MODEL || 'text-embedding-004' 
    });
    
    logger.info(`Gemini provider initialized with models: ${process.env.GEMINI_SUMMARIZE_MODEL || 'gemini-2.0-flash'} (summarize), ${process.env.GEMINI_EMBED_MODEL || 'text-embedding-004'} (embed)`);
  }

  async summarize(prompt: string): Promise<string> {
    const limiter = getRateLimiter(process.env.GEMINI_SUMMARIZE_MODEL || 'gemini-2.0-flash');
    return limiter.enqueue(async () => {
      const response = await this.summarizeModel.generateContent([prompt]);
      return response.response.text();
    });
  }

  async embed(text: string): Promise<number[]> {
    const limiter = getRateLimiter(process.env.GEMINI_EMBED_MODEL || 'text-embedding-004');
    return limiter.enqueue(async () => {
      const result = await this.embedModel.embedContent(text);
      return result.embedding.values;
    });
  }
}

// ============================================================
// Z.AI (ZHIPU) PROVIDER - Uses OpenAI SDK with custom base URL
// ============================================================

class ZhipuProvider implements AIProvider, EmbeddingProvider {
  name = 'zhipu';
  private client: any;
  private summarizeModel: string;
  private embedModel: string;

  constructor() {
    const OpenAI = require('openai');
    
    // Z.AI base URLs
    const generalBaseUrl = 'https://api.z.ai/api/paas/v4/';
    const codingBaseUrl = 'https://api.z.ai/api/coding/paas/v4/';
    
    // Use coding endpoint if specified, otherwise general
    const baseUrl = process.env.ZHIPU_USE_CODING_ENDPOINT === 'true' 
      ? codingBaseUrl 
      : (process.env.ZHIPU_BASE_URL || generalBaseUrl);

    this.client = new OpenAI({
      apiKey: process.env.ZHIPU_API_KEY ?? '',
      baseURL: baseUrl,
    });
    
    this.summarizeModel = process.env.ZHIPU_SUMMARIZE_MODEL || 'glm-4.7-flash';
    this.embedModel = process.env.ZHIPU_EMBED_MODEL || 'embedding-3';
    
    logger.info(`Z.AI provider initialized: baseURL=${baseUrl}, summarizeModel=${this.summarizeModel}, embedModel=${this.embedModel}`);
  }

  async summarize(prompt: string): Promise<string> {
    const limiter = getRateLimiter(this.summarizeModel);
    
    return limiter.enqueue(async () => {
      const response = await this.client.chat.completions.create({
        model: this.summarizeModel,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1000,
      });
      return response.choices[0].message.content;
    });
  }

  async embed(text: string): Promise<number[]> {
    const limiter = getRateLimiter(this.embedModel);
    logger.info(`[ZhipuProvider] embed() called with model=${this.embedModel}`);
    
    return limiter.enqueue(async () => {
      const response = await this.client.embeddings.create({
        model: this.embedModel,
        input: text,
      });
      return response.data[0].embedding;
    });
  }
}

// ============================================================
// SARVAM PROVIDER (Summarization only - no embeddings)
// ============================================================

class SarvamProvider implements AIProvider {
  name = 'sarvam';
  private client: any;
  private model: string;

  constructor() {
    const OpenAI = require('openai');
    
    this.client = new OpenAI({
      apiKey: process.env.SARVAM_API_KEY ?? '',
      baseURL: 'https://api.sarvam.ai/v1',
    });
    
    this.model = 'sarvam-m';
    
    logger.info(`Sarvam provider initialized with model: ${this.model}`);
  }

  async summarize(prompt: string): Promise<string> {
    const limiter = getRateLimiter(this.model);
    
    return limiter.enqueue(async () => {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 1000,
      });
      return response.choices[0].message.content;
    });
  }

  async embed(text: string): Promise<number[]> {
    throw new Error('Sarvam does not support embeddings. Use COHERE or another provider for embeddings.');
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
    logger.info(`[CohereProvider] embed() called with model=${this.embedModel}`);
    
    return limiter.enqueue(async () => {
      const response = await this.client.embed({
        model: this.embedModel,
        texts: [text],
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

// Main model provider (for summarization)
let mainProviderInstance: AIProvider | null = null;
let embedProviderInstance: EmbeddingProvider | null = null;

export function getMainProvider(): AIProvider {
  if (mainProviderInstance) return mainProviderInstance;

  const providerType = (process.env.AI_PROVIDER || 'gemini').toLowerCase() as ProviderType;
  
  switch (providerType) {
    case 'sarvam':
      mainProviderInstance = new SarvamProvider();
      break;
    case 'zhipu':
      mainProviderInstance = new ZhipuProvider();
      break;
    case 'gemini':
    default:
      mainProviderInstance = new GeminiProvider();
      break;
  }

  return mainProviderInstance;
}

export function getEmbedProvider(): EmbeddingProvider {
  if (embedProviderInstance) return embedProviderInstance;

  const embedProviderType = (process.env.EMBED_PROVIDER || process.env.AI_PROVIDER || 'gemini').toLowerCase() as ProviderType;
  
  switch (embedProviderType) {
    case 'cohere':
      embedProviderInstance = new CohereProvider();
      break;
    case 'zhipu':
      embedProviderInstance = new ZhipuProvider();
      break;
    case 'gemini':
    default:
      embedProviderInstance = new GeminiProvider();
      break;
  }

  return embedProviderInstance;
}

// ============================================================
// STREAMING PROVIDER (for Q&A with context)
// ============================================================

export interface StreamProvider {
  stream(prompt: string): AsyncGenerator<string, void, unknown>;
  name: string;
}

class GeminiStreamProvider implements StreamProvider {
  name = 'gemini';
  private model: any;

  constructor() {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '');
    const modelName = process.env.GEMINI_CHAT_MODEL || 'gemini-2.0-flash-001';
    this.model = genAI.getGenerativeModel({ model: modelName });
    logger.info(`Gemini streaming provider initialized with model: ${modelName}`);
  }

  async *stream(prompt: string): AsyncGenerator<string, void, unknown> {
    const limiter = getRateLimiter(process.env.GEMINI_CHAT_MODEL || 'gemini-2.0-flash-001');
    
    const result = await limiter.enqueue(async () => {
      return await this.model.generateContentStream([prompt]);
    });
    
    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) yield text;
    }
  }
}

class ZhipuStreamProvider implements StreamProvider {
  name = 'zhipu';
  private client: any;
  private model: string;

  constructor() {
    const OpenAI = require('openai');
    
    const generalBaseUrl = 'https://api.z.ai/api/paas/v4/';
    const codingBaseUrl = 'https://api.z.ai/api/coding/paas/v4/';
    
    const baseUrl = process.env.ZHIPU_USE_CODING_ENDPOINT === 'true' 
      ? codingBaseUrl 
      : (process.env.ZHIPU_BASE_URL || generalBaseUrl);

    this.client = new OpenAI({
      apiKey: process.env.ZHIPU_API_KEY ?? '',
      baseURL: baseUrl,
    });
    
    this.model = process.env.ZHIPU_CHAT_MODEL || 'glm-4.7-flash';
    
    logger.info(`Z.AI streaming provider initialized: baseURL=${baseUrl}, model=${this.model}`);
  }

  async *stream(prompt: string): AsyncGenerator<string, void, unknown> {
    const limiter = getRateLimiter(this.model);
    
    const response = await limiter.enqueue(async () => {
      return await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        stream: true,
        max_tokens: 1000,
      });
    });

    for await (const chunk of response) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) yield content;
    }
  }
}

class SarvamStreamProvider implements StreamProvider {
  name = 'sarvam';
  private client: any;
  private model: string;

  constructor() {
    const OpenAI = require('openai');
    
    this.client = new OpenAI({
      apiKey: process.env.SARVAM_API_KEY ?? '',
      baseURL: 'https://api.sarvam.ai/v1',
    });
    
    this.model = 'sarvam-m';
    
    logger.info(`Sarvam streaming provider initialized with model: ${this.model}`);
  }

  async *stream(prompt: string): AsyncGenerator<string, void, unknown> {
    const limiter = getRateLimiter(this.model);
    
    const response = await limiter.enqueue(async () => {
      return await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        stream: true,
        temperature: 0.2,
        max_tokens: 1000,
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

  const providerType = (process.env.AI_PROVIDER || 'gemini').toLowerCase() as ProviderType;
  
  switch (providerType) {
    case 'sarvam':
      streamProviderInstance = new SarvamStreamProvider();
      break;
    case 'zhipu':
      streamProviderInstance = new ZhipuStreamProvider();
      break;
    case 'gemini':
    default:
      streamProviderInstance = new GeminiStreamProvider();
      break;
  }

  return streamProviderInstance;
}

export async function* streamAIChat(prompt: string): AsyncGenerator<string, void, unknown> {
  const provider = getStreamProvider();
  logger.info(`[${provider.name}] Streaming chat response`);
  
  try {
    for await (const chunk of provider.stream(prompt)) {
      yield chunk;
    }
    logger.info(`[${provider.name}] Streaming completed`);
  } catch (error) {
    logger.error(`[${provider.name}] Error in streaming chat:`, error);
    throw error;
  }
}

// ============================================================
// EXPORTED FUNCTIONS (Backward Compatible API)
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
    logger.info(`[${provider.name}] Successfully summarized commit diff`);
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
    logger.info(`[${provider.name}] Summarized code for ${source}`);
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
    logger.info(`[${provider.name}] Generated embeddings`);
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

  // Process documents one by one for granular progress updates
  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    const source = doc.metadata.source as string;

    try {
      // Generate summary for this file
      const code = doc.pageContent.slice(0, 10000);
      const prompt = `You are a senior software engineer. Explain the purpose of ${source} in under 100 words. Code: ---${code}---`;
      const summary = await mainProvider.summarize(prompt);

      // Generate embedding for the summary
      const embedding = await embedProvider.embed(summary);

      // Store result
      results.push({
        summary,
        embedding,
        sourceCode: doc.pageContent,
        fileName: source,
      });

      // Report progress after each file
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
