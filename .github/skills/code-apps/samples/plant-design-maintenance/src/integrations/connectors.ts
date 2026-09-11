type ConnectorResult = { success: boolean; data?: Record<string, unknown>; error?: unknown }
type Connector = Record<string, (...args: unknown[]) => Promise<ConnectorResult>>

function disconnected(name: string): Connector {
  return new Proxy({}, {
    get: () => async () => { throw new Error(`${name}: 接続アダプターが未設定です。サンプルは外部サービスを呼び出していません。`) },
  })
}

export const MicrosoftDataverseService = disconnected("Dataverse")
export const MicrosoftCopilotStudioService = disconnected("Copilot Studio")
