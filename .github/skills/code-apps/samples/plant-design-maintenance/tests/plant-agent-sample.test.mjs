import assert from 'node:assert/strict'
import test from 'node:test'
import { plantAgentSample, parseSampleAgentAnswer, parseSampleAgentReply } from '../src/data/plant-agent-sample.ts'
import { plantHeat } from '../src/data/plant-maintenance.ts'
import { PLANT_SAMPLES, plantParts } from '../src/data/plant-catalog.ts'

const filter = { from: '', to: '', unresolvedOnly: false }
test('SA-02 distinguishes SDK failure, incomplete, empty and malformed replies without exposing data', () => {
  const history = plantAgentSample({ modelId: PLANT_SAMPLES[0].id, modelRevision: 1, nodeId: 'p101', label: '' }, filter)
  for (const [value, suffix] of [
    [{ success: false, error: { message: 'PRIVATE_ERROR_DETAIL' } }, 'SDK'],
    [{ data: { completed: false, responses: [] } }, 'INCOMPLETE'],
    [{ completed: false, data: { completed: true, responses: ['not final'] } }, 'INCOMPLETE'],
    [{ success: true, data: { completed: true, responses: [], attachments: [{ content: 'PRIVATE_CARD' }] } }, 'EMPTY'],
    [undefined, 'SHAPE'],
  ]) {
    assert.throws(() => parseSampleAgentReply(value, history), error => {
      assert.equal(error.code, 'response')
      assert.ok(error.message.includes(`[SA-02-${suffix}]`))
      assert.ok(!error.message.includes('PRIVATE'))
      return true
    })
  }
})
test('sample response separates greetings from JSON without weakening citation checks', () => {
  const history = plantAgentSample({ modelId: PLANT_SAMPLES[0].id, modelRevision: 1, nodeId: 'p101', label: '' }, filter)
  const answer = JSON.stringify({ overview: '概要', findings: [{ text: '記録あり', sourceIds: [history.failures[0].id] }], unresolved: [] })
  const envelope = (responses) => ({ success: true, data: { responses, completed: true, conversationId: 'conversation' } })
  assert.equal(parseSampleAgentReply(envelope(['こんにちは', '```json\n' + answer + '\n```']), history).conversationId, 'conversation')
  assert.throws(() => parseSampleAgentReply(envelope(['取得機能未構成']), history), { code: 'format' })
  assert.throws(() => parseSampleAgentReply(envelope([answer, answer]), history), { code: 'format' })
  assert.throws(() => parseSampleAgentReply(envelope([answer.replace(history.failures[0].id, 'invented')]), history), { code: 'evidence' })
  assert.throws(() => parseSampleAgentReply({ completed: false, responses: [answer] }, history), { code: 'response' })
  assert.throws(() => parseSampleAgentReply({ success: false }, history), { code: 'response' })
})
test('sample chat history matches heat counts for exact model, node, part and filters', () => {
  for (const sample of PLANT_SAMPLES) {
    for (const scope of [filter, { from: '2026-03-01', to: '2026-09-01', unresolvedOnly: true }]) {
      const heat = plantHeat(sample.id, scope)
      for (const node of sample.nodes) {
        const selection = { modelId: sample.id, modelRevision: 1, nodeId: node.id, label: node.name }
        const history = plantAgentSample(selection, scope)
        assert.equal(history.failures.length, heat.find(item => item.nodeId === node.id).total)
        for (const part of plantParts(node)) {
          const scoped = plantAgentSample({ ...selection, partId: part.id }, scope)
          assert.equal(scoped.failures.length, heat.find(item => item.nodeId === node.id).parts[part.id] ?? 0)
          assert.ok(scoped.repairs.every(repair => scoped.failures.some(failure => failure.id === repair.failureId)))
        }
      }
    }
  }
})
test('unknown model, node, revision and part never use sample fallback', () => {
  const selection = { modelId: PLANT_SAMPLES[0].id, modelRevision: 1, nodeId: 'p101', label: '' }
  for (const patch of [{ modelId: 'real-model' }, { modelRevision: 2 }, { nodeId: 'missing' }, { partId: 'missing' }]) assert.equal(plantAgentSample({ ...selection, ...patch }, filter), null)
  assert.equal(plantAgentSample(selection, { ...filter, from: '2026-09-01', to: '2026-01-01' }).failures.length, 0)
})
test('v1 sample answer rejects invented sources and unstructured generic answers', () => {
  const history = plantAgentSample({ modelId: PLANT_SAMPLES[0].id, modelRevision: 1, nodeId: 'p101', label: '' }, filter)
  const answer = { overview: '概要', findings: [{ text: '点検記録あり', sourceIds: [history.failures[0].id] }], unresolved: [] }
  assert.match(parseSampleAgentAnswer(JSON.stringify(answer), history), /サンプル履歴/)
  assert.throws(() => parseSampleAgentAnswer(JSON.stringify({ ...answer, findings: [{ text: '不明', sourceIds: ['invented'] }] }), history))
  assert.throws(() => parseSampleAgentAnswer('一般的な回答', history))
})