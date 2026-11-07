import { Document } from "@langchain/core/documents";
import type OpenAI from "openai";
import type { ConfigPurpose } from "@prisma/client";
import winston from "winston";

import {
  loadProviderConfig,
  buildProvider,
  AI_NOT_CONFIGURED,
  type ProviderConfig,
} from "./ai-config";

// ────────────────────────────────────────────────────────────────────
// Logger
// ────────────────────────────────────────────────────────────────────

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => `${timestamp} [${level}]: ${message}`)
  ),
  transports: [new winston.transports.Console()],
});

/** Human-readable message for the "no config yet" case, surfaced to users. */
export function isNotConfiguredError(error: unknown): boolean {
  return error instanceof Error && error.message === AI_NOT_CONFIGURED;
}

// ────────────────────────────────────────────────────────────────────
// Rate limiter (keyed per user+model so users never block each other)
// ────────────────────────────────────────────────────────────────────

interface QueueItem<T> {
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
  retryCount: number;
}

interface RateLimitConfig {
  maxRequestsPerMinute: number;
  cooldownMs: number;
}

const DEFAULT_RATE_LIMITS: Record<string, RateLimitConfig> = {
  // generous defaults; unknown models fall back to a safe 30/min
};

class UnifiedRateLimiter {
  private queue: QueueItem<any>[] = [];
  private requestsThisMinute = 0;
  private lastResetTime = Date.now();
  private processingQueue = false;
  private readonly maxRetries = 3;
  private readonly modelName: string;
  private readonly maxRequestsPerMinute: number;
  private readonly cooldownMs: number;

  constructor(modelName: string) {
    this.modelName = modelName;
    const config = DEFAULT_RATE_LIMITS[modelName] || { maxRequestsPerMinute: 30, cooldownMs: 60_000 };
    this.maxRequestsPerMinute = config.maxRequestsPerMinute;
    this.cooldownMs = config.cooldownMs;
  }

  enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ execute: fn, resolve, reject, retryCount: 0 });
      if (!this.processingQueue) this.processQueue();
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
      const wait = this.cooldownMs - (now - this.lastResetTime);
      setTimeout(() => this.processQueue(), wait);
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
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("429") || msg.toLowerCase().includes("rate limit")) {
        const retryCount = item.retryCount + 1;
        if (retryCount <= this.maxRetries) {
          this.queue.push({ ...item, retryCount });
          setTimeout(() => this.processQueue(), this.cooldownMs);
          return;
        }
      }
      item.reject(error);
      setTimeout(() => this.processQueue(), 50);
    }
  }
}

const rateLimiters = new Map<string, UnifiedRateLimiter>();
function getRateLimiter(key: string): UnifiedRateLimiter {
  if (!rateLimiters.has(key)) rateLimiters.set(key, new UnifiedRateLimiter(key));
  return rateLimiters.get(key)!;
}

// ────────────────────────────────────────────────────────────────────
// Provider resolution (per-purpose)
// ────────────────────────────────────────────────────────────────────

async function getProvider(
  userId: string,
  purpose: ConfigPurpose
): Promise<{ client: OpenAI; config: ProviderConfig }> {
  const config = await loadProviderConfig(userId, purpose);
  return { client: buildProvider(config), config };
}

/**
 * Read a chat-completion response, falling back to reasoning_content for
 * reasoning models that leave `content` empty on the first pass.
 */
function readChatMessage(message: any): string {
  const content = message?.content;
  const reasoning = message?.reasoning_content || message?.reasoning;
  if (content && String(content).trim()) return String(content);
  if (reasoning && String(reasoning).trim()) return String(reasoning);
  return "";
}

// ────────────────────────────────────────────────────────────────────
// Exported AI operations (all require a userId)
// ────────────────────────────────────────────────────────────────────

export const aiSummarizeCommit = async (userId: string, commitDiff: string): Promise<string> => {
  const { client, config } = await getProvider(userId, "CHAT");
  const limiter = getRateLimiter(`${userId}:${config.model}`);
  const prompt = `You are an expert programmer summarizing a git diff.
Git diff format reminder:
- Metadata lines (e.g., \`diff --git a/file b/file\`) indicate file changes.
- \`+\` lines are added, \`-\` lines are deleted, others are context.
Here is the git diff:
\`\`\`diff
${commitDiff}
\`\`\`
Provide a concise summary of changes in bullet points. Avoid file names unless necessary and *please provide the summary in no more than 100 words*.`;

  try {
    const response = await limiter.enqueue(() =>
      client.chat.completions.create({
        model: config.model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        max_tokens: 8000,
      })
    );
    const result = readChatMessage(response.choices[0]?.message);
    if (!result) logger.warn(`[aiSummarizeCommit] Empty response from ${config.model}`);
    return result || "No summary available.";
  } catch (error) {
    logger.error(`[aiSummarizeCommit] ${config.model} error:`, error);
    throw error;
  }
};

