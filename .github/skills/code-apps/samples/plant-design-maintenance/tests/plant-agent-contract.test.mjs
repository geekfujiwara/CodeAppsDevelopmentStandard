import assert from 'node:assert/strict'
import test from 'node:test'
import { bindingFilter, createRequestGate, parseAgentReply, parseStartedConversationId, selectionKey, validSourceIndex } from '../src/lib/plant-agent-contract.ts'

test('binding requires revision and keeps exact node and part IDs', () => {
  const selection = { modelId: "plant'1", modelRevision: 2, nodeId: 'feed/pump', partId: 'seal', label: '' }
  const filter = bindingFilter(selection, 'sample')
  assert.match(filter, /modelid eq 'plant''1'/)
  assert.match(filter, /modelrevision eq 2/)
  assert.match(filter, /nodeid eq 'feed\/pump'/)
  assert.match(filter, /partid eq 'seal'/)
  assert.throws(() => bindingFilter({ ...selection, modelRevision: undefined }, 'sample'))
  assert.throws(() => bindingFilter({ ...selection, modelRevision: 1.5 }, 'sample'))
  assert.notEqual(selectionKey(selection), selectionKey({ ...selection, modelRevision: 3 }))
  assert.match(bindingFilter({ ...selection, partId: undefined }, 'sample'), /partid eq null or sample_partid eq ''/)
})

test('reply parser distinguishes success, failure and missing text', () => {
  assert.deepEqual(parseAgentReply({ success: true, data: { responses: ['first', 'second'], conversationId: 'conv' } }), { text: 'first\n\nsecond', conversationId: 'conv' })
  assert.equal(parseAgentReply({ body: { lastResponse: 'reply' } }).text, 'reply')
  assert.throws(() => parseAgentReply({ success: false, data: { responses: ['not a reply'] } }))
  assert.throws(() => parseAgentReply({ responses: [], conversationId: 'conv' }))
  assert.throws(() => parseAgentReply({ completed: false, responses: ['partial'] }))
  assert.equal(parseAgentReply({ completed: false, isExpectingInput: false, responses: ['final'], conversationId: 'conv' }).text, 'final')
})

test('started conversation parser accepts connector response casing and wrappers', () => {
  assert.equal(parseStartedConversationId({ conversationID: 'one' }), 'one')
  assert.equal(parseStartedConversationId({ ConversationId: 'two' }), 'two')
  assert.equal(parseStartedConversationId({ data: { conversationId: 'three' } }), 'three')
  assert.throws(() => parseStartedConversationId({ conversationID: '' }))
  assert.throws(() => parseStartedConversationId({ success: false, conversationID: 'ignored' }))
})

test('reset, cancellation and unmount invalidate late responses', () => {
  const gate = createRequestGate()
  const old = gate.begin()
  assert.equal(gate.begin(), null)
  gate.invalidate()
  const current = gate.begin()
  assert.equal(gate.current(old), false)
  gate.finish(old)
  assert.equal(gate.current(current), true)
  gate.finish(current)
  assert.equal(gate.current(current), false)
  assert.notEqual(gate.begin(), null)
})

test('source indexes require verified exact pages or a scoped failure part code', () => {
  const id = '00000000-0000-4000-8000-000000000002'
  const drawing = { sample_kbsourceindexid: id, _sample_tagid_value: id, statecode: 0, sample_verified: true, sample_sourcekind: 100000000, _sample_drawingrevisionid_value: id, sample_pagenumber: 2 }
  assert.equal(validSourceIndex(drawing, 'sample', 'sample_kb'), true)
  for (const change of [{ sample_verified: false }, { statecode: 1 }, { sample_pagenumber: undefined }, { sample_pagenumber: 1.5 }, { sample_pagenumber: 0 }, { _sample_documentid_value: id }, { sample_sourcekind: 999 }]) {
    assert.equal(validSourceIndex({ ...drawing, ...change }, 'sample', 'sample_kb'), false)
  }
  const document = { ...drawing, sample_sourcekind: 100000001, _sample_drawingrevisionid_value: null, _sample_documentid_value: id }
  assert.equal(validSourceIndex(document, 'sample', 'sample_kb'), true)
  const failure = { ...drawing, sample_sourcekind: 100000002, _sample_drawingrevisionid_value: null, sample_pagenumber: null, sample_partcode: 'PART-01' }
  assert.equal(validSourceIndex(failure, 'sample', 'sample_kb'), true)
  assert.equal(validSourceIndex({ ...failure, sample_partcode: ' ' }, 'sample', 'sample_kb'), false)
})