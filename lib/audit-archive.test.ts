import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildArchivePathname } from './audit-archive'

const rows = (ids: string[]) =>
  ids.map((id) => ({ id, createdAt: new Date('2026-01-02T03:04:05.000Z') }))

test('archive pathname is deterministic for the same batch', () => {
  assert.equal(
    buildArchivePathname(rows(['clx1', 'clx2', 'clx3'])),
    buildArchivePathname(rows(['clx1', 'clx2', 'clx3']))
  )
})

test('archive pathname changes when the batch changes', () => {
  assert.notEqual(
    buildArchivePathname(rows(['clx1', 'clx2'])),
    buildArchivePathname(rows(['clx1', 'clx3']))
  )
})

test('archive pathname is date-partitioned and gzipped', () => {
  assert.match(
    buildArchivePathname(rows(['clx1'])),
    /^audit\/2026-01-02\/audit-[a-f0-9]{16}\.ndjson\.gz$/
  )
})
