import assert from 'node:assert/strict'
import test from 'node:test'
import { plantAgentQuickReplies } from '../src/lib/plant-agent-quick-replies.ts'
import { plantWaitPlan, waitPlanStep } from '../src/lib/plant-agent-wait-plan.ts'

const selection = { modelId: 'plant', modelRevision: 1, nodeId: 'tk101', label: 'Tank' }

test('image quick reply describes Dataverse cache retrieval without agent invocation', () => {
  const question = plantAgentQuickReplies(selection).groups.find(group => group.id === 'drawings').replies[0].text
  const plan = plantWaitPlan(selection, question)
  assert.equal(plan.title, '図面画像')
  assert.deepEqual(plan.steps.map(step => step.tool), ['ListRecordsWithOrganization', 'ListRecordsWithOrganization', ''])
})

test('every quick reply selects its group while free text and design remain generic', () => {
  for (const group of plantAgentQuickReplies(selection).groups) {
    for (const reply of group.replies) {
      const plan = plantWaitPlan(selection, reply.text)
      assert.equal(plan.steps[0].tool, reply.title === '図面画像' ? 'ListRecordsWithOrganization' : 'read_query')
      if (group.id === 'failures') assert.ok(plan.steps.some(step => step.tool === 'search_failure_records'))
      assert.ok(plantWaitPlan(selection, reply.text, true).steps.every(step => step.tool === ''))
    }
  }
  assert.ok(plantWaitPlan(selection, '故障MCPで調べて').steps.every(step => step.tool === ''))
})

test('elapsed time only selects a bounded illustration step and never mutates evidence', () => {
  const plan = plantWaitPlan(selection, 'question')
  const before = JSON.stringify(plan)
  assert.equal(waitPlanStep(plan, -1), 0)
  assert.equal(waitPlanStep(plan, NaN), 0)
  assert.equal(waitPlanStep(plan, 14), 1)
  assert.equal(waitPlanStep(plan, 99999), plan.steps.length - 1)
  assert.equal(JSON.stringify(plan), before)
  assert.ok(plan.steps.every(step => !('status' in step) && !('completed' in step)))
})