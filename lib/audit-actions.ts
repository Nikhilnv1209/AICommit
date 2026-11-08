/**
 * Client-safe audit definitions.
 *
 * Kept separate from lib/audit.ts because that module imports Prisma and
 * next/headers; importing it from a Client Component would drag server-only
 * code into the browser bundle.
 */

export const AUDIT_ACTIONS = {
  USER_SYNC: 'user.sync',
  PROJECT_CREATE: 'project.create',
  PROJECT_ARCHIVE: 'project.archive',
  PROJECT_JOIN: 'project.join',
  PROJECT_REINDEX: 'project.reindex',
  AI_CONFIG_SAVE: 'ai_config.save',
  AI_CONFIG_DELETE: 'ai_config.delete',
  MEETING_CREATE: 'meeting.create',
  MEETING_DELETE: 'meeting.delete',
  MEETING_PROCESS: 'meeting.process',
  CREDIT_PURCHASE: 'credit.purchase',
  CONVERSATION_DELETE: 'conversation.delete',
  MESSAGE_EDIT: 'message.edit',
} as const

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS]
export type AuditStatus = 'success' | 'failure'
export type AuditSource = 'action' | 'api' | 'webhook' | 'system' | 'cron'

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  [AUDIT_ACTIONS.USER_SYNC]: 'Synced account',
  [AUDIT_ACTIONS.PROJECT_CREATE]: 'Created project',
  [AUDIT_ACTIONS.PROJECT_ARCHIVE]: 'Archived project',
  [AUDIT_ACTIONS.PROJECT_JOIN]: 'Joined project',
  [AUDIT_ACTIONS.PROJECT_REINDEX]: 'Reindexed project',
  [AUDIT_ACTIONS.AI_CONFIG_SAVE]: 'Changed AI config',
  [AUDIT_ACTIONS.AI_CONFIG_DELETE]: 'Removed AI config',
  [AUDIT_ACTIONS.MEETING_CREATE]: 'Added meeting',
  [AUDIT_ACTIONS.MEETING_DELETE]: 'Deleted meeting',
  [AUDIT_ACTIONS.MEETING_PROCESS]: 'Processed meeting',
  [AUDIT_ACTIONS.CREDIT_PURCHASE]: 'Purchased credits',
  [AUDIT_ACTIONS.CONVERSATION_DELETE]: 'Deleted conversation',
  [AUDIT_ACTIONS.MESSAGE_EDIT]: 'Edited message',
}

export const AUDIT_ACTION_GROUPS: Array<{ label: string; actions: AuditAction[] }> = [
  {
    label: 'Project',
    actions: [
      AUDIT_ACTIONS.PROJECT_CREATE,
      AUDIT_ACTIONS.PROJECT_ARCHIVE,
      AUDIT_ACTIONS.PROJECT_JOIN,
      AUDIT_ACTIONS.PROJECT_REINDEX,
    ],
  },
  {
    label: 'AI config',
    actions: [AUDIT_ACTIONS.AI_CONFIG_SAVE, AUDIT_ACTIONS.AI_CONFIG_DELETE],
  },
  {
    label: 'Meetings',
    actions: [
      AUDIT_ACTIONS.MEETING_CREATE,
      AUDIT_ACTIONS.MEETING_DELETE,
      AUDIT_ACTIONS.MEETING_PROCESS,
    ],
  },
  {
    label: 'Conversations',
    actions: [AUDIT_ACTIONS.CONVERSATION_DELETE, AUDIT_ACTIONS.MESSAGE_EDIT],
  },
  {
    label: 'Account',
    actions: [AUDIT_ACTIONS.USER_SYNC, AUDIT_ACTIONS.CREDIT_PURCHASE],
  },
]

export const AUDIT_ACTIONS_LIST: AuditAction[] = Object.values(AUDIT_ACTIONS)

export interface AuditActorView {
  id: string
  firstName: string
  lastName: string
  imageUrl: string | null
}

export interface AuditLogView {
  id: string
  createdAt: string
  action: string
  status: string
  source: string
  actorId: string | null
  actor: AuditActorView | null
  projectId: string | null
  projectName: string | null
  target: string | null
  metadata: unknown
  error: string | null
}

export type AuditRange = '24h' | '7d' | '30d' | '90d'

export interface GetAuditLogsInput {
  scope: 'project' | 'personal'
  projectId?: string
  cursor?: string | null
  limit?: number
  action?: string
  status?: AuditStatus
  range?: AuditRange
}

export interface GetAuditLogsResult {
  success: boolean
  events: AuditLogView[]
  nextCursor: string | null
  error?: string
}
