import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync, mkdirSync, writeFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { PDFDocument } from "pdf-lib"
import { brochureDraft, brochureErrors, brochureFacts, brochureFileName, brochureInput, jstDate } from "../src/lib/brochure.ts"
import { createBrochurePdf, dataUrlBytes } from "../src/lib/brochure-pdf.ts"

const font = new Uint8Array(readFileSync(new URL("../src/assets/fonts/NotoSansJP-Regular.ttf", import.meta.url)))
const jpg = "data:image/jpeg;base64," + readFileSync(new URL("../public/samples/perspective.jpg", import.meta.url)).toString("base64")
const png = "data:image/png;base64," + readFileSync(new URL("../public/samples/floorplan-1f.png", import.meta.url)).toString("base64")
const project = {
  id: "brochure-test", name: "サンプル住宅", address: "サンプル県中央市", budget: 38000000,
  images: { perspective: jpg, floorplans: { "0": png, "1": png } },
  listing: { title: "サンプル住宅", address: "サンプル県中央市1-2-3", price: "3,980万円", buildingArea: 98.45,
    landArea: 132.6, layout: "4LDK", structure: "木造2階建", floors: 2, builtYear: "2025年3月",
    access: "サンプル線「中央」徒歩8分", zoning: "第一種住居地域", tenure: "所有権", transaction: "媒介",
    road: { raw: "南側6m公道", width: 6, direction: "南" }, available: "相談",
    url: "https://www.homes.co.jp/kodate/b-1234567890123/", fetchedAt: "2026-10-20T01:00:00.000Z" },
}
const valid = () => ({
  ...brochureDraft(project, new Date("2026-10-20T01:00:00Z")),
  headline: "家族が集う、光あふれる住まい。",
  description: "広いリビングと使いやすい収納。各階の図面をご覧ください。\n現地の状況・取引条件は担当者へご確認ください。",
  company: "サンプル不動産（検証用）", companyAddress: "サンプル県中央市3-2-1",
  phone: "000-000-0000", license: "サンプル県知事（1）第000001号（検証用）",
  issuedOn: "2026-10-20", validUntil: "2026-11-20", rightsConfirmed: true, factsConfirmed: true,
})
test("パンフレットの初期値は売買価格を使用し、建築予算を販売価格と推測しない", () => {
  assert.equal(brochureDraft(project).price, "3,980万円")
  assert.equal(brochureDraft({ ...project, listing: null }).price, "")
  assert.equal(jstDate(new Date("2026-10-20T15:01:00Z")), "2026-10-21")
})
test("実際の同梱フォントの大きなdata URLも、バイト配列へ正確に復元できる", () => {
  assert.deepEqual(dataUrlBytes("data:font/ttf;base64," + Buffer.from(font).toString("base64")), font)
})
test("広告確認・権利・会社・期限を未確認のままPDFを作れない", () => {
  assert.deepEqual(brochureErrors(valid()), [])
  assert.ok(brochureErrors({ ...valid(), rightsConfirmed: false }).some(e => e.includes("利用権限")))
  assert.ok(brochureErrors({ ...valid(), validUntil: "2026-02-30" }).length)
  assert.ok(brochureErrors({ ...valid(), validUntil: "2026-10-19" }).length)
  assert.throws(() => brochureInput(project, { ...valid(), license: "" }), /免許番号/)
  assert.ok(!/[<>:"/\\|?*]/.test(brochureFileName('住宅<>:"/\\|?*')))
})
test("原図を階順に掲載し、不明な面積を3Dから推測しない", () => {
  const input = brochureInput({ ...project, images: { floorplans: { "1": png, "0": png } } }, valid())
  assert.ok(input.floorplans[0].label.startsWith("1F"))
  assert.equal(brochureFacts({ ...project, listing: null }).find(r => r.label === "建物面積").value, "")
  assert.throws(() => brochureInput({ ...project, listing: null }, valid()), /建物面積/)
  assert.match(input.modelDisclaimer, /参考イメージ/)
})
test("A4日本語PDFに外観・2階分の図面・会社情報を出力できる", async () => {
  const bytes = await createBrochurePdf(brochureInput(project, valid(), { label: "参考3Dイメージ", dataUrl: jpg }), font)
  assert.equal(new TextDecoder().decode(bytes.subarray(0, 5)), "%PDF-")
  const pdf = await PDFDocument.load(bytes)
  assert.equal(pdf.getPageCount(), 3)
  for (const page of pdf.getPages()) {
    assert.ok(Math.abs(page.getWidth() - 595.28) < 0.1)
    assert.ok(Math.abs(page.getHeight() - 841.89) < 0.1)
  }
  assert.equal(pdf.getAuthor(), valid().company)
  assert.equal(pdf.getTitle(), "サンプル住宅 販売用パンフレット")
  mkdirSync(".tools/brochure", { recursive: true })
  writeFileSync(".tools/brochure/sample-sales-brochure.pdf", bytes)
})
test("長い紹介文・長い会社情報・3階以上も省略せず追加ページへ送る", async () => {
  const input = brochureInput({ ...project, images: { floorplans: { "0": png, "1": png, "2": png } } },
    { ...valid(), description: "暮らしを彩る住まいのご案内。".repeat(60), companyAddress: "サンプル県中央市".repeat(24) })
  const bytes = await createBrochurePdf(input, font)
  const pdf = await PDFDocument.load(bytes)
  assert.ok(pdf.getPageCount() >= 4)
})
test("壊れた画像・未対応文字を成功形のPDFで返さず、具体的なエラーにする", async () => {
  await assert.rejects(createBrochurePdf(brochureInput(project, valid(), { label: "外観", dataUrl: "data:image/png;base64,QQ==" }), font), /外観/)
  await assert.rejects(createBrochurePdf(brochureInput(project, { ...valid(), title: "住宅😀" }), font), /フォントにない文字/)
  assert.throws(() => dataUrlBytes("https://example.com/image.jpg"), /data URL/)
})
let hasFitz = false
try { hasFitz = execFileSync("python", ["-c", "import importlib.util; print(bool(importlib.util.find_spec('fitz')))"], { encoding: "utf8" }).trim() === "True" } catch { /* Python無しではPDF構造の検証のみ行う。 */ }
test("日本語を抽出でき、画像が載り、全テキストがA4の範囲内に収まる（PyMuPDFがあるとき）", { skip: !hasFitz }, async () => {
  const bytes = await createBrochurePdf(brochureInput(project, valid(), { label: "参考3Dイメージ", dataUrl: jpg }), font)
  const result = JSON.parse(execFileSync("python", ["-c", `
import fitz, sys, json, base64
doc=fitz.open(stream=base64.b64decode(sys.stdin.read()),filetype='pdf')
text=''.join(p.get_text() for p in doc)
bad=[]
invisible=[]
for i,p in enumerate(doc):
    for block in p.get_text('dict')['blocks']:
        for line in block.get('lines',[]):
            for span in line['spans']:
                x0,y0,x1,y1=span['bbox']
                if x0 < -1 or y0 < -1 or x1 > p.rect.width+1 or y1 > p.rect.height+1: bad.append([i,span['text']])
    # ToUnicodeだけ正しく、埋め込まれた字形が欠けるPDFを検出する。文字の範囲を実描画して濃淡差を測る。
    for block in p.get_text('rawdict')['blocks']:
        for line in block.get('lines',[]):
            for span in line['spans']:
                for ch in span['chars']:
                    if not ch['c'].isalnum(): continue
                    pix=p.get_pixmap(matrix=fitz.Matrix(2,2),clip=fitz.Rect(ch['bbox']),alpha=False)
                    data=pix.samples
                    values=[sum(data[j:j+3])/3 for j in range(0,len(data),pix.n)]
                    if values and max(values)-min(values)<20: invisible.append([i,ch['c']])
print(json.dumps({'text':text,'outside':bad,'invisible':invisible,'images':sum(len(p.get_images()) for p in doc)},ensure_ascii=True))
`], { input: Buffer.from(bytes).toString("base64"), encoding: "utf8" }))
  assert.match(result.text, /サンプル住宅/)
  assert.match(result.text, /3,980万円/)
  assert.match(result.text, /免許|第000001号/)
  assert.match(result.text, /1F 間取り図/)
  assert.match(result.text, /2F 間取り図/)
  assert.match(result.text, /参考イメージ/)
  assert.match(result.text, /98\.45 m²/)
  assert.match(result.text, /000-000-0000/)
  assert.deepEqual(result.outside, [])
  assert.deepEqual(result.invisible, [], "文字の抽出だけでなく、実際の字形が描画されること")
  assert.ok(result.images >= 3)
})
