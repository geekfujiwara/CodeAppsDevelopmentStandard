/** 16 kHz / 16 bit / mono の PCM を、発言ごとに切り出して WAV にするためのバッファ */
export class PcmSegmenter {
  private chunks: { start: number; data: Int16Array }[] = []
  /** 次に切り出す区間の先頭（ストリーム先頭からのサンプル位置） */
  private cut = 0
  private total = 0
  readonly sampleRate: number

  constructor(sampleRate = 16000) {
    this.sampleRate = sampleRate
  }

  append(buffer: ArrayBuffer) {
    const data = new Int16Array(buffer.slice(0))
    this.chunks.push({ start: this.total, data })
    this.total += data.length
  }

  get bufferedSeconds() {
    return (this.total - this.cut) / this.sampleRate
  }

  /** 前回の切り出し位置から untilMs（省略時は末尾）までを WAV で返し、その分のメモリを解放する */
  take(untilMs?: number): { blob: Blob; durationSec: number } | null {
    const until = Math.min(this.total, untilMs === undefined ? this.total : Math.max(this.cut, Math.round((untilMs / 1000) * this.sampleRate)))
    const length = until - this.cut
    if (length <= 0) return null
    const out = new Int16Array(length)
    for (const { start, data } of this.chunks) {
      const from = Math.max(start, this.cut)
      const to = Math.min(start + data.length, until)
      if (to > from) out.set(data.subarray(from - start, to - start), from - this.cut)
    }
    this.cut = until
    this.chunks = this.chunks.filter(({ start, data }) => start + data.length > until)
    return { blob: encodeWav(out, this.sampleRate), durationSec: length / this.sampleRate }
  }

  /**
   * fromMs〜toMs を WAV で返す（切り出し位置は動かさない）。発言の区切りで既に解放した区間は返せないため null。
   * 確定文ごとに別のモデル（MAI-Transcribe など）で認識し直すときに使う。
   */
  slice(fromMs: number, toMs: number): Blob | null {
    const from = Math.max(0, Math.round((fromMs / 1000) * this.sampleRate))
    const to = Math.min(this.total, Math.round((toMs / 1000) * this.sampleRate))
    if (to <= from || from < this.cut) return null
    const out = new Int16Array(to - from)
    for (const { start, data } of this.chunks) {
      const a = Math.max(start, from)
      const b = Math.min(start + data.length, to)
      if (b > a) out.set(data.subarray(a - start, b - start), a - from)
    }
    return encodeWav(out, this.sampleRate)
  }

  reset() {
    this.chunks = []
    this.cut = 0
    this.total = 0
  }
}

export function encodeWav(samples: Int16Array, sampleRate: number): Blob {
  const header = new ArrayBuffer(44)
  const v = new DataView(header)
  const write = (offset: number, text: string) => [...text].forEach((c, i) => v.setUint8(offset + i, c.charCodeAt(0)))
  write(0, "RIFF")
  v.setUint32(4, 36 + samples.byteLength, true)
  write(8, "WAVE")
  write(12, "fmt ")
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 1, true)
  v.setUint32(24, sampleRate, true)
  v.setUint32(28, sampleRate * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  write(36, "data")
  v.setUint32(40, samples.byteLength, true)
  return new Blob([header, samples.buffer as ArrayBuffer], { type: "audio/wav" })
}
