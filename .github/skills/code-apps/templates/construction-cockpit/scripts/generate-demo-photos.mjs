// 日報の「現場写真」用デモ画像（SVG）を生成する。
// 実写真の代わりに、工種ごとのシーン × 天候（晴れ・曇り・雨）を決定的に描画する。
// 出力先: src/assets/demo-photos/<scene>-<weather>.svg
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const outDir = path.join(root, "src", "assets", "demo-photos")
const W = 800
const H = 450

function prng(seedText) {
  let seed = 0
  for (const ch of seedText) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0
  return () => {
    seed = (seed + 0x6d2b79f5) >>> 0
    let t = seed
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const f = (n) => Math.round(n * 10) / 10

// ---------- 共通要素 ----------
function sky(weather, rand) {
  const stops = {
    sunny: ["#38bdf8", "#bae6fd", "#f0f9ff"],
    cloudy: ["#94a3b8", "#cbd5e1", "#e2e8f0"],
    rain: ["#475569", "#64748b", "#94a3b8"],
  }[weather]
  let out = `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${stops[0]}"/><stop offset="0.6" stop-color="${stops[1]}"/><stop offset="1" stop-color="${stops[2]}"/></linearGradient>
<linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.25"/></linearGradient>
<radialGradient id="vignette" cx="0.5" cy="0.5" r="0.75"><stop offset="0.6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.35"/></radialGradient>
<filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter></defs>
<rect width="${W}" height="${H}" fill="url(#sky)"/>`
  if (weather === "sunny") out += `<circle cx="${f(560 + rand() * 180)}" cy="${f(50 + rand() * 30)}" r="34" fill="#fef9c3" opacity="0.9"/><circle cx="0" cy="0" r="0"/>`
  const clouds = weather === "sunny" ? 3 : weather === "cloudy" ? 7 : 9
  const cloudColor = weather === "rain" ? "#64748b" : weather === "cloudy" ? "#f1f5f9" : "#ffffff"
  for (let i = 0; i < clouds; i += 1) {
    const x = rand() * W
    const y = 20 + rand() * 90
    const s = 0.7 + rand() * 1.2
    out += `<g opacity="${weather === "sunny" ? 0.85 : 0.95}" fill="${cloudColor}"><ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(60 * s)}" ry="${f(18 * s)}"/><ellipse cx="${f(x + 30 * s)}" cy="${f(y - 12 * s)}" rx="${f(36 * s)}" ry="${f(20 * s)}"/><ellipse cx="${f(x - 28 * s)}" cy="${f(y - 6 * s)}" rx="${f(30 * s)}" ry="${f(15 * s)}"/></g>`
  }
  return out
}

function hills(rand, horizon, color = "#64748b") {
  let d = `M0 ${horizon}`
  for (let x = 0; x <= W; x += 80) d += ` L${x} ${f(horizon - 30 - rand() * 60)}`
  d += ` L${W} ${horizon} Z`
  let d2 = `M0 ${horizon}`
  for (let x = 0; x <= W; x += 60) d2 += ` L${x} ${f(horizon - 10 - rand() * 35)}`
  d2 += ` L${W} ${horizon} Z`
  return `<path d="${d}" fill="${color}" opacity="0.45"/><path d="${d2}" fill="#4d7c0f" opacity="0.55"/>`
}

function ground(y, color, rand, texture = "#00000022") {
  let out = `<rect x="0" y="${y}" width="${W}" height="${H - y}" fill="${color}"/>`
  for (let i = 0; i < 40; i += 1) {
    const x = rand() * W
    const yy = y + rand() * (H - y)
    out += `<ellipse cx="${f(x)}" cy="${f(yy)}" rx="${f(4 + rand() * 18)}" ry="${f(1 + rand() * 3)}" fill="${texture}"/>`
  }
  return out
}

function treeLine(rand, y, count = 14) {
  let out = ""
  for (let i = 0; i < count; i += 1) {
    const x = rand() * W
    const s = 0.6 + rand() * 0.8
    out += `<g transform="translate(${f(x)} ${y}) scale(${f(s)})"><rect x="-3" y="-10" width="6" height="16" fill="#713f12"/><ellipse cx="0" cy="-22" rx="16" ry="20" fill="#3f6212"/><ellipse cx="6" cy="-30" rx="10" ry="12" fill="#4d7c0f"/></g>`
  }
  return out
}

function worker(x, y, s = 1, vest = "#f97316", helmet = "#fde047") {
  return `<g transform="translate(${f(x)} ${f(y)}) scale(${f(s)})"><rect x="-4" y="-18" width="3.5" height="18" fill="#1e3a8a"/><rect x="0.5" y="-18" width="3.5" height="18" fill="#1e3a8a"/><rect x="-6" y="-38" width="12" height="21" rx="3" fill="${vest}"/><rect x="-6" y="-31" width="12" height="2.5" fill="#e5e7eb"/><rect x="-9" y="-36" width="3" height="14" rx="1.5" fill="${vest}"/><rect x="6" y="-36" width="3" height="14" rx="1.5" fill="${vest}"/><circle cx="0" cy="-43" r="5" fill="#fcd9b6"/><path d="M-7 -44 A7 7 0 0 1 7 -44 Z" fill="${helmet}"/><rect x="-8" y="-45" width="16" height="2" fill="${helmet}"/></g>`
}

function workers(rand, count, y0, y1, x0 = 40, x1 = W - 40) {
  let out = ""
  const vests = ["#f97316", "#eab308", "#22c55e", "#f97316"]
  for (let i = 0; i < count; i += 1) {
    const y = y0 + rand() * (y1 - y0)
    out += worker(x0 + rand() * (x1 - x0), y, 0.8 + (y - y0) / (y1 - y0 + 1) * 0.6, vests[i % vests.length], i % 3 === 0 ? "#ffffff" : "#fde047")
  }
  return out
}

function cone(x, y, s = 1) {
  return `<g transform="translate(${f(x)} ${f(y)}) scale(${f(s)})"><path d="M-6 0 L-2 -20 L2 -20 L6 0 Z" fill="#f97316"/><rect x="-4" y="-12" width="8" height="3" fill="#ffffff"/><rect x="-9" y="-1" width="18" height="3" fill="#ea580c"/></g>`
}

function excavator(x, y, s = 1, flip = false, pose = 0) {
  const t = `translate(${f(x)} ${f(y)}) scale(${flip ? -s : s} ${s})`
  const armY = -58 - pose * 18
  return `<g transform="${t}"><rect x="-55" y="-18" width="110" height="18" rx="9" fill="#374151"/><g fill="#1f2937">${[-40, -20, 0, 20, 40].map((cx) => `<circle cx="${cx}" cy="-9" r="5"/>`).join("")}</g><rect x="-45" y="-48" width="85" height="30" rx="4" fill="#f59e0b"/><rect x="-50" y="-44" width="18" height="24" rx="3" fill="#d97706"/><rect x="5" y="-78" width="32" height="32" rx="3" fill="#f59e0b"/><rect x="10" y="-74" width="22" height="16" fill="#93c5fd" opacity="0.85"/><path d="M30 -50 L95 ${armY - 30} L105 ${armY - 22} L42 -40 Z" fill="#f59e0b"/><path d="M95 ${armY - 30} L140 ${armY + 35} L130 ${armY + 40} L90 ${armY - 20} Z" fill="#eab308"/><path d="M128 ${armY + 32} L156 ${armY + 40} L150 ${armY + 62} L126 ${armY + 52} Z" fill="#4b5563"/><rect x="-45" y="-48" width="85" height="30" fill="url(#shade)"/></g>`
}

function dumpTruck(x, y, s = 1, flip = false, load = "#92400e") {
  return `<g transform="translate(${f(x)} ${f(y)}) scale(${flip ? -s : s} ${s})"><rect x="-70" y="-50" width="95" height="36" rx="3" fill="#e5e7eb"/><path d="M-70 -50 L25 -50 L25 -58 Q-20 -72 -66 -58 Z" fill="${load}"/><rect x="28" y="-56" width="40" height="42" rx="5" fill="#2563eb"/><rect x="40" y="-52" width="24" height="16" fill="#bfdbfe"/><rect x="-74" y="-16" width="146" height="6" fill="#111827"/>${[-52, -26, 50].map((cx) => `<circle cx="${cx}" cy="-6" r="11" fill="#111827"/><circle cx="${cx}" cy="-6" r="4" fill="#9ca3af"/>`).join("")}</g>`
}

function bulldozer(x, y, s = 1, flip = false) {
  return `<g transform="translate(${f(x)} ${f(y)}) scale(${flip ? -s : s} ${s})"><rect x="-50" y="-18" width="100" height="18" rx="9" fill="#374151"/><rect x="-40" y="-46" width="70" height="28" rx="3" fill="#facc15"/><rect x="-28" y="-74" width="34" height="28" rx="3" fill="#facc15"/><rect x="-23" y="-70" width="24" height="15" fill="#93c5fd"/><path d="M50 -50 L66 -50 L70 0 L52 0 Z" fill="#6b7280"/><rect x="30" y="-34" width="22" height="6" fill="#4b5563"/></g>`
}

function roller(x, y, s = 1) {
  return `<g transform="translate(${f(x)} ${f(y)}) scale(${s})"><circle cx="-38" cy="-22" r="22" fill="#9ca3af"/><circle cx="38" cy="-22" r="22" fill="#9ca3af"/><rect x="-40" y="-52" width="80" height="22" rx="4" fill="#facc15"/><rect x="-14" y="-82" width="30" height="30" fill="none" stroke="#1f2937" stroke-width="4"/><rect x="-14" y="-86" width="34" height="5" fill="#1f2937"/></g>`
}

function crane(x, y, s = 1, angle = -55, hook = 120, load = "") {
  const rad = (angle * Math.PI) / 180
  const len = 320
  const tipX = Math.cos(rad) * len
  const tipY = Math.sin(rad) * len - 70
  let lattice = ""
  for (let i = 1; i < 12; i += 1) {
    const px = (tipX * i) / 12
    const py = -70 + ((tipY + 70) * i) / 12
    lattice += `<line x1="${f(px - 4)}" y1="${f(py + 6)}" x2="${f(px + 8)}" y2="${f(py - 4)}" stroke="#b91c1c" stroke-width="1.5"/>`
  }
  return `<g transform="translate(${f(x)} ${f(y)}) scale(${s})"><rect x="-70" y="-28" width="140" height="22" rx="4" fill="#dc2626"/>${[-50, -20, 20, 50].map((cx) => `<circle cx="${cx}" cy="-6" r="10" fill="#111827"/>`).join("")}<rect x="-40" y="-70" width="70" height="42" rx="4" fill="#ef4444"/><rect x="10" y="-64" width="18" height="18" fill="#bfdbfe"/><line x1="0" y1="-70" x2="${f(tipX)}" y2="${f(tipY)}" stroke="#dc2626" stroke-width="9"/>${lattice}<line x1="${f(tipX)}" y1="${f(tipY)}" x2="${f(tipX)}" y2="${f(tipY + hook)}" stroke="#111827" stroke-width="1.5"/><path d="M${f(tipX - 4)} ${f(tipY + hook)} l8 0 l-2 8 l-4 0 Z" fill="#facc15"/>${load ? `<g transform="translate(${f(tipX)} ${f(tipY + hook + 8)})">${load}</g>` : ""}<rect x="-90" y="-10" width="16" height="10" fill="#6b7280"/><rect x="74" y="-10" width="16" height="10" fill="#6b7280"/></g>`
}

function fence(y, rand, color = "#f8fafc", accent = "#1d4ed8") {
  let out = ""
  for (let x = -20; x < W; x += 58) {
    out += `<rect x="${x}" y="${y - 70}" width="56" height="70" fill="${color}" stroke="#cbd5e1"/><rect x="${x}" y="${y - 18}" width="56" height="8" fill="${accent}"/>`
  }
  return out + `<rect x="0" y="${y - 72}" width="${W}" height="3" fill="#94a3b8"/>` + (rand() > 2 ? "" : "")
}

function weatherOverlay(weather, rand) {
  let out = ""
  if (weather === "cloudy") out += `<rect width="${W}" height="${H}" fill="#475569" opacity="0.12"/>`
  if (weather === "rain") {
    out += `<rect width="${W}" height="${H}" fill="#1e293b" opacity="0.22"/><g stroke="#e2e8f0" stroke-width="1.2" opacity="0.55">`
    for (let i = 0; i < 260; i += 1) {
      const x = rand() * (W + 120) - 60
      const y = rand() * H
      out += `<line x1="${f(x)}" y1="${f(y)}" x2="${f(x - 7)}" y2="${f(y + 20)}"/>`
    }
    out += `</g>`
    for (let i = 0; i < 8; i += 1) out += `<ellipse cx="${f(rand() * W)}" cy="${f(380 + rand() * 60)}" rx="${f(30 + rand() * 50)}" ry="${f(3 + rand() * 4)}" fill="#cbd5e1" opacity="0.35"/>`
  }
  return out + `<rect width="${W}" height="${H}" filter="url(#grain)" opacity="0.07"/><rect width="${W}" height="${H}" fill="url(#vignette)"/>`
}

// ---------- シーン ----------
const scenes = {
  "site-prep": (r) => hills(r, 250) + treeLine(r, 250) + ground(250, "#a16207", r) +
    `<rect x="470" y="190" width="150" height="60" fill="#e2e8f0" stroke="#94a3b8"/><rect x="480" y="200" width="30" height="20" fill="#93c5fd"/><rect x="520" y="200" width="30" height="20" fill="#93c5fd"/><rect x="470" y="186" width="150" height="6" fill="#1d4ed8"/>` +
    Array.from({ length: 9 }, () => `<ellipse cx="${f(r() * W)}" cy="${f(300 + r() * 120)}" rx="12" ry="5" fill="#713f12"/>`).join("") +
    `<rect x="0" y="330" width="${W}" height="40" fill="#57534e"/>${Array.from({ length: 10 }, (_, i) => `<rect x="${i * 82}" y="333" width="78" height="34" fill="#44403c" stroke="#292524"/>`).join("")}` +
    excavator(250, 320, 0.9, false, 0.5) + cone(120, 400) + cone(170, 405) + cone(640, 400) + workers(r, 4, 360, 430),
  pile: (r) => hills(r, 260) + ground(260, "#78716c", r) +
    `<rect x="0" y="300" width="${W}" height="30" fill="#57534e"/>` +
    `<g transform="translate(330 330)"><rect x="-60" y="-24" width="120" height="24" rx="6" fill="#374151"/><rect x="-46" y="-60" width="92" height="36" fill="#0f766e"/><rect x="-10" y="-300" width="20" height="250" fill="#334155"/><rect x="-6" y="-300" width="12" height="250" fill="#64748b"/><rect x="18" y="-270" width="18" height="210" fill="#9ca3af"/><rect x="18" y="-270" width="18" height="12" fill="#f59e0b"/><line x1="0" y1="-300" x2="-90" y2="-60" stroke="#334155" stroke-width="6"/></g>` +
    Array.from({ length: 6 }, (_, i) => `<g transform="translate(${470 + i * 45} 380)"><ellipse cx="0" cy="0" rx="14" ry="5" fill="#475569"/><rect x="-14" y="-24" width="28" height="24" fill="#6b7280"/><ellipse cx="0" cy="-24" rx="14" ry="5" fill="#9ca3af"/></g>`).join("") +
    `<g>${Array.from({ length: 5 }, (_, i) => `<rect x="60" y="${360 + i * 9}" width="200" height="8" rx="4" fill="#94a3b8" stroke="#64748b"/>`).join("")}</g>` + workers(r, 5, 360, 435),
  rebar: (r) => hills(r, 220) + ground(220, "#a8a29e", r) +
    `<path d="M60 430 L180 250 L640 250 L760 430 Z" fill="#cbd5e1"/>` +
    `<g stroke="#b45309" stroke-width="3">${Array.from({ length: 22 }, (_, i) => `<line x1="${f(70 + i * 31)}" y1="428" x2="${f(185 + i * 21)}" y2="252"/>`).join("")}${Array.from({ length: 12 }, (_, i) => { const y = 252 + i * 16; const k = (y - 250) / 180; return `<line x1="${f(180 - 120 * k)}" y1="${y}" x2="${f(640 + 120 * k)}" y2="${y}"/>` }).join("")}</g>` +
    `<path d="M60 430 L180 250 L180 220 L60 400 Z" fill="#d6a75c"/><path d="M640 250 L760 430 L760 400 L640 220 Z" fill="#c08a3e"/>` +
    crane(700, 220, 0.55, -120, 70, `<g stroke="#b45309" stroke-width="3">${[0, 6, 12, 18].map((o) => `<line x1="-40" y1="${o}" x2="40" y2="${o}"/>`).join("")}</g>`) + workers(r, 6, 300, 420, 180, 620),
  pier: (r) => hills(r, 240) + ground(240, "#a8a29e", r) +
    `<rect x="0" y="330" width="${W}" height="${H - 330}" fill="#0e7490" opacity="0.65"/>` +
    `<g><rect x="300" y="90" width="110" height="250" fill="#d4d4d8"/><rect x="300" y="90" width="110" height="250" fill="url(#shade)"/><rect x="250" y="70" width="210" height="34" fill="#e4e4e7"/><rect x="270" y="330" width="170" height="30" fill="#a1a1aa"/></g>` +
    `<g stroke="#64748b" stroke-width="3" fill="none">${Array.from({ length: 9 }, (_, i) => `<line x1="285" y1="${100 + i * 28}" x2="425" y2="${100 + i * 28}"/>`).join("")}<line x1="285" y1="100" x2="285" y2="340"/><line x1="425" y1="100" x2="425" y2="340"/></g>` +
    crane(600, 330, 0.7, -110, 90) + `<rect x="0" y="320" width="230" height="16" fill="#57534e"/>` + workers(r, 4, 300, 330, 40, 220),
  concrete: (r) => hills(r, 230) + ground(230, "#a8a29e", r) +
    `<path d="M100 420 L200 280 L620 280 L720 420 Z" fill="#9ca3af"/><path d="M100 420 L200 280 L380 280 L320 420 Z" fill="#6b7280"/>` +
    `<path d="M100 420 L200 280 L200 255 L100 395 Z" fill="#d6a75c"/>` +
    `<g transform="translate(640 300)"><rect x="-80" y="-40" width="140" height="40" rx="4" fill="#f8fafc"/><rect x="40" y="-50" width="50" height="50" rx="4" fill="#0284c7"/>${[-55, -20, 60].map((cx) => `<circle cx="${cx}" cy="0" r="12" fill="#111827"/>`).join("")}<path d="M-20 -40 L-140 -170 L-300 -120" stroke="#f97316" stroke-width="10" fill="none" stroke-linejoin="round"/><line x1="-300" y1="-120" x2="-300" y2="-40" stroke="#111827" stroke-width="6"/></g>` +
    dumpTruck(150, 260, 0.6, false, "#9ca3af") + workers(r, 6, 320, 410, 200, 560),
  excavation: (r) => hills(r, 220) + treeLine(r, 220, 10) + ground(220, "#b45309", r, "#78350f33") +
    `<path d="M120 440 L240 300 L560 300 L700 440 Z" fill="#92400e"/><path d="M240 300 L560 300 L520 340 L280 340 Z" fill="#78350f"/>` +
    excavator(470, 320, 1.0, true, 0.9) + dumpTruck(250, 300, 0.85) + cone(90, 420) + cone(730, 425) + workers(r, 2, 380, 430, 40, 160),
  embankment: (r) => hills(r, 230) + ground(230, "#a16207", r) +
    Array.from({ length: 4 }, (_, i) => `<path d="M0 ${300 + i * 30} L${W} ${290 + i * 30} L${W} ${320 + i * 30} L0 ${330 + i * 30} Z" fill="${["#ca8a04", "#a16207", "#b45309", "#92400e"][i]}"/>`).join("") +
    bulldozer(260, 330, 1.0) + roller(560, 360, 0.9) + `<g stroke="#f8fafc" stroke-width="2">${[120, 380, 680].map((x) => `<line x1="${x}" y1="300" x2="${x}" y2="250"/><rect x="${x - 2}" y="245" width="14" height="8" fill="#ef4444"/>`).join("")}</g>` + workers(r, 3, 380, 430),
  retaining: (r) => hills(r, 220) + ground(220, "#a16207", r) +
    Array.from({ length: 7 }, (_, i) => `<g transform="translate(${60 + i * 95} 300)"><rect x="0" y="0" width="90" height="110" fill="#d4d4d8" stroke="#a1a1aa"/><rect x="0" y="100" width="130" height="18" fill="#a1a1aa"/></g>`).join("") +
    `<rect x="0" y="410" width="${W}" height="${H - 410}" fill="#78716c"/>` +
    crane(680, 300, 0.6, -125, 60, `<rect x="-45" y="0" width="90" height="70" fill="#e4e4e7" stroke="#a1a1aa"/>`) + workers(r, 4, 420, 445),
  drainage: (r) => hills(r, 230) + ground(230, "#a8a29e", r) +
    `<path d="M0 360 L${W} 300 L${W} 340 L0 410 Z" fill="#57534e"/>` +
    Array.from({ length: 9 }, (_, i) => { const x = i * 95; const y = 360 - i * 7; return `<g transform="translate(${x} ${y})"><rect x="0" y="-8" width="90" height="34" fill="#e4e4e7" stroke="#a1a1aa"/><rect x="10" y="-4" width="70" height="20" fill="#52525b"/></g>` }).join("") +
    `<g transform="translate(540 270)"><rect x="0" y="0" width="60" height="60" fill="#d4d4d8" stroke="#a1a1aa"/><rect x="12" y="8" width="36" height="12" fill="#52525b"/></g>` +
    excavator(220, 300, 0.75, false, 0.3) + workers(r, 4, 380, 440),
  slope: (r) => `<path d="M0 450 L0 140 L${W} 380 L${W} 450 Z" fill="#a16207"/>` +
    `<g stroke="#e4e4e7" stroke-width="7">${Array.from({ length: 7 }, (_, i) => `<line x1="${i * 120}" y1="${f(140 + i * 34)}" x2="${i * 120}" y2="450"/>`).join("")}${Array.from({ length: 5 }, (_, i) => `<line x1="0" y1="${200 + i * 50}" x2="${W}" y2="${f(420 + i * 8)}"/>`).join("")}</g>` +
    `<path d="M0 450 L0 300 L420 380 L420 450 Z" fill="#65a30d" opacity="0.75"/>` +
    `<line x1="40" y1="120" x2="760" y2="350" stroke="#111827" stroke-width="2"/>` + workers(r, 4, 300, 420, 300, 700),
  "tunnel-face": (r) => `<rect width="${W}" height="${H}" fill="#1c1917"/>` +
    `<path d="M80 450 L80 200 Q400 -40 720 200 L720 450 Z" fill="#44403c"/><path d="M180 450 L180 240 Q400 60 620 240 L620 450 Z" fill="#57534e"/>` +
    `<g stroke="#a8a29e" stroke-width="7" fill="none">${[0, 1, 2].map((i) => `<path d="M${120 + i * 40} 450 L${120 + i * 40} ${215 + i * 10} Q400 ${10 + i * 35} ${680 - i * 40} ${215 + i * 10} L${680 - i * 40} 450"/>`).join("")}</g>` +
    `<path d="M260 450 L260 270 Q400 150 540 270 L540 450 Z" fill="#78716c"/>` +
    Array.from({ length: 14 }, () => `<circle cx="${f(300 + r() * 200)}" cy="${f(240 + r() * 160)}" r="3" fill="#292524"/>`).join("") +
    `<g transform="translate(400 450)"><rect x="-120" y="-60" width="240" height="40" fill="#facc15"/><rect x="-60" y="-120" width="120" height="60" fill="#eab308"/><line x1="-40" y1="-120" x2="-90" y2="-210" stroke="#a16207" stroke-width="8"/><line x1="40" y1="-120" x2="90" y2="-210" stroke="#a16207" stroke-width="8"/></g>` +
    `<circle cx="200" cy="120" r="6" fill="#fef08a"/><circle cx="600" cy="120" r="6" fill="#fef08a"/>` + workers(r, 3, 400, 440, 150, 650),
  "tunnel-lining": (r) => `<rect width="${W}" height="${H}" fill="#292524"/>` +
    Array.from({ length: 7 }, (_, i) => { const k = 1 - i * 0.13; const cx = 400; const w = 360 * k; const top = 40 + i * 32; return `<path d="M${f(cx - w)} 450 L${f(cx - w)} ${f(top + 140 * k)} Q${cx} ${f(top - 40 * k)} ${f(cx + w)} ${f(top + 140 * k)} L${f(cx + w)} 450" fill="none" stroke="${i % 2 ? "#a8a29e" : "#d6d3d1"}" stroke-width="${f(26 * k)}"/>` }).join("") +
    `<path d="M300 450 L380 300 L420 300 L500 450 Z" fill="#1c1917"/>` +
    Array.from({ length: 6 }, (_, i) => `<circle cx="${f(130 + i * 50)}" cy="${f(150 + i * 22)}" r="${f(6 - i * 0.7)}" fill="#fef08a"/><circle cx="${f(670 - i * 50)}" cy="${f(150 + i * 22)}" r="${f(6 - i * 0.7)}" fill="#fef08a"/>`).join("") +
    `<g transform="translate(400 330)"><rect x="-190" y="-150" width="380" height="20" fill="#1d4ed8"/><rect x="-190" y="-130" width="20" height="200" fill="#1e40af"/><rect x="170" y="-130" width="20" height="200" fill="#1e40af"/></g>` + workers(r, 3, 400, 440, 200, 600),
  "steel-frame": (r) => hills(r, 300, "#94a3b8") + ground(300, "#a8a29e", r) +
    `<g fill="#475569">${Array.from({ length: 6 }, (_, i) => `<rect x="${170 + i * 85}" y="80" width="10" height="230"/>`).join("")}${Array.from({ length: 5 }, (_, i) => `<rect x="165" y="${80 + i * 55}" width="440" height="8"/>`).join("")}</g>` +
    `<g stroke="#64748b" stroke-width="3">${Array.from({ length: 5 }, (_, i) => `<line x1="${175 + i * 85}" y1="300" x2="${260 + i * 85}" y2="245"/>`).join("")}</g>` +
    `<g fill="#cbd5e1" opacity="0.8">${[0, 1, 2].map((i) => `<rect x="170" y="${248 - i * 55}" width="440" height="6"/>`).join("")}</g>` +
    `<g transform="translate(700 320)"><rect x="-8" y="-300" width="16" height="300" fill="#facc15"/><rect x="-260" y="-310" width="320" height="12" fill="#facc15"/><line x1="-200" y1="-298" x2="-200" y2="-180" stroke="#111827" stroke-width="2"/><rect x="-250" y="-180" width="100" height="10" fill="#475569"/></g>` + workers(r, 4, 330, 430),
  scaffold: (r) => ground(320, "#a8a29e", r) +
    `<rect x="160" y="40" width="480" height="300" fill="#e7e5e4"/>` +
    `<g stroke="#64748b" stroke-width="3">${Array.from({ length: 9 }, (_, i) => `<line x1="${150 + i * 62}" y1="30" x2="${150 + i * 62}" y2="340"/>`).join("")}${Array.from({ length: 7 }, (_, i) => `<line x1="140" y1="${50 + i * 46}" x2="660" y2="${50 + i * 46}"/>`).join("")}</g>` +
    `<rect x="140" y="30" width="270" height="310" fill="#16a34a" opacity="0.35"/>` +
    `<g fill="#f59e0b">${Array.from({ length: 7 }, (_, i) => `<rect x="140" y="${46 + i * 46}" width="520" height="5"/>`).join("")}</g>` +
    workers(r, 2, 120, 200, 450, 620) + workers(r, 4, 360, 430),
  facade: (r) => ground(360, "#a8a29e", r) +
    `<rect x="180" y="20" width="440" height="340" fill="#cbd5e1"/>` +
    `<g>${Array.from({ length: 6 }, (_, row) => Array.from({ length: 7 }, (_, col) => { const done = row > 1 || col < 4; return `<rect x="${190 + col * 61}" y="${30 + row * 54}" width="56" height="48" fill="${done ? "#7dd3fc" : "#475569"}" opacity="${done ? 0.85 : 0.6}"/>` }).join("")).join("")}</g>` +
    `<g stroke="#334155" stroke-width="3">${Array.from({ length: 8 }, (_, i) => `<line x1="${187 + i * 61}" y1="20" x2="${187 + i * 61}" y2="360"/>`).join("")}</g>` +
    `<g transform="translate(560 360)"><rect x="-30" y="-20" width="60" height="20" fill="#f97316"/><rect x="-6" y="-200" width="12" height="180" fill="#f97316"/><rect x="-40" y="-212" width="70" height="16" fill="#facc15"/></g>` +
    worker(560, 155, 1.0) + workers(r, 3, 380, 440),
  interior: (r) => `<rect width="${W}" height="${H}" fill="#e7e5e4"/>` +
    `<path d="M0 0 L${W} 0 L560 140 L240 140 Z" fill="#a8a29e"/><path d="M0 450 L240 300 L560 300 L${W} 450 Z" fill="#78716c"/><path d="M0 0 L240 140 L240 300 L0 450 Z" fill="#d6d3d1"/><path d="M${W} 0 L560 140 L560 300 L${W} 450 Z" fill="#cbd5e1"/>` +
    `<g stroke="#94a3b8" stroke-width="3">${Array.from({ length: 8 }, (_, i) => `<line x1="${f(20 + i * 28)}" y1="${f(12 + i * 17)}" x2="${f(20 + i * 28)}" y2="${f(438 - i * 18)}"/>`).join("")}</g>` +
    `<rect x="240" y="140" width="320" height="160" fill="#f5f5f4"/>` +
    `<path d="M120 60 L680 60 L640 90 L160 90 Z" fill="#cbd5e1" stroke="#94a3b8"/><rect x="300" y="100" width="200" height="14" fill="#e2e8f0" stroke="#94a3b8"/>` +
    `<g transform="translate(470 420)"><rect x="-30" y="-10" width="60" height="10" fill="#f59e0b"/><rect x="-26" y="-60" width="52" height="8" fill="#f59e0b"/><line x1="-26" y1="-52" x2="-30" y2="-10" stroke="#f59e0b" stroke-width="4"/><line x1="26" y1="-52" x2="30" y2="-10" stroke="#f59e0b" stroke-width="4"/></g>` +
    worker(470, 360, 1.3) + worker(300, 420, 1.4, "#22c55e"),
  paving: (r) => hills(r, 230) + treeLine(r, 232, 12) + ground(232, "#a3a3a3", r) +
    `<path d="M300 232 L500 232 L${W} 450 L0 450 Z" fill="#525252"/><path d="M300 232 L420 232 L520 450 L0 450 Z" fill="#171717"/>` +
    `<g transform="translate(330 360)"><rect x="-150" y="-30" width="240" height="30" fill="#111827"/><rect x="-120" y="-80" width="160" height="50" fill="#facc15"/><rect x="-40" y="-118" width="70" height="38" fill="#eab308"/><rect x="-160" y="-12" width="260" height="12" fill="#374151"/></g>` +
    roller(620, 400, 0.9) + `<g fill="#f5f5f4" opacity="0.5">${Array.from({ length: 6 }, (_, i) => `<ellipse cx="${f(230 + i * 22)}" cy="${f(270 - i * 12)}" rx="${f(18 + i * 6)}" ry="${f(8 + i * 3)}"/>`).join("")}</g>` + workers(r, 4, 380, 440, 60, 260),
  "road-base": (r) => hills(r, 230) + ground(230, "#a8a29e", r) +
    `<path d="M320 232 L480 232 L${W} 450 L0 450 Z" fill="#a8a29e"/>` +
    Array.from({ length: 160 }, () => { const y = 240 + r() * 205; const half = 80 + (y - 232) * 1.75; const x = 400 + (r() * 2 - 1) * half; return `<circle cx="${f(x)}" cy="${f(y)}" r="${f(1 + r() * 2.5)}" fill="${r() > 0.5 ? "#78716c" : "#d6d3d1"}"/>` }).join("") +
    bulldozer(470, 330, 0.85, true) + dumpTruck(230, 300, 0.7, false, "#a8a29e") + cone(80, 420) + cone(720, 420) + workers(r, 3, 380, 440),
  revetment: (r) => hills(r, 200) + treeLine(r, 200, 10) +
    `<path d="M0 200 L${W} 200 L${W} 260 L0 300 Z" fill="#65a30d"/>` +
    `<path d="M0 300 L${W} 260 L${W} 340 L0 420 Z" fill="#a1a1aa"/>` +
    `<g stroke="#71717a" stroke-width="2">${Array.from({ length: 16 }, (_, i) => `<line x1="${i * 52}" y1="${f(300 - i * 2.6)}" x2="${i * 52}" y2="${f(420 - i * 5)}"/>`).join("")}${[0, 1, 2].map((i) => `<line x1="0" y1="${330 + i * 30}" x2="${W}" y2="${f(285 + i * 20)}"/>`).join("")}</g>` +
    `<path d="M0 420 L${W} 340 L${W} 450 L0 450 Z" fill="#0e7490" opacity="0.8"/>` +
    `<g fill="#bae6fd" opacity="0.5">${Array.from({ length: 10 }, () => `<rect x="${f(r() * W)}" y="${f(400 + r() * 40)}" width="${f(20 + r() * 40)}" height="2"/>`).join("")}</g>` +
    excavator(600, 260, 0.75, true, 0.6) + workers(r, 3, 250, 280, 100, 450),
  precast: (r) => hills(r, 220) + ground(220, "#a16207", r) +
    `<path d="M0 340 L${W} 280 L${W} 330 L0 400 Z" fill="#78350f"/>` +
    Array.from({ length: 8 }, (_, i) => { const x = i * 100; const y = 340 - i * 7.5; return `<g transform="translate(${x} ${y})"><path d="M0 -20 L0 30 L96 30 L96 -20 L84 -20 L84 18 L12 18 L12 -20 Z" fill="#e4e4e7" stroke="#a1a1aa"/></g>` }).join("") +
    crane(560, 250, 0.6, -130, 40, `<path d="M-48 0 L-48 40 L48 40 L48 0 L38 0 L38 30 L-38 30 L-38 0 Z" fill="#e4e4e7" stroke="#a1a1aa"/>`) + workers(r, 4, 380, 440),
  "road-marking": (r) => hills(r, 220) + treeLine(r, 222, 12) + ground(222, "#a3a3a3", r) +
    `<path d="M330 222 L470 222 L${W} 450 L0 450 Z" fill="#262626"/>` +
    Array.from({ length: 6 }, (_, i) => { const t = i / 6; const y1 = 230 + t * 220; const y2 = y1 + 18 + t * 18; return `<path d="M${f(398 - t * 6)} ${f(y1)} L${f(402 + t * 6)} ${f(y1)} L${f(404 + t * 10)} ${f(y2)} L${f(396 - t * 10)} ${f(y2)} Z" fill="#fafafa"/>` }).join("") +
    `<path d="M335 222 L338 222 L${f(40)} 450 L${f(20)} 450 Z" fill="#fafafa"/><path d="M462 222 L465 222 L${f(780)} 450 L${f(760)} 450 Z" fill="#fafafa"/>` +
    Array.from({ length: 6 }, (_, i) => cone(560 + i * 30, 300 + i * 26, 0.8 + i * 0.1)).join("") +
    `<g transform="translate(150 380)"><rect x="-70" y="-60" width="140" height="44" rx="4" fill="#f8fafc"/><rect x="-70" y="-60" width="140" height="10" fill="#f97316"/><circle cx="-40" cy="-12" r="12" fill="#111827"/><circle cx="40" cy="-12" r="12" fill="#111827"/></g>` + workers(r, 3, 380, 440, 220, 520),
}

fs.mkdirSync(outDir, { recursive: true })
let count = 0
for (const [scene, draw] of Object.entries(scenes)) {
  for (const weather of ["sunny", "cloudy", "rain"]) {
    const rand = prng(`${scene}-${weather}`)
    const body = sky(weather, rand) + draw(rand) + weatherOverlay(weather, rand)
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice">${body}</svg>\n`
    fs.writeFileSync(path.join(outDir, `${scene}-${weather}.svg`), svg)
    count += 1
  }
}
console.log(`generated ${count} demo photos in ${path.relative(root, outDir)}`)
