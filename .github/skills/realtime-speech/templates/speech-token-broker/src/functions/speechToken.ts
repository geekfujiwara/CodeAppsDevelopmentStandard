import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions"
import { verifyRequest } from "../lib/auth"
import { getSpeechToken, speechRegion } from "../lib/speech"

const NO_STORE = { "Cache-Control": "no-store", "Content-Type": "application/json" }

export async function speechToken(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const auth = await verifyRequest(request.headers.get("authorization"))
  if (!auth.ok) {
    context.warn(`speech-token rejected: ${auth.reason}`)
    return { status: 401, headers: { ...NO_STORE, "WWW-Authenticate": "Bearer" }, jsonBody: { error: "unauthorized" } }
  }

  try {
    const { token, expiresAt } = await getSpeechToken()
    // トークン本体はログに出さない
    context.log(`speech-token issued for oid=${auth.caller.oid} upn=${auth.caller.upn ?? "-"} client=${auth.caller.appId ?? "-"}`)
    return {
      status: 200,
      headers: NO_STORE,
      jsonBody: { token, region: speechRegion, expiresAt: new Date(expiresAt).toISOString(), expiresInSeconds: Math.round((expiresAt - Date.now()) / 1000) },
    }
  } catch (error) {
    context.error(`speech-token failed: ${(error as Error).message}`)
    return { status: 502, headers: NO_STORE, jsonBody: { error: "speech token unavailable" } }
  }
}

app.http("speechToken", {
  route: "speech/token",
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  handler: speechToken,
})
