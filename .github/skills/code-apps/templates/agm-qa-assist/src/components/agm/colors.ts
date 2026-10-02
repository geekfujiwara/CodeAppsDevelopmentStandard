export const Q_COLORS = ["var(--agm-q1)", "var(--agm-q2)", "var(--agm-q3)", "var(--agm-q4)", "var(--agm-q5)", "var(--agm-q6)"]

export const qColor = (index: number) => Q_COLORS[index % Q_COLORS.length]

/** 識別色を薄く敷く背景（color-mix は Chromium / Edge で使える） */
export const qTint = (index: number, percent = 22) => `color-mix(in srgb, ${qColor(index)} ${percent}%, transparent)`
