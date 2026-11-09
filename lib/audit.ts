import { after } from 'next/server'
import { headers } from 'next/headers'
import { Prisma } from '@prisma/client'
import { prisma } from '@/prisma/client'
import { logWarning } from './logger'
import {
  AUDIT_ACTIONS,
  type AuditAction,
  type AuditSource,
  type AuditStatus,
} from './audit-actions'

/**
 * Append-only audit trail.
 *
 * Records "who did what, to which project, and with what result". Writes are
 * scheduled with `after()` so they never add latency, and failures are
 * swallowed: an audit problem must not fail the user's action.
 */

export { AUDIT_ACTIONS }
export type { AuditAction, AuditStatus, AuditSource }

export interface AuditRequestContext {
  ip?: string | null
  userAgent?: string | null
}

export interface AuditEvent {
  action: AuditAction
  status?: AuditStatus
  source?: AuditSource
  actorId?: string | null
  projectId?: string | null
  target?: string | null
  metadata?: Record<string, unknown> | null
  error?: unknown
  request?: AuditRequestContext
}

export interface AuditPayload {
  action: string
  status: string
  source: string
  actorId: string | null
  projectId: string | null
  target: string | null
  error: string | null
  metadata: Record<string, unknown> | null
}

const MAX_METADATA_BYTES = 4 * 1024
const MAX_TARGET_LENGTH = 200
const MAX_ERROR_LENGTH = 1000
const MAX_IP_LENGTH = 64
const MAX_USER_AGENT_LENGTH = 300

/** Keys whose values must never reach the audit trail. */
const SENSITIVE_KEY = /(api[_-]?key|secret|token|password|authorization|credential)/i

function truncate(value: string | null | undefined, max: number): string | null {
  if (!value) return null
  return value.length > max ? `${value.slice(0, max)}…` : value
}

/** Recursively redact sensitive keys. Exported for tests. */
export function redactAuditMetadata(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactAuditMetadata)
  }

  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      result[key] = SENSITIVE_KEY.test(key) ? '[redacted]' : redactAuditMetadata(entry)
    }
    return result
  }

  return value
}

function serializeError(error: unknown): string | null {
  if (!error) return null
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

/** Build the row to persist. Exported for tests. */
export function buildAuditPayload(event: AuditEvent): AuditPayload {
  let metadata = event.metadata ? (redactAuditMetadata(event.metadata) as Record<string, unknown>) : null

  if (metadata && JSON.stringify(metadata).length > MAX_METADATA_BYTES) {
    metadata = { truncated: true, keys: Object.keys(metadata) }
  }

  return {
    action: event.action,
    status: event.status ?? 'success',
    source: event.source ?? 'action',
    actorId: event.actorId ?? null,
    projectId: event.projectId ?? null,
    target: truncate(event.target, MAX_TARGET_LENGTH),
    error: truncate(serializeError(event.error), MAX_ERROR_LENGTH),
    metadata,
  }
}

/** Read request metadata when a request scope is available. */
export async function auditRequestContext(): Promise<AuditRequestContext> {
  try {
    const requestHeaders = await headers()
    const forwardedFor = requestHeaders.get('x-forwarded-for')

    return {
      ip: truncate(forwardedFor?.split(',')[0]?.trim() || requestHeaders.get('x-real-ip'), MAX_IP_LENGTH),
      userAgent: truncate(requestHeaders.get('user-agent'), MAX_USER_AGENT_LENGTH),
    }
  } catch {
    return {}
  }
}

async function persist(payload: AuditPayload, request: AuditRequestContext): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        ...payload,
        ip: request.ip ?? null,
        userAgent: request.userAgent ?? null,
        metadata: payload.metadata === null ? Prisma.DbNull : (payload.metadata as Prisma.InputJsonValue),
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logWarning('Audit', `Failed to write audit log for ${payload.action}: ${message}`)
  }
}

/**
 * Audit writer.
 *
 * - `recordAudit.request(event)` — request paths (server actions, pages,
 *   route handlers). Schedules the insert with `after()` so it adds no
 *   latency; it needs a live request.
 * - `recordAudit.background(event)` — work that outlives the response
 *   (indexing jobs, cron, system tasks). Awaits the insert directly, because
 *   `after()` has no request to attach to once the action has answered.
 *
 * Both share payload building, redaction and persistence.
 */
export const recordAudit = {
  request(event: AuditEvent): void {
    const payload = buildAuditPayload(event)

    const run = async () => {
      const request = event.request ?? (await auditRequestContext())
      await persist(payload, request)
    }

    try {
      after(run)
    } catch {
      void run()
    }
  },

  async background(event: AuditEvent): Promise<void> {
    const payload = buildAuditPayload(event)
    const request = event.request ?? (await auditRequestContext())
    await persist(payload, request)
  },
}
