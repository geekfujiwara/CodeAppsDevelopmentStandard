import assert from "node:assert/strict"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, copyFileSync, rmSync } from "node:fs"
import { resolve, join } from "node:path"
import { PDFDocument } from "pdf-lib"

/** 主要サイトのローカル取り込み→案件作成と、3D視点→販売用PDFの実ダウンロードをDEMOで確認する。 */
export default async function ({ evaluate, send, sleep }) {
  const wait = async expression => {
    for (let i = 0; i < 400; i++) {
      if (await evaluate(`Boolean(${expression})`)) return
      await sleep(300)
    }
    throw new Error(`画面待機の時限: ${expression}\n${await evaluate("document.body.innerText.slice(-700)")}`)
  }
  await wait("document.body.innerText.includes('DEMO（ブラウザ保存）')")
  await evaluate("localStorage.setItem('perse3d-guide-seen','1');location.hash='#/projects'")
  const u = new URL(await evaluate("location.href"))
  if (u.hostname.endsWith(".powerplatformusercontent.com") && u.pathname.endsWith("/")) {
    u.pathname += "index.html"; await send("Page.navigate", { url: u.href })
  } else await send("Page.reload", {})
  await sleep(700)
  await wait("document.querySelector('[data-tour=new-project]')")
  console.error("brochure scenario: starting import")
  const click = async selector => {
    await evaluate(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'center'})`)
    await sleep(300)
    const p = await evaluate(`(() => { const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw new Error('要素無し');const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`)
    await send("Input.dispatchMouseEvent", { type: "mousePressed", ...p, button: "left", clickCount: 1 })
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", ...p, button: "left", clickCount: 1 })
    await sleep(250)
  }
  const setInput = async (selector, value) => {
    await evaluate(`(() => {const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw new Error('入力欄無し');const p=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`)
    await sleep(100)
  }
  await click("[data-tour=new-project]")
  await wait("document.querySelector('#listing-url')")
  const html = `<html><meta charset="utf-8"><title>【ホームズ】サンプル販売住宅 - 物件詳細</title><dl>
    <dt>所在地</dt><dd>サンプル県中央市1-2-3</dd><dt>販売価格</dt><dd>3,980万円</dd><dt>間取り</dt><dd>4LDK</dd>
    <dt>建物面積</dt><dd>98.45㎡</dd><dt>土地面積</dt><dd>132.6㎡</dd><dt>建物構造</dt><dd>木造2階建</dd></dl></html>`
  const text = "新築一戸建て サンプル販売住宅\n所在地：サンプル県中央市1-2-3\n価格：3,980万円\n間取り：4LDK\n建物面積：98.45㎡\n土地面積：132.6㎡\n構造：木造2階建"
  const cases = [
    ["homes", "https://www.homes.co.jp/kodate/b-1234567890123/"],
    ["athome", "https://www.athome.co.jp/kodate/1234567890/"],
    ["yahoo", "https://realestate.yahoo.co.jp/used/house/detail_cid_b0012345678/"],
  ]
  for (const [site, url] of cases) {
    console.error(`brochure scenario: importing ${site}`)
    await setInput("#listing-url", url)
    await wait("document.querySelector('[data-testid=portal-local-notice]')")
    assert.equal(await evaluate("document.querySelector('[data-testid=listing-with-images]')==null"), true)
    if (site === "homes") {
      await evaluate(`(() => { const dt=new DataTransfer();dt.items.add(new File([${JSON.stringify(html)}],'sample.html',{type:'text/html'}));const e=document.querySelector('[data-testid=listing-html-file]');e.files=dt.files;e.dispatchEvent(new Event('change',{bubbles:true})); })()`)
    } else {
      await setInput("#listing-paste", text)
      await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('貼り付けた内容から入力')).click()")
    }
    await wait("document.querySelector('[data-testid=listing-rows]')?.innerText.includes('98.45')")
    await sleep(300)
    const rows = await evaluate("document.querySelector('[data-testid=listing-rows]').innerText")
    assert.ok(rows.includes("3,980万円") && rows.includes("132.6") && rows.includes("木造2階建"), site)
  }
  await evaluate("[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent.includes('作成して')).click()")
  await wait("!document.querySelector('[role=dialog]') && location.hash.includes('/projects/')")
  const created = await evaluate("JSON.parse(localStorage.getItem('perse3d:projects:v1')).find(p=>p.listing?.site==='yahoo')")
  assert.equal(created.listing.buildingArea, 98.45)
  assert.equal(created.listing.floors, 2)
  const remote = await evaluate("performance.getEntriesByType('resource').map(r=>r.name).filter(n=>/https:\\/\\/(?:www\\.)?(?:homes\\.co\\.jp|athome\\.co\\.jp|realestate\\.yahoo\\.co\\.jp)/.test(n))")
  assert.deepEqual(remote, [])
  console.error("brochure scenario: imported and saved; opening 3D")
  // 同梱サンプルの3Dから任意視点をPDFへ渡す。実ユーザー・実物件の画像は使わない。
  await evaluate("location.hash='#/projects/seed-sample-house?tab=viewer'")
  await wait("document.querySelector('[data-testid=brochure-capture]') && window.__viewer?.spec")
  await sleep(1500)
  await click("[data-testid=brochure-capture]")
  await wait("document.querySelector('[data-testid=brochure-panel]')")
  console.error("brochure scenario: filling brochure")
  assert.equal(await evaluate("document.querySelector('[data-testid=brochure-export]').disabled"), true)
  const profile = {
    price: "3,980万円", company: "サンプル不動産（UI検証用）", companyAddress: "サンプル県中央市3-2-1",
    phone: "000-000-0000", license: "サンプル県知事（1）第000001号（検証用）", transaction: "媒介",
    headline: "家族が集う明るい住まい", description: "掲載内容の確認と日本語PDF出力の試験です。",
    validUntil: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
  }
  for (const [k, v] of Object.entries(profile)) await setInput(`#brochure-${k}`, v)
  const values = { "間取り": "4LDK", "建物面積": "98.45㎡", "土地面積": "132.6㎡", "構造": "木造2階建",
    "築年月": "2025年3月", "道路": "南側6m公道", "用途地域": "第一種住居地域", "土地権利": "所有権", "引渡時期": "相談" }
  const fields = await evaluate("[...document.querySelectorAll('label[for^=\"brochure-fact-\"]')].map(l=>({id:l.htmlFor,label:l.textContent}))")
  for (const f of fields) await setInput("#" + f.id, values[f.label] ?? "担当者確認済み")
  await click("[data-testid=brochure-rights]")
  await click("[data-testid=brochure-facts]")
  await wait("!document.querySelector('[data-testid=brochure-export]').disabled")
  console.error("brochure scenario: exporting")
  mkdirSync(".tools/brochure", { recursive: true })
  const directory = mkdtempSync(resolve(".tools/brochure/download-"))
  await send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: directory })
  console.error("brochure scenario: download behavior configured")
  try {
    await click("[data-testid=brochure-export]")
    console.error("brochure scenario: download click sent")
    let file
    for (let i = 0; i < 600; i++) {
      file = readdirSync(directory).find(f => f.endsWith(".pdf"))
      if (file) break
      const err = await evaluate("document.querySelector('[data-testid=brochure-panel] [role=alert]')?.textContent")
      if (err) throw new Error(err)
      await sleep(300)
    }
    assert.ok(file, "PDFの実ダウンロードが完了すること")
    const path = join(directory, file)
    assert.ok(existsSync(path))
    const bytes = readFileSync(path)
    const pdf = await PDFDocument.load(bytes)
    assert.ok(pdf.getPageCount() >= 3)
    copyFileSync(path, ".tools/brochure/ui-generated-sales-brochure.pdf")
    await wait("!document.querySelector('[data-testid=brochure-panel] [role=status]')")
    return { sites: cases.map(c => c[0]), import: "saved HTML + pasted text", outboundPortalRequests: 0,
      createdProject: { buildingArea: created.listing.buildingArea, floors: created.listing.floors },
      pdf: { pages: pdf.getPageCount(), bytes: bytes.length, filename: file, hero: "captured 3D", realDownload: true } }
  } catch (error) {
    console.error("brochure scenario failure:", error)
    throw error
  } finally { rmSync(directory, { recursive: true, force: true }) }
}
