import type { PlantDesign } from "../data/plant-design.ts"
import { MAX_AGENT_QUESTION_LENGTH } from "./plant-agent-contract.ts"
import { applyDesignPlan, buildDesignPrompt, validateDesignBrief, type DesignBrief, type DesignPlanResult } from "./plant-design-assistant.ts"

export type DesignJobRequest = {
  correlationId: string
  operation: "plant-design"
  baseDesignId: string
  baseRevision: number
  baseHash: string
  prompt: string
  expiresAt: number
}

export type DesignJobResult = {
  requestId: string
  correlationId: string
  baseHash: string
  status: "pending" | "running" | "succeeded" | "failed" | "cancelled"
  reply?: string
}

export type DesignJobTransport = {
  submit: (request: DesignJobRequest, signal: AbortSignal) => Promise<{ requestId: string }>
  read: (requestId: string, signal: AbortSignal) => Promise<DesignJobResult>
}

export type DesignJobOptions = {
  signal: AbortSignal
  currentDesign: () => PlantDesign
  now?: () => number
  pause?: (milliseconds: number, signal: AbortSignal) => Promise<void>
}

const TIMEOUT_MS = 120_000
const POLL_MS = 2_000
const MAX_READS = 60
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function checkActive(signal: AbortSignal, expiresAt: number, now: () => number) {
  signal.throwIfAborted()
  if (now() >= expiresAt) throw new Error("Design request timed out")
}

function pause(milliseconds: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason) }
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve() }, milliseconds)
    signal.addEventListener("abort", abort, { once: true })
  })
}

async function fingerprint(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

export async function requestDesignJob(
  design: PlantDesign,
  brief: DesignBrief,
  transport: DesignJobTransport,
  options: DesignJobOptions,
): Promise<DesignPlanResult> {
  const errors = validateDesignBrief(brief)
  if (errors.length || !brief.goal.trim()) throw new Error("Invalid design brief")
  const basis = JSON.stringify(design)
  const snapshot = JSON.parse(basis) as PlantDesign
  const briefSnapshot = { ...brief }
  const prompt = buildDesignPrompt(snapshot, briefSnapshot)
  if (prompt.length > MAX_AGENT_QUESTION_LENGTH) throw new Error("Design request exceeds input limit")
  const now = options.now ?? Date.now
  const expiresAt = now() + TIMEOUT_MS
  const controller = new AbortController()
  const abort = () => controller.abort(options.signal.reason)
  options.signal.throwIfAborted()
  options.signal.addEventListener("abort", abort, { once: true })
  const timer = setTimeout(() => controller.abort(new Error("Design request timed out")), TIMEOUT_MS)
  const signal = controller.signal

  async function bounded<Value>(operation: () => Promise<Value>): Promise<Value> {
    checkActive(signal, expiresAt, now)
    return new Promise<Value>((resolve, reject) => {
      const onAbort = () => reject(signal.reason)
      signal.addEventListener("abort", onAbort, { once: true })
      Promise.resolve().then(operation).then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort))
    })
  }

  try {
    const request: DesignJobRequest = {
      correlationId: crypto.randomUUID(), operation: "plant-design", baseDesignId: snapshot.id,
      baseRevision: snapshot.revision, baseHash: await fingerprint(basis), prompt, expiresAt,
    }
    const submitted = await bounded(() => transport.submit(request, signal))
    if (!GUID.test(submitted.requestId)) throw new Error("Invalid design request ID")
    for (let attempt = 0; attempt < MAX_READS; attempt++) {
      checkActive(signal, expiresAt, now)
      if (JSON.stringify(options.currentDesign()) !== basis) throw new Error("Base design changed")
      const result = await bounded(() => transport.read(submitted.requestId, signal))
      checkActive(signal, expiresAt, now)
      if (JSON.stringify(options.currentDesign()) !== basis) throw new Error("Base design changed")
      if (result.requestId !== submitted.requestId || result.correlationId !== request.correlationId || result.baseHash !== request.baseHash) {
        throw new Error("Design result correlation mismatch")
      }
      if (result.status === "succeeded") {
        if (typeof result.reply !== "string" || !result.reply.trim()) throw new Error("Missing design response")
        return applyDesignPlan(snapshot, result.reply, briefSnapshot)
      }
      if (result.status === "failed" || result.status === "cancelled") throw new Error("Design request " + result.status)
      if (result.status !== "pending" && result.status !== "running") throw new Error("Unknown design request status")
      await bounded(() => (options.pause ?? pause)(Math.min(POLL_MS, Math.max(0, expiresAt - now())), signal))
    }
    throw new Error("Design request exceeded read limit")
  } finally {
    clearTimeout(timer)
    options.signal.removeEventListener("abort", abort)
    controller.abort()
  }
}