export const aiSummarizeCode = async (userId: string, doc: Document): Promise<string> => {
  const { client, config } = await getProvider(userId, "CHAT");
  const limiter = getRateLimiter(`${userId}:${config.model}`);
  const source = doc.metadata.source as string;
  const code = doc.pageContent.slice(0, 10000);
  const prompt = `You are a senior software engineer onboarding a junior engineer.
Explain the purpose of the ${source} file in under 100 words.
Code:
---
${code}
---`;

  try {
    const response = await limiter.enqueue(() =>
      client.chat.completions.create({
        model: config.model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        max_tokens: 8000,
      })
    );
    const result = readChatMessage(response.choices[0]?.message);
    return result || "No summary available.";
  } catch (error) {
    logger.error(`[aiSummarizeCode] ${config.model} error for ${source}:`, error);
    throw error;
  }
};

export const aiGenerateEmbeddings = async (userId: string, text: string): Promise<number[]> => {
  const { client, config } = await getProvider(userId, "EMBEDDING");
  const limiter = getRateLimiter(`${userId}:${config.model}`);
  const safeText = (text || "").trim() || "empty document";

  try {
    const response = await limiter.enqueue(() =>
      client.embeddings.create({
        model: config.model,
        input: safeText,
        // Vector column is fixed at vector(1024). Models that don't support a
        // `dimensions` parameter will error with a clear message.
        dimensions: 1024,
      })
    );
    return response.data[0]?.embedding ?? [];
  } catch (error) {
    logger.error(`[aiGenerateEmbeddings] ${config.model} error:`, error);
    throw error;
  }
};

export interface BatchResult {
  summary: string;
  embedding: number[];
  sourceCode: string;
  fileName: string;
}

export const batchProcessDocuments = async (
  userId: string,
  docs: Document[],
  onProgress?: (processed: number, fileName: string) => void | Promise<void>
): Promise<BatchResult[]> => {
  const results: BatchResult[] = [];
  logger.info(`[BatchProcess] Starting ${docs.length} docs for user ${userId}`);

  let failed = 0;
  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    const source = doc.metadata.source as string;

    // 1. Summarize — a single file's AI failure must never abort the batch.
    //    Fall back to a raw snippet so the file is still embedded and searchable.
    let summary: string;
    try {
      summary = await aiSummarizeCode(userId, doc);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.warn(`[BatchProcess] AI summarize failed for ${source} — using fallback: ${msg}`);
      summary = `Source file: ${source}\n\n${doc.pageContent.slice(0, 500)}`;
    }

    // 2. Embed — if this fails too, skip the file but keep going.
    try {
      const embedding = await aiGenerateEmbeddings(userId, summary);
      results.push({ summary, embedding, sourceCode: doc.pageContent, fileName: source });

      if (onProgress) {
        const r = onProgress(i + 1, source);
        if (r instanceof Promise) await r;
      }
      logger.info(`[BatchProcess] ${i + 1}/${docs.length}: ${source}`);
    } catch (error) {
      failed++;
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`[BatchProcess] Embedding failed for ${source}, skipping: ${msg}`);
    }
  }

  logger.info(
    `[BatchProcess] Completed ${results.length}/${docs.length} documents` +
    (failed ? `, ${failed} skipped` : "")
  );
  return results;
};

// ────────────────────────────────────────────────────────────────────
// Streaming (Q&A / conversation)
// ────────────────────────────────────────────────────────────────────

/** Stream a plain prompt as a sequence of answer text chunks. */
export async function* streamAIChat(
  userId: string,
  prompt: string
): AsyncGenerator<string, void, unknown> {
  const { client, config } = await getProvider(userId, "CHAT");
  logger.info(`[streamAIChat] ${config.model}`);

  // Streaming is user-driven (one stream at a time), so the per-model rate
  // limiter isn't needed here. The OpenAI SDK + our retry headers handle 429s.
  const stream = await client.chat.completions.create({
    model: config.model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
    max_tokens: 16000,
    stream: true,
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) yield content;
  }
}

export type StreamChatChunk = { type: "thinking" | "answer"; content: string };

/**
 * Stream a chat with an explicit message history. Reasoning-model thinking
 * tokens are yielded as `thinking`; the final answer as `answer`.
 */
export async function* streamAIChatWithMessages(
  userId: string,
  messages: Array<{ role: string; content: string }>
): AsyncGenerator<StreamChatChunk, void, unknown> {
  const { client, config } = await getProvider(userId, "CHAT");
  logger.info(`[streamAIChatWithMessages] ${config.model} (${messages.length} messages)`);

  const stream = await client.chat.completions.create({
    model: config.model,
    messages: messages as any,
    temperature: 0.2,
    max_tokens: 16000,
    stream: true,
  });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta as any;
    // Reasoning models (e.g. DeepSeek) put thinking tokens in reasoning_content
    const thinking = delta?.reasoning_content || delta?.reasoning;
    if (thinking) yield { type: "thinking", content: thinking };
    if (delta?.content) yield { type: "answer", content: delta.content };
  }
}
