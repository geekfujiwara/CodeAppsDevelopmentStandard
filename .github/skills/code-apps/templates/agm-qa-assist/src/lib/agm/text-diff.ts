// 2 つの文字起こしの食い違いを見るための純粋関数（画面の比較と単体テストで使う）

const norm = (s: string) => s.normalize("NFKC").replace(/[\s、。，．・「」『』（）()？！?!,.:：;；"'“”‘’…ー－-]/g, "")

/** 文字の違い（編集距離 / 長い方の文字数）。2 つの文字起こしの食い違いを 0〜1 で見る */
export function charDiffRate(a: string, b: string): number {
  const x = [...norm(a)]
  const y = [...norm(b)]
  if (!x.length && !y.length) return 0
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j)
  for (let i = 1; i <= x.length; i++) {
    const cur = [i]
    for (let j = 1; j <= y.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1))
    prev = cur
  }
  return prev[y.length] / Math.max(x.length, y.length)
}

/** 2 つの文の違う箇所に印を付ける（共通の最長部分列で揃える）。表示用 */
export function diffSegments(a: string, b: string): { a: { text: string; same: boolean }[]; b: { text: string; same: boolean }[] } {
  const x = [...a]
  const y = [...b]
  const dp = Array.from({ length: x.length + 1 }, () => new Array<number>(y.length + 1).fill(0))
  for (let i = x.length - 1; i >= 0; i--) for (let j = y.length - 1; j >= 0; j--) dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const sa: { text: string; same: boolean }[] = []
  const sb: { text: string; same: boolean }[] = []
  const push = (arr: { text: string; same: boolean }[], ch: string, same: boolean) => {
    const last = arr[arr.length - 1]
    if (last && last.same === same) last.text += ch
    else arr.push({ text: ch, same })
  }
  let i = 0
  let j = 0
  while (i < x.length && j < y.length) {
    if (x[i] === y[j]) {
      push(sa, x[i++], true)
      push(sb, y[j++], true)
    } else if (dp[i + 1][j] >= dp[i][j + 1]) push(sa, x[i++], false)
    else push(sb, y[j++], false)
  }
  while (i < x.length) push(sa, x[i++], false)
  while (j < y.length) push(sb, y[j++], false)
  return { a: sa, b: sb }
}
