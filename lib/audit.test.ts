import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AUDIT_ACTIONS, buildAuditPayload, redactAuditMetadata } from './audit'

test('redacts sensitive keys recursively', () => {
  const input = {
    purpose: 'CHAT',
    apiKey: 'sk-live-should-not-be-stored',
    nested: { authorization: 'Bearer abc', model: 'gpt-4o' },
    list: [{ token: 'secret-token' }],
  }

  assert.deepEqual(redactAuditMetadata(input), {
    purpose: 'CHAT',
    apiKey: '[redacted]',
    nested: { authorization: '[redacted]', model: 'gpt-4o' },
    list: [{ token: '[redacted]' }],
  })
})

test('applies defaults for status and source', () => {
  const payload = buildAuditPayload({
    action: AUDIT_ACTIONS.PROJECT_CREATE,
    actorId: 'user_123',
    projectId: 'proj_1',
  })

  assert.equal(payload.status, 'success')
  assert.equal(payload.source, 'action')
  assert.equal(payload.actorId, 'user_123')
  assert.equal(payload.projectId, 'proj_1')
  assert.equal(payload.metadata, null)
})

test('redacts metadata before persisting', () => {
  const payload = buildAuditPayload({
    action: AUDIT_ACTIONS.AI_CONFIG_SAVE,
    metadata: { purpose: 'CHAT', apiKey: 'sk-live', model: 'm' },
  })

  assert.deepEqual(payload.metadata, { purpose: 'CHAT', apiKey: '[redacted]', model: 'm' })
})

test('truncates oversized target and error fields', () => {
  const payload = buildAuditPayload({
    action: AUDIT_ACTIONS.PROJECT_CREATE,
    target: 'x'.repeat(500),
    error: new Error('e'.repeat(2000)),
  })

  assert.ok((payload.target ?? '').length <= 201)
  assert.ok((payload.error ?? '').length <= 1001)
})

test('caps oversized metadata instead of storing it', () => {
  const payload = buildAuditPayload({
    action: AUDIT_ACTIONS.PROJECT_CREATE,
    metadata: { blob: 'x'.repeat(5000), keep: 'value' },
  })

  assert.deepEqual(payload.metadata, { truncated: true, keys: ['blob', 'keep'] })
})
