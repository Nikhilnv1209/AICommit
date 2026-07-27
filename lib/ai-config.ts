import { OpenAI, type ClientOptions } from "openai";
import { prisma } from "@/prisma/client";
import type { ConfigPurpose } from "@prisma/client";
import { decrypt } from "./crypto";

/**
 * Central place for resolving a user's AI configuration and building a
 * per-purpose OpenAI-compatible provider.
 *
 * Each user can have up to two independent configs:
 *   - CHAT      → Q&A, commit/code summaries, streaming
 *   - EMBEDDING → vector embeddings for semantic search
 *
 * They can point at completely different providers, endpoints, and keys
 * (e.g. OpenAI for chat, a local Ollama for embeddings).
 */

export const DEFAULT_BASE_URL = "https://api.openai.com/v1";

/** Marker thrown when neither a user config nor a server fallback exists. */
export const AI_NOT_CONFIGURED = "AI_NOT_CONFIGURED";

export { type ConfigPurpose };

/** Credentials + endpoint for a single purpose. */
export interface ProviderConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

/** Where a resolved config came from. */
export type ConfigSource = "user" | "server" | "none";

// ────────────────────────────────────────────────────────────────────
// Server-side fallback (env-based). Used when a user hasn't configured
// their own endpoint for a given purpose. This is what the credit system
// bills against — the "hosted" experience users pay credits to use.
// ────────────────────────────────────────────────────────────────────

const SERVER_FALLBACK: Record<ConfigPurpose, ProviderConfig | null> = {
  CHAT: {
    baseUrl: (process.env.OPENCODE_BASE_URL || "https://opencode.ai/zen/v1").trim(),
    apiKey: (process.env.OPENCODE_API_KEY || "public").trim(),
    model: (process.env.OPENCODE_MODEL || "deepseek-v4-flash").trim(),
  },
  EMBEDDING: process.env.COHERE_API_KEY
    ? {
        baseUrl: (process.env.COHERE_BASE_URL || "https://api.cohere.ai/compatibility/v1").trim(),
        apiKey: process.env.COHERE_API_KEY.trim(),
        model: (process.env.COHERE_EMBED_MODEL || "embed-english-v3.0").trim(),
      }
    : null,
};

/** True when the server has a usable fallback for this purpose. */
export function hasServerFallback(purpose: ConfigPurpose): boolean {
  return SERVER_FALLBACK[purpose] !== null;
}

/**
 * Load + decrypt one purpose's config.
 *
 * Resolution order:
 *   1. The user's stored config (if present)
 *   2. The server-side env fallback (if present)
 *   3. Throws `AI_NOT_CONFIGURED`
 *
 * Only the third case throws — so users without their own keys still get the
 * hosted experience (billed via credits), and the error only surfaces when the
 * server itself isn't configured either.
 */
export async function loadProviderConfig(
  userId: string,
  purpose: ConfigPurpose
): Promise<ProviderConfig> {
  // 1) User config
  const row = await prisma.userAIConfig.findUnique({
    where: { userId_purpose: { userId, purpose } },
  });
  if (row) {
    return {
      apiKey: decrypt(row.apiKeyEnc),
      baseUrl: row.baseUrl?.trim() || DEFAULT_BASE_URL,
      model: row.model.trim(),
    };
  }

  // 2) Server fallback
  const fallback = SERVER_FALLBACK[purpose];
  if (fallback && fallback.apiKey) {
    return { ...fallback };
  }

  // 3) Nothing available
  const err = new Error(AI_NOT_CONFIGURED);
  err.name = "AIConfigError";
  throw err;
}

/**
 * Returns where a purpose's effective config would come from, without
 * decrypting anything. Used by the settings UI to show the user whether
 * they're on their own keys or the hosted fallback.
 */
export async function getConfigSource(
  userId: string,
  purpose: ConfigPurpose
): Promise<ConfigSource> {
  const row = await prisma.userAIConfig.findUnique({
    where: { userId_purpose: { userId, purpose } },
    select: { userId: true },
  });
  if (row) return "user";
  return hasServerFallback(purpose) ? "server" : "none";
}

/** Returns true when the user has a config row for the given purpose. */
export async function hasProviderConfig(
  userId: string,
  purpose: ConfigPurpose
): Promise<boolean> {
  const row = await prisma.userAIConfig.findUnique({
    where: { userId_purpose: { userId, purpose } },
    select: { userId: true },
  });
  return row !== null;
}

/**
 * Build a fresh OpenAI-compatible client from a single-purpose config.
 *
 * Every OpenAI-compatible endpoint (OpenAI, OpenRouter, Together, Groq,
 * DeepSeek, Cohere's compatibility API, local Ollama, etc.) speaks the same
 * `/chat/completions` + `/embeddings` surface, so one client class covers them
 * all — just point `baseURL` and `apiKey` at the provider.
 *
 * We build per-purpose (chat vs embedding may live on different hosts), so the
 * caller passes the resolved config. A small cache keeps the last client per
 * cache key (apiKey+baseUrl hash) to reuse HTTP keep-alive connections.
 */
const clientCache = new Map<string, OpenAI>();

export function buildProvider(config: ProviderConfig): OpenAI {
  const cacheKey = `${config.baseUrl}\0${config.apiKey}`;
  const cached = clientCache.get(cacheKey);
  if (cached) return cached;

  const options: ClientOptions = {
    baseURL: config.baseUrl,
    apiKey: config.apiKey,
    // Let the underlying limiter/retry handle backoff; avoid the SDK's own
    // retries fighting our UnifiedRateLimiter.
    maxRetries: 0,
  };

  const client = new OpenAI(options);
  // Bound the cache so a runaway number of unique keys can't leak memory.
  if (clientCache.size > 256) clientCache.clear();
  clientCache.set(cacheKey, client);
  return client;
}

/**
 * Resolve the owning user for a project. Background indexing (which runs
 * outside of a request and therefore without auth context) uses this to pick
 * up the project owner's AI configuration.
 *
 * There's no explicit "owner" role; we treat the earliest-joined member as the
 * owner (the project creator).
 */
export async function resolveProjectOwnerUserId(projectId: string): Promise<string | null> {
  const membership = await prisma.userToProject.findFirst({
    where: { projectId },
    orderBy: { createdAt: "asc" },
    select: { userId: true },
  });
  return membership?.userId ?? null;
}
