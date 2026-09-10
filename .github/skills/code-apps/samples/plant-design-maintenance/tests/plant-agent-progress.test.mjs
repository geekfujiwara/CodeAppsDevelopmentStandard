import assert from 'node:assert/strict'
import test from 'node:test'
import { waitForPlantConversation, PlantConversationReconciliationError } from '../src/lib/plant-conversation-job.ts'
import { plantProgressLabel } from '../src/lib/plant-agent-progress.ts'

const scope = {
  conversationId: '00000000-0000-4000-8000-000000000002',
  turnId: '00000000-0000-4000-8000-000000000003', version: 1,
  operation: 'plant-knowledge', basis: 'question', selection: 'equipment',
}
const receipt = { requestId: '00000000-0000-4000-8000-000000000004', scope }

test('progress reports only scoped observations and redacts provider diagnostics', async () => {
  const observations = []
  const states = [
    { status: 'pending' },
    { status: 'running', diagnostic: 'OtherProviderDetail', token: 'SECRET' },
    { status: 'succeeded', reply: 'answer' },
  ]
  const reply = await waitForPlantConversation({ read: async () => ({ ...scope, requestId: receipt.requestId, ...states.shift() }) }, receipt,
    { signal: new AbortController().signal, isCurrent: () => true, pause: async () => {}, onProgress: value => observations.push(value) })
  assert.equal(reply, 'answer')
  assert.deepEqual(observations.map(value => value.status), ['pending', 'running', 'succeeded'])
  assert.equal(observations[1].needsReconciliation, false)
  assert.equal(plantProgressLabel(observations[1]), 'Workflowが要求を処理中・回答待ち')
  assert.ok(observations.every(value => Number.isFinite(value.checkedAt) && value.requestId === receipt.requestId))
  assert.ok(!JSON.stringify(observations).includes('SECRET'))
})

test('late and mismatched results cannot emit progress', async () => {
  let current = true
  let emitted = 0
  for (const mismatch of [false, true]) {
    current = true
    await assert.rejects(waitForPlantConversation({ read: async () => {
      if (!mismatch) current = false
      return { ...scope, requestId: mismatch ? scope.turnId : receipt.requestId, status: 'running' }
    } }, receipt, { signal: new AbortController().signal, isCurrent: () => current, onProgress: () => emitted++ }))
  }
  assert.equal(emitted, 0)
})

test('labels do not invent tool activity or advance by elapsed time', () => {
  assert.equal(plantProgressLabel(), '利用者・選択対象と要求の受付を確認中')
  assert.equal(plantProgressLabel({status:'running',needsReconciliation:false}), 'Workflowが要求を処理中・回答待ち')
})

test('reconciliation stops after one scoped read without waiting or resubmitting', async () => {
  for (const diagnostic of ['AgentOutputRequiresReconciliation', 'AgentInvocationIndeterminate']) {
    let reads = 0
    const observations = []
    await assert.rejects(waitForPlantConversation({ read: async () => {
      reads++
      return { ...scope, requestId: receipt.requestId, status: 'running', diagnostic }
    } }, receipt, { signal: new AbortController().signal, isCurrent: () => true,
      pause: async () => assert.fail('must not keep waiting'), onProgress: value => observations.push(value) }),
    error => error instanceof PlantConversationReconciliationError && error.message.includes(receipt.requestId))
    assert.equal(reads, 1)
    assert.equal(observations[0].needsReconciliation, true)
  }
})