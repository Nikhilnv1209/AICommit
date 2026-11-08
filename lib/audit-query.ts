import { Prisma } from '@prisma/client'
import { prisma } from '@/prisma/client'
import {
  AUDIT_ACTIONS_LIST,
  type AuditAction,
  type AuditLogView,
  type AuditRange,
  type GetAuditLogsInput,
  type GetAuditLogsResult,
} from './audit-actions'

/**
 * Server-side audit queries.
 *
 * Kept out of the server action so the authorization and cursor logic can be
 * exercised directly. Callers must pass an authenticated userId; this module
 * never trusts an actor/project identifier from the client beyond membership
 * checks.
 */

const AUDIT_RANGES: AuditRange[] = ['24h', '7d', '30d', '90d']

const AUDIT_RANGE_MS: Record<AuditRange, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  '90d': 90 * 24 * 60 * 60 * 1000,
}

function encodeAuditCursor(row: { createdAt: Date; id: string }): string {
  return Buffer.from(JSON.stringify({ t: row.createdAt.toISOString(), i: row.id })).toString('base64url')
}

function decodeAuditCursor(cursor: string): { t: Date; i: string } | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
    const t = new Date(parsed.t)
    if (Number.isNaN(t.getTime()) || typeof parsed.i !== 'string') return null
    return { t, i: parsed.i }
  } catch {
    return null
  }
}

export async function fetchAuditLogs(userId: string, input: GetAuditLogsInput): Promise<GetAuditLogsResult> {
  const limit = Math.min(Math.max(input?.limit ?? 50, 1), 100)
  const range: AuditRange = input?.range && AUDIT_RANGES.includes(input.range) ? input.range : '7d'
  const action =
    input?.action && AUDIT_ACTIONS_LIST.includes(input.action as AuditAction) ? input.action : undefined
  const status = input?.status === 'success' || input?.status === 'failure' ? input.status : undefined

  const where: Prisma.AuditLogWhereInput = {}
  const constraints: Prisma.AuditLogWhereInput[] = []

  if (input?.scope === 'personal') {
    // Personal feed is always the session user's own actions.
    where.actorId = userId
  } else {
    const projectId = input?.projectId
    if (!projectId) {
      return { success: false, events: [], nextCursor: null, error: 'Project is required' }
    }

    const membership = await prisma.userToProject.findFirst({
      where: { userId, projectId },
      select: { userId: true },
    })
    if (!membership) {
      return { success: false, events: [], nextCursor: null, error: 'Access denied' }
    }

    where.projectId = projectId
  }

  if (action) where.action = action
  if (status) where.status = status

  constraints.push({ createdAt: { gte: new Date(Date.now() - AUDIT_RANGE_MS[range]) } })

  const cursor = input?.cursor ? decodeAuditCursor(input.cursor) : null
  if (cursor) {
    constraints.push({
      OR: [{ createdAt: { lt: cursor.t } }, { createdAt: cursor.t, id: { lt: cursor.i } }],
    })
  }

  where.AND = constraints

  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  })

  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows

  const actorIds = [...new Set(page.map((row) => row.actorId).filter((id): id is string => Boolean(id)))]
  const projectIds = [...new Set(page.map((row) => row.projectId).filter((id): id is string => Boolean(id)))]

  const [actors, projects] = await Promise.all([
    actorIds.length
      ? prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, firstName: true, lastName: true, imageUrl: true },
        })
      : [],
    projectIds.length
      ? prisma.project.findMany({
          // Only name projects the caller still belongs to.
          where: { id: { in: projectIds }, userToProject: { some: { userId } } },
          select: { id: true, name: true },
        })
      : [],
  ])

  const actorById = new Map(actors.map((actor) => [actor.id, actor]))
  const projectById = new Map(projects.map((project) => [project.id, project]))

  const events: AuditLogView[] = page.map((row) => ({
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    action: row.action,
    status: row.status,
    source: row.source,
    actorId: row.actorId,
    actor: row.actorId ? actorById.get(row.actorId) ?? null : null,
    projectId: row.projectId,
    projectName: row.projectId ? projectById.get(row.projectId)?.name ?? null : null,
    target: row.target,
    metadata: row.metadata ?? null,
    error: row.error,
  }))

  const last = page[page.length - 1]

  return {
    success: true,
    events,
    nextCursor: hasMore && last ? encodeAuditCursor(last) : null,
  }
}
