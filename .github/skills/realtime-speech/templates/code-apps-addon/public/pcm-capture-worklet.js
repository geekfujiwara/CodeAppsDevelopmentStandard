// マイク音声をオーディオ スレッドで受け取り、約 43 ms（2048 フレーム）ごとにメインスレッドへ送る。
// 同一オリジンの静的ファイルとして配信するため、Code Apps の既定 CSP（script-src 'self'）で読み込める。
// メインスレッドが一時的に止まっても、port のメッセージはキューに残るので音声は欠けない。
class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super()
    this.buffer = new Float32Array(2048)
    this.length = 0
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0]
    if (!channel) return true
    let offset = 0
    while (offset < channel.length) {
      const count = Math.min(channel.length - offset, this.buffer.length - this.length)
      this.buffer.set(channel.subarray(offset, offset + count), this.length)
      this.length += count
      offset += count
      if (this.length === this.buffer.length) {
        this.port.postMessage(this.buffer, [this.buffer.buffer])
        this.buffer = new Float32Array(2048)
        this.length = 0
      }
    }
    return true
  }
}

registerProcessor("pcm-capture", PcmCapture)
