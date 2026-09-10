import test from "node:test"
import assert from "node:assert/strict"
import { submitPlantConversation, inspectPlantConversation, waitForPlantConversation } from "../src/lib/plant-conversation-job.ts"

const request = () => ({ conversationId: crypto.randomUUID(), turnId: crypto.randomUUID(), version: 1,
  operation: "plant-design", basis: "design revision 1", selection: "unit1", prompt: "Generate a candidate" })
const receipt = (scope) => ({ requestId: crypto.randomUUID(), scope })
const result = (ticket, status = "succeeded") => ({ ...ticket.scope, requestId: ticket.requestId, status, reply: "answer" })

test("submission occurs once and captures immutable scope", async () => {
  const input = request()
  let calls = 0
  const ticket = await submitPlantConversation({ submit: async () => { calls++; input.version++; return { requestId: crypto.randomUUID() } } }, input)
  assert.equal(calls, 1)
  assert.equal(ticket.scope.version, 1)
  assert.equal(ticket.scope.prompt, undefined)
})

test("result rejects every scope mismatch, unknown status and empty or oversized output", () => {
  const ticket = receipt(request())
  for (const key of ["requestId", "conversationId", "turnId", "version", "operation", "basis", "selection"]) {
    assert.throws(() => inspectPlantConversation(ticket, { ...result(ticket), [key]: "other" }))
  }
  for (const patch of [{ status: "Completed" }, { reply: " " }, { reply: "あ".repeat(170000) }]) {
    assert.throws(() => inspectPlantConversation(ticket, { ...result(ticket), ...patch }))
  }
})

test("polling and resuming only read the same accepted request", async () => {
  const ticket = receipt(request())
  let reads = 0
  const statuses = []
  const transport = { submit: () => assert.fail("must not resubmit"), read: async (id) => {
    assert.equal(id, ticket.requestId)
    return result(ticket, ++reads === 1 ? "running" : "succeeded")
  } }
  const options = { signal: new AbortController().signal, isCurrent: () => true, pause: async () => {}, onStatus: (status) => statuses.push(status) }
  assert.equal(await waitForPlantConversation(transport, ticket, options), "answer")
  assert.deepEqual(statuses, ["running", "succeeded"])
  assert.equal(await waitForPlantConversation(transport, ticket, options), "answer")
})

test("late answers after selection changes and cancelled or hung reads cannot apply", async () => {
  const ticket = receipt(request())
  let current = true
  await assert.rejects(waitForPlantConversation({ read: async () => { current = false; return result(ticket) } }, ticket,
    { signal: new AbortController().signal, isCurrent: () => current }), /変更/)
  const controller = new AbortController()
  const pending = waitForPlantConversation({ read: async () => { controller.abort(new Error("cancelled")); return new Promise(() => {}) } }, ticket,
    { signal: controller.signal, isCurrent: () => true })
  await assert.rejects(pending, /cancelled/)
})