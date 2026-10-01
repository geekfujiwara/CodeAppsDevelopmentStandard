const test = require("node:test")
const assert = require("node:assert/strict")
const { hasScope, verifyRequest } = require("../dist/src/lib/auth.js")

test("hasScope は scp に必要なスコープがあるときだけ true", () => {
  assert.equal(hasScope({ scp: "Speech.Token offline_access" }, "Speech.Token"), true)
  assert.equal(hasScope({ scp: "Other.Scope" }, "Speech.Token"), false)
  assert.equal(hasScope({ roles: ["Speech.Token"] }, "Speech.Token"), false)
})

test("Bearer が無い要求は拒否する", async () => {
  const result = await verifyRequest(null)
  assert.equal(result.ok, false)
})
