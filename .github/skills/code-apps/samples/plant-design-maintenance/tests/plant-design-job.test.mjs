import assert from 'node:assert/strict'
import test from 'node:test'
import { requestDesignJob } from '../src/lib/plant-design-job.ts'
import { initialDesignBrief } from '../src/lib/plant-design-assistant.ts'
import { DEFAULT_PLANT_DESIGN } from '../src/data/plant-design-sample.ts'

function harness() {
  const design = structuredClone(DEFAULT_PLANT_DESIGN)
  const brief = { ...initialDesignBrief(design), goal: 'Arrange modules' }
  const controller = new AbortController()
  const state = { current: design, request: null, reads: 0, submissions: 0, time: 0 }
  const requestId = '00000000-0000-4000-8000-000000000006'
  const transport = {
    submit: async (request) => { state.request = request; state.submissions++; return { requestId } },
    read: async () => {
      state.reads++
      return { requestId, correlationId: state.request.correlationId, baseHash: state.request.baseHash,
        status: state.reads === 1 ? 'running' : 'succeeded', reply: JSON.stringify(design) }
    },
  }
  const options = { signal: controller.signal, currentDesign: () => state.current, now: () => state.time,
    pause: async (milliseconds) => { state.time += milliseconds } }
  return { design, brief, controller, state, transport, options }
}

test('async design request submits once, checks result and never adopts automatically', async () => {
  const context = harness()
  const before = JSON.stringify(context.design)
  const result = await requestDesignJob(context.design, context.brief, context.transport, context.options)
  assert.equal(context.state.submissions, 1)
  assert.equal(context.state.reads, 2)
  assert.equal(context.state.request.operation, 'plant-design')
  assert.match(context.state.request.baseHash, /^[a-f0-9]{64}$/)
  assert.equal(result.design.id, context.design.id)
  assert.equal(JSON.stringify(context.design), before)
})

test('correlation mismatch, stale design and failed result are rejected', async () => {
  for (const scenario of ['correlation', 'stale', 'failed', 'unknown']) {
    const context = harness()
    context.transport.read = async () => {
      if (scenario === 'stale') context.state.current = { ...context.design, revision: context.design.revision + 1 }
      return { requestId: '00000000-0000-4000-8000-000000000006', correlationId: scenario === 'correlation' ? 'other' : context.state.request.correlationId,
        baseHash: context.state.request.baseHash, status: scenario === 'unknown' ? 'unexpected' : scenario === 'failed' ? 'failed' : 'succeeded', reply: JSON.stringify(context.design) }
    }
    await assert.rejects(requestDesignJob(context.design, context.brief, context.transport, context.options))
  }
})

test('timeout and cancellation discard late output without resubmission', async () => {
  const timed = harness()
  const read = timed.transport.read
  timed.transport.read = async () => { const result = await read(); timed.state.time = 120_000; return { ...result, status: 'succeeded' } }
  await assert.rejects(requestDesignJob(timed.design, timed.brief, timed.transport, timed.options), /timed out/)
  const cancelled = harness()
  cancelled.transport.read = async () => { cancelled.controller.abort(new Error('Cancelled')); return new Promise(() => {}) }
  await assert.rejects(requestDesignJob(cancelled.design, cancelled.brief, cancelled.transport, cancelled.options), /Cancelled/)
  assert.equal(cancelled.state.submissions, 1)
})

test('invalid brief stops before submitting', async () => {
  const context = harness()
  await assert.rejects(requestDesignJob(context.design, { ...context.brief, siteWidth: NaN }, context.transport, context.options))
  assert.equal(context.state.submissions, 0)
})