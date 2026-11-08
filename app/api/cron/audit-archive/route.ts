import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { archiveAuditLogs } from '@/lib/audit-archive'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isAuthorized(header: string | null, secret: string): boolean {
  if (!header) return false

  const expected = Buffer.from(`Bearer ${secret}`)
  const received = Buffer.from(header)

  return received.length === expected.length && timingSafeEqual(received, expected)
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET

  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 500 })
  }

  if (!isAuthorized(request.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await archiveAuditLogs()
    return NextResponse.json({ ok: true, ...result })
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message ?? String(error) },
      { status: 500 }
    )
  }
}
