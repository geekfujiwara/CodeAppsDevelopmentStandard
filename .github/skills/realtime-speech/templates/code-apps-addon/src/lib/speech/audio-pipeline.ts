// 依存ゼロ（ブラウザ API と標準の型だけ）。skill の scripts/verify_push_stream.mjs が Node から直接 import する
const targetRate = 16000

export type ChunkHandler = (pcm16: ArrayBuffer, rms: number) => void
export type CaptureMode = "worklet" | "scriptprocessor"

export function downsampleToPcm16(input: Float32Array, inputRate: number): Int16Array {
  const ratio = inputRate / targetRate
  const outLength = Math.floor(input.length / ratio)
  const out = new Int16Array(outLength)
  for (let i = 0; i < outLength; i++) {
    const start = Math.floor(i * ratio)
    const end = Math.min(input.length, Math.floor((i + 1) * ratio))
    let sum = 0
    for (let j = start; j < end; j++) sum += input[j]
    const sample = Math.max(-1, Math.min(1, sum / Math.max(1, end - start)))
    out[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
  }
  return out
}

function emitChunk(input: Float32Array, sampleRate: number, onChunk: ChunkHandler) {
  let sum = 0
  for (const v of input) sum += v * v
  onChunk(downsampleToPcm16(input, sampleRate).buffer as ArrayBuffer, Math.sqrt(sum / input.length))
}

// 第一候補: 同一オリジンの AudioWorklet。オーディオ スレッドで受けるので、メインスレッドが止まっても音声が欠けない。
// blob: URL の Worklet は Code Apps の script-src でブロックされるため、public/ の静的ファイルを読み込む。
async function startWorkletPump(ctx: AudioContext, stream: MediaStream, onChunk: ChunkHandler, workletUrl: string): Promise<() => void> {
  await ctx.audioWorklet.addModule(new URL(workletUrl, document.baseURI).href)
  const source = ctx.createMediaStreamSource(stream)
  const node = new AudioWorkletNode(ctx, "pcm-capture", { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 })
  node.port.onmessage = (event: MessageEvent<Float32Array>) => emitChunk(event.data, ctx.sampleRate, onChunk)
  source.connect(node)
  // 出力は書かない（無音）。グラフから外れて処理が止まらないよう destination に接続しておく
  node.connect(ctx.destination)
  return () => {
    node.port.onmessage = null
    source.disconnect()
    node.disconnect()
  }
}

// 代替: ScriptProcessor。メインスレッドで動くため、メインスレッドが止まると音声が欠ける
function startScriptProcessorPump(ctx: AudioContext, stream: MediaStream, onChunk: ChunkHandler): () => void {
  const source = ctx.createMediaStreamSource(stream)
  const node = ctx.createScriptProcessor(4096, 1, 1)
  node.onaudioprocess = (event) => emitChunk(event.inputBuffer.getChannelData(0), ctx.sampleRate, onChunk)
  source.connect(node)
  // Chrome は destination に接続しないと onaudioprocess が発火しない（出力は無音のまま）
  node.connect(ctx.destination)
  return () => {
    node.onaudioprocess = null
    source.disconnect()
    node.disconnect()
  }
}

export async function startPcmPump(
  ctx: AudioContext,
  stream: MediaStream,
  onChunk: ChunkHandler,
  options: { preferred?: CaptureMode; workletUrl?: string } = {},
): Promise<{ stop: () => void; mode: CaptureMode; fallbackReason?: string }> {
  const preferred = options.preferred ?? "worklet"
  if (preferred === "worklet" && ctx.audioWorklet) {
    try {
      return { stop: await startWorkletPump(ctx, stream, onChunk, options.workletUrl ?? "pcm-capture-worklet.js"), mode: "worklet" }
    } catch (error) {
      return { stop: startScriptProcessorPump(ctx, stream, onChunk), mode: "scriptprocessor", fallbackReason: (error as Error).message }
    }
  }
  return { stop: startScriptProcessorPump(ctx, stream, onChunk), mode: "scriptprocessor" }
}

export function pickRecorderMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined
  return ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type))
}

// 録音の再生は data: URL にする（blob: は Code Apps の既定 CSP の media-src でブロックされる）
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}
