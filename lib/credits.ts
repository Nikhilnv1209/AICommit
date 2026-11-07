import { prisma } from "@/prisma/client";
import type { CreditTxType, ConfigPurpose } from "@prisma/client";
import { getConfigSource } from "./ai-config";
import { logError, logInfo } from "./logger";

/**
 * Central, auditable credit accounting.
 *
 * Pricing model (tune here in one place):
 *   CHAT           — 1 credit per Q&A / conversation message
 *   INDEX          — 1 credit per file (initial indexing)
 *   REINDEX        — 1 credit per new/changed file
 *   COMMIT_SUMMARY — 1 credit per summarized commit
 *
 * Charging rule: credits apply ONLY when the user is on the server fallback
 * for the relevant purpose. Users who bring their own API keys pay nothing
 * (they're already paying their provider). This keeps the credit system
 * meaningful for the hosted experience.
 *
 * Resilience: every charge is atomic (check+decrement+ledger in one tx) and
 * returns an id that callers pass to refundCredits() on failure — so retries
 * never overcharge (a failed attempt is refunded; only success costs).
 */

export const CREDIT_COSTS: Record<"CHAT" | "INDEX" | "REINDEX" | "COMMIT_SUMMARY", number> = {
  CHAT: 1,
  INDEX: 1, // per file
  REINDEX: 1, // per file
  COMMIT_SUMMARY: 1, // per commit
};

/**
 * Decide whether an operation should bill credits, based on the user's config
 * source for the relevant purpose. BYO keys → free; server fallback → paid.
 */
export async function shouldCharge(
  userId: string,
  purpose: ConfigPurpose
): Promise<boolean> {
  const source = await getConfigSource(userId, purpose);
  return source === "server";
}

export interface ChargeResult {
  id: string;
  balanceAfter: number;
}

export class InsufficientCreditsError extends Error {
  constructor(required: number, available: number) {
    super(`Insufficient credits. Required: ${required}, available: ${available}.`);
    this.name = "InsufficientCreditsError";
  }
}

/**
 * Atomically check + decrement credits and append a ledger row.
 * Throws InsufficientCreditsError if the balance can't cover the amount.
 *
 * Run this BEFORE the expensive operation; pass the returned id to
 * refundCredits() if the operation fails.
 */
export async function chargeCredits(
  userId: string,
  amount: number,
  type: CreditTxType,
  opts: { projectId?: string; description?: string } = {}
): Promise<ChargeResult> {
  if (amount <= 0) {
    throw new Error("chargeCredits: amount must be positive");
  }

  return prisma.$transaction(async (tx) => {
    // Conditional decrement: only succeeds if the user has enough credits.
    const dec = await tx.user.updateMany({
      where: { id: userId, credits: { gte: amount } },
      data: { credits: { decrement: amount } },
    });
    if (dec.count === 0) {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { credits: true },
      });
      throw new InsufficientCreditsError(amount, user?.credits ?? 0);
    }

    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { credits: true },
    });
    const balanceAfter = user?.credits ?? 0;

    const tx_ = await tx.creditTransaction.create({
      data: {
        userId,
        amount: -amount,
        type,
        projectId: opts.projectId,
        description: opts.description,
        balanceAfter,
      },
    });

    return { id: tx_.id, balanceAfter };
  });
}

/**
 * Reverse a prior charge (e.g. when an AI call fails after billing).
 * Looks up the original amount and credits it back with a REFUND ledger row
 * referencing the original. Idempotent: refunding the same id twice is a no-op
 * (the second call finds an existing REFUND and returns it).
 */
export async function refundCredits(
  userId: string,
  chargeId: string,
  reason?: string
): Promise<ChargeResult | null> {
  return prisma.$transaction(async (tx) => {
    const original = await tx.creditTransaction.findUnique({
      where: { id: chargeId },
    });
    if (!original || original.userId !== userId) return null;
    // Only reverse actual charges (negative amounts).
    if (original.amount >= 0) return null;

    // Idempotency: skip if a refund for this charge already exists.
    const existing = await tx.creditTransaction.findFirst({
      where: { refId: chargeId, type: "REFUND" },
      select: { id: true, balanceAfter: true },
    });
    if (existing) return { id: existing.id, balanceAfter: existing.balanceAfter };

    const refundAmount = Math.abs(original.amount);

    await tx.user.update({
      where: { id: userId },
      data: { credits: { increment: refundAmount } },
    });

    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { credits: true },
    });
    const balanceAfter = user?.credits ?? 0;

    const refund = await tx.creditTransaction.create({
      data: {
        userId,
        amount: refundAmount,
        type: "REFUND",
        projectId: original.projectId,
        description: reason || `Refund for ${original.type}`,
        refId: chargeId,
        balanceAfter,
      },
    });

    return { id: refund.id, balanceAfter };
  }).catch((err) => {
    logError("RefundCredits", `Failed to refund charge ${chargeId}:`, err);
    return null;
  });
}

/**
 * Charge for a batch of identical operations (e.g. N successfully indexed
 * files, N summarized commits). Used by background jobs. Charges nothing when
 * amount is 0 or the user is on BYO keys for the purpose.
 */
export async function chargeBatch(
  userId: string,
  count: number,
  costPerItem: number,
  type: CreditTxType,
  purpose: ConfigPurpose,
  opts: { projectId?: string; description?: string } = {}
): Promise<ChargeResult | null> {
  if (count <= 0) return null;
  const bill = await shouldCharge(userId, purpose);
  if (!bill) {
    logInfo("Credits", `Skipping ${type} charge for ${userId}: BYO ${purpose} keys (free)`);
    return null;
  }
  const amount = count * costPerItem;
  return chargeCredits(userId, amount, type, opts);
}
