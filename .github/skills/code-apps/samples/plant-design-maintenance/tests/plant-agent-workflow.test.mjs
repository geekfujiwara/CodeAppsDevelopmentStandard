import test from "node:test"
import assert from "node:assert/strict"
import { createPlantAgentWorkflowClient, workflowChatPrompt } from "../src/lib/plant-agent-workflow.ts"

const context = { principalKey: "tenant/user/environment", environmentId: "environment" }
const options = () => ({ operation: "plant-knowledge", selection: "pump1", signal: new AbortController().signal, isCurrent: () => true })
test("workflow conversation context is bounded, fenced and separated from the latest request", () => {
  const prompt = workflowChatPrompt("latest question", Array.from({ length: 10 }, () => ({ role: "user", text: "```" + "x".repeat(3000) })))
  assert.equal(prompt.match(/```/g).length, 2)
  assert.equal(JSON.parse(prompt.split("```json\n")[1].split("\n```")[0]).history.length, 6)
  assert.ok(prompt.endsWith("latest question"))
})
function fixture() {
  let submissions = 0
  let saved
  const requestId = crypto.randomUUID()
  const transport = { submit: async (request) => { submissions++; saved = request; return { requestId } },
    read: async () => ({ ...saved, requestId, status: "succeeded", reply: "Verified answer" }) }
  return { transport, count: () => submissions }
}

test("workflow returns a correlated answer and refuses a different environment", async () => {
  const state = fixture()
  const client = createPlantAgentWorkflowClient(state.transport, async () => context)
  const conversationId = crypto.randomUUID()
  await assert.rejects(client("question", "other", conversationId, options()))
  assert.equal(state.count(), 0)
  assert.deepEqual(await client("question", context.environmentId, conversationId, options()), { text: "Verified answer", conversationId })
})

test("a failed read resumes the existing receipt instead of submitting again", async () => {
  const state = fixture()
  const original = state.transport.read
  state.transport.read = async () => { throw new Error("connection lost") }
  const client = createPlantAgentWorkflowClient(state.transport, async () => context)
  const conversationId = crypto.randomUUID()
  await assert.rejects(client("question", context.environmentId, conversationId, options()), /connection lost/)
  state.transport.read = original
  await client("question", context.environmentId, conversationId, options())
  assert.equal(state.count(), 1)
})

test("unknown submission outcome locks the conversation without automatic retry", async () => {
  let submissions = 0
  const client = createPlantAgentWorkflowClient({ submit: async () => { submissions++; throw new Error("network") } }, async () => context)
  const conversationId = crypto.randomUUID()
  await assert.rejects(client("question", context.environmentId, conversationId, options()), /network/)
  await assert.rejects(client("question", context.environmentId, conversationId, options()), /未確定/)
  assert.equal(submissions, 1)
})

test("identity changes after the read reject the answer", async () => {
  const state = fixture()
  let checks = 0
  const client = createPlantAgentWorkflowClient(state.transport, async () => ++checks === 1 ? context : { ...context, principalKey: "other user" })
  await assert.rejects(client("question", context.environmentId, crypto.randomUUID(), options()), /利用者/)
})

test("confirmed failed execution releases the turn for an explicit new request", async () => {
  const state = fixture()
  const read = state.transport.read
  state.transport.read = async () => ({ ...await read(), status: "failed" })
  const client = createPlantAgentWorkflowClient(state.transport, async () => context)
  const conversationId = crypto.randomUUID()
  await assert.rejects(client("question", context.environmentId, conversationId, options()), /failed/)
  state.transport.read = read
  await client("revised question", context.environmentId, conversationId, options())
  assert.equal(state.count(), 2)
})

test("workflow forwards scoped progress without another submission", async () => {
  const state = fixture()
  const client = createPlantAgentWorkflowClient(state.transport, async () => context)
  const observations = []
  await client("question", context.environmentId, crypto.randomUUID(), { ...options(), onProgress: value => observations.push(value) })
  assert.equal(state.count(), 1)
  assert.deepEqual(observations.map(value => value.status), ["succeeded"])
  assert.ok(observations[0].requestId)
})