import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { prisma } from '@/prisma/client'
import { logInfo } from './logger'
import { getAuditSink } from './audit-sink'

/**
 * Move audit rows older than the retention window out of Postgres and into
 * compressed NDJSON files.
 *
 * Order matters: rows are uploaded first and deleted only after a successful
 * write, so a failed archive never loses the trail. Batch names are derived
 * from the row ids and uploads overwrite, so a retry after a crash rewrites
 * the same object instead of duplicating it.
 */

export interface ArchiveOptions {
  retentionDays?: number
  batchSize?: number
  now?: Date
}

export interface ArchiveResult {
  archived: number
  deleted: number
  files: string[]
  sink: string
  cutoff: string
}

const DEFAULT_RETENTION_DAYS = 90
const DEFAULT_BATCH_SIZE = 1000
const MAX_BATCH_SIZE = 5000

/**
 * Deterministic object name for a batch: same rows -> same path, so a retried
 * upload overwrites its own file instead of producing a second copy.
 */
export function buildArchivePathname(rows: Array<{ id: string; createdAt: Date }>): string {
  const day = rows[0].createdAt.toISOString().slice(0, 10)
  const hash = createHash('sha256')
    .update(rows.map((row) => row.id).join(','))
    .digest('hex')
    .slice(0, 16)

  return `audit/${day}/audit-${hash}.ndjson.gz`
}

export async function archiveAuditLogs(options: ArchiveOptions = {}): Promise<ArchiveResult> {
  const retentionDays = options.retentionDays ?? Number(process.env.AUDIT_RETENTION_DAYS ?? DEFAULT_RETENTION_DAYS)
  const batchSize = Math.min(options.batchSize ?? DEFAULT_BATCH_SIZE, MAX_BATCH_SIZE)
  const cutoff = new Date((options.now ?? new Date()).getTime() - retentionDays * 24 * 60 * 60 * 1000)

  const sink = getAuditSink()
  const files: string[] = []
  let archived = 0
  let deleted = 0

  while (true) {
    const rows = await prisma.auditLog.findMany({
      where: { createdAt: { lt: cutoff } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: batchSize,
    })

    if (rows.length === 0) break

    const ndjson = rows.map((row) => JSON.stringify(row)).join('\n') + '\n'
    const compressed = gzipSync(Buffer.from(ndjson, 'utf8'))

    const pathname = buildArchivePathname(rows)

    await sink.put(pathname, compressed)
    files.push(pathname)
    archived += rows.length

    // Only remove what was just persisted.
    const result = await prisma.auditLog.deleteMany({
      where: { id: { in: rows.map((row) => row.id) } },
    })
    deleted += result.count

    logInfo(
      'AuditArchive',
      `Archived ${rows.length} rows to ${sink.name}:${pathname} (deleted ${result.count})`
    )

    if (rows.length < batchSize) break
  }

  return {
    archived,
    deleted,
    files,
    sink: sink.name,
    cutoff: cutoff.toISOString(),
  }
}
