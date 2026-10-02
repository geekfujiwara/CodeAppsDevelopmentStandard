const test = require("node:test")
const assert = require("node:assert/strict")
const { resolveModelOptions, allowedDeployments, sttEndpoints, publicConfig } = require("../dist/src/lib/options.js")
const { validateTranscribeRequest, definitionOf, MAI_PHRASE_LIMIT } = require("../dist/src/lib/transcribe.js")
const { chatBody } = require("../dist/src/lib/answer.js")

const ENDPOINTS = JSON.stringify([
  { id: "sea", label: "MAI（東南アジア）", endpoint: "https://contoso-mai.cognitiveservices.azure.com", region: "southeastasia", models: ["MAI-Transcribe-1.5", "MAI-Transcribe-2"] },
  { id: "bad", label: "不正", endpoint: "https://evil.example.com", region: "x", models: ["fast"] },
])

function withEnv(values, fn) {
  const saved = {}
  for (const [k, v] of Object.entries(values)) {
    saved[k] = process.env[k]
    process.env[k] = v
  }
  try {
    fn()
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
}

const wav = (bytes = 1000) => {
  const b = Buffer.alloc(44 + bytes)
  b.write("RIFF", 0)
  b.write("WAVE", 8)
  return b.toString("base64")
}

test("モデルの選択は許可リストのデプロイだけを通し、推論の強さと上限を検証する", () => {
  withEnv({ AOAI_DEPLOYMENT: "gpt-5.4-mini", AOAI_DEPLOYMENTS: "gpt-5.4-mini, gpt-4.1-mini", AOAI_REASONING_EFFORT: "none" }, () => {
    assert.deepEqual(allowedDeployments(), ["gpt-5.4-mini", "gpt-4.1-mini"])
    assert.deepEqual(resolveModelOptions(undefined, "answer"), { ok: true, value: { deployment: "gpt-5.4-mini", reasoningEffort: "none", maxTokens: 1200 } })
    assert.equal(resolveModelOptions({ deployment: "gpt-4.1-mini", reasoningEffort: "low", maxTokens: 600 }, "answer").ok, true)
    assert.equal(resolveModelOptions({ deployment: "gpt-5.5" }, "answer").ok, false)
    assert.equal(resolveModelOptions({ reasoningEffort: "high" }, "answer").ok, false)
    assert.equal(resolveModelOptions({ maxTokens: 5000 }, "answer").ok, false)
    assert.equal(resolveModelOptions({ maxTokens: 300 }, "identify").ok, true)
    assert.equal(resolveModelOptions({ maxTokens: 800 }, "identify").ok, false)
  })
})

test("GPT-4 系は max_tokens を上限 800 に、GPT-5 系は指定の max_completion_tokens と推論の強さで呼ぶ", () => {
  assert.equal(chatBody("gpt-4.1-mini", [], "low", 1500).max_tokens, 800)
  const b = chatBody("gpt-5.4-mini", [], "low", 600)
  assert.equal(b.max_completion_tokens, 600)
  assert.equal(b.reasoning_effort, "low")
})

test("文字起こしの接続先は cognitiveservices の URL だけを許可し、画面には URL を返さない", () => {
  withEnv({ STT_ENDPOINTS: ENDPOINTS, AOAI_DEPLOYMENT: "gpt-5.4-mini" }, () => {
    assert.deepEqual(sttEndpoints().map((e) => e.id), ["sea"])
    const cfg = publicConfig()
    assert.equal(JSON.stringify(cfg).includes("cognitiveservices"), false)
    assert.deepEqual(cfg.stt[0].models, ["MAI-Transcribe-1.5", "MAI-Transcribe-2"])
  })
  withEnv({ STT_ENDPOINTS: "not json" }, () => assert.deepEqual(sttEndpoints(), []))
})

test("文字起こしの要求は接続先・モデル・WAV・大きさを検証し、キーワードを上限で切る", () => {
  withEnv({ STT_ENDPOINTS: ENDPOINTS }, () => {
    const ok = validateTranscribeRequest({ endpointId: "sea", model: "MAI-Transcribe-1.5", audio: wav(), phrases: Array.from({ length: 300 }, (_, i) => `語${i}`), style: "clean" })
    assert.equal(ok.ok, true)
    assert.equal(ok.value.phrases.length, MAI_PHRASE_LIMIT)
    assert.equal(validateTranscribeRequest({ endpointId: "bad", model: "fast", audio: wav() }).ok, false)
    assert.equal(validateTranscribeRequest({ endpointId: "sea", model: "MAI-Transcribe-9", audio: wav() }).ok, false)
    assert.equal(validateTranscribeRequest({ endpointId: "sea", model: "MAI-Transcribe-2", audio: Buffer.from("not a wav").toString("base64") }).ok, false)
    assert.equal(validateTranscribeRequest({ endpointId: "sea", model: "MAI-Transcribe-2", audio: wav(5 * 1024 * 1024) }).ok, false)
  })
})

test("MAI は enhancedMode でモデルを指定して言語は ja、既定モデルは ja-JP で呼ぶ", () => {
  const mai = definitionOf({ endpointId: "sea", model: "MAI-Transcribe-1.5", audio: "", locale: "ja", phrases: ["株主番号"], style: "clean" })
  assert.deepEqual(mai.locales, ["ja"])
  assert.deepEqual(mai.enhancedMode, { enabled: true, model: "MAI-Transcribe-1.5", modelOptions: { transcribeStyle: "clean" } })
  assert.deepEqual(mai.phraseList, { phrases: ["株主番号"] })
  const fast = definitionOf({ endpointId: "jpe", model: "fast", audio: "", locale: "ja", phrases: [] })
  assert.deepEqual(fast.locales, ["ja-JP"])
  assert.equal(fast.enhancedMode, undefined)
})
