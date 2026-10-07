export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function signedPct(ratio: number): string {
  const v = round1((ratio - 1) * 100);
  return `${v >= 0 ? '+' : ''}${v}%`;
}
