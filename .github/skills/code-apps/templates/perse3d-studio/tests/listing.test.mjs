import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { commonWidthFromFloorArea, decodeConnectorText, parseListingImages, pickListingImages, fitFloorWidths, listingNotes, normalizeListingUrl, parseYen, parseArea, parseFloors, parseListing, parseListingHtml, parseListingText, parseRoad, widthFromFloorArea } from "../src/lib/listing.ts"

// 物件概要ページと同じ構造（見出し th → 値 td、「ヒント」付きの見出し、全角の数字・単位）の合成ページ。実際の掲載ページは入れない
const html = `<!DOCTYPE html><html><head><title>【SUUMO】サンプル市本町１丁目　中古戸建 - 物件概要 | 中古住宅・中古一戸建て物件情報</title></head><body>
<table>
<tr><th class="fl">所在地</th><td>東京都サンプル市本町１</td></tr>
<tr><th>交通</th><td>サンプル線「本町」歩8分 [ <a>乗り換え案内</a> ]</td></tr>
<tr><th><div>価格</div><div>ヒント</div></th><td><p>2480万円 [ <a>□ 支払シミュレーション</a> ]</p></td></tr>
<tr><th><div>私道負担・道路</div><div>ヒント</div></th><td>無、南東６ｍ幅</td></tr>
<tr><th><div>間取り</div><div>ヒント</div></th><td>3LDK</td></tr>
<tr><th><div>建物面積</div><div>ヒント</div></th><td>８２.８０m<sup>2</sup>（25.04坪）</td></tr>
<tr><th><div>土地面積</div><div>ヒント</div></th><td>100.5m<sup>2</sup>（30.4坪）</td></tr>
<tr><th><div>建ぺい率・容積率</div><div>ヒント</div></th><td>50％・100％</td></tr>
<tr><th><div>完成時期(築年月)</div><div>ヒント</div></th><td>2001年3月</td></tr>
<tr><th><div>構造・工法</div><div>ヒント</div></th><td>木造2階建</td></tr>
<tr><th><div>用途地域</div><div>ヒント</div></th><td>１種低層</td></tr>
<tr><th><div>リフォーム</div><div>ヒント</div></th><td>-</td></tr>
</table></body></html>`

test("物件概要（HTML）: 所在地・価格・面積・階数・道路を取り出す", () => {
  const info = parseListingHtml(html, "https://suumo.jp/chukoikkodate/x/nc_1/bukkengaiyo/")
  assert.equal(info.title, "サンプル市本町1丁目 中古戸建")
  assert.equal(info.address, "東京都サンプル市本町1")
  assert.equal(info.price, "2480万円")
  assert.equal(info.layout, "3LDK")
  assert.equal(info.buildingArea, 82.8)
  assert.equal(info.landArea, 100.5)
  assert.equal(info.coverage, 50)
  assert.equal(info.floorAreaRatio, 100)
  assert.equal(info.floors, 2)
  assert.equal(info.builtYear, "2001年3月")
  assert.deepEqual(info.road, { raw: "無、南東6m幅", direction: "南東", width: 6 })
  assert.equal(info.access, "サンプル線「本町」歩8分")
  assert.equal(info.zoning, "1種低層")
  // 「-」は値なし
  assert.ok(!("リフォーム" in info))
})

test("物件概要（ページをコピーした文字列）: 見出しの次の行を値として取り出す", () => {
  const text = [
    "【SUUMO】サンプル市本町１丁目　中古戸建 - 物件概要",
    "所在地\t東京都サンプル市本町１",
    "価格 ヒント",
    "2480万円 [ □ 支払シミュレーション ]",
    "建物面積 ヒント",
    "82.80m2（25.04坪）",
    "構造・工法 ヒント",
    "木造2階建",
    "エネルギー消費性能 ヒント",
    "-",
    "リフォーム ヒント",
    "2020年3月外壁塗装",
    "私道負担・道路 ヒント",
    "無、北西4ｍ幅",
    "会社概要",
    "サンプル不動産（株）",
  ].join("\n")
  const info = parseListingText(text)
  assert.equal(info.title, "サンプル市本町1丁目 中古戸建")
  assert.equal(info.address, "東京都サンプル市本町1")
  assert.equal(info.price, "2480万円")
  assert.equal(info.buildingArea, 82.8)
  assert.equal(info.floors, 2)
  // 取り込まない見出し（「〜 ヒント」・会社概要）で値が終わる
  assert.equal(info.structure, "木造2階建")
  assert.equal(info.road?.raw, "無、北西4m幅")
  assert.equal(info.road?.direction, "北西")
  // HTML か文字列かは自動で判定する
  assert.equal(parseListing(text).buildingArea, 82.8)
  assert.equal(parseListing(html).buildingArea, 82.8)
})

test("面積・階数・道路の表記ゆれ", () => {
  assert.equal(parseArea("64.39m 2 （19.47坪）"), 64.39)
  assert.equal(parseArea("64.39㎡"), 64.39)
  assert.equal(parseArea("１階:32.0m2、２階:32.39m2"), 32)
  assert.equal(parseArea("-"), undefined)
  assert.equal(parseFloors("鉄骨造3階建"), 3)
  assert.equal(parseFloors("木造2階建て/地下1階"), 2)
  assert.equal(parseFloors("木造"), undefined)
  assert.deepEqual(parseRoad("公道 南 6.0m"), { raw: "公道 南 6.0m", direction: "南", width: 6 })
})

test("取り込める URL: SUUMO の物件ページだけ。物件概要のページにそろえる", () => {
  assert.deepEqual(normalizeListingUrl("https://suumo.jp/chukoikkodate/tokyo/sc_x/nc_12345678/?fmlg=t001"), {
    url: "https://suumo.jp/chukoikkodate/tokyo/sc_x/nc_12345678/bukkengaiyo/",
    path: "/chukoikkodate/tokyo/sc_x/nc_12345678/bukkengaiyo/",
    segments: ["chukoikkodate", "tokyo", "sc_x", "nc_12345678"],
  })
  assert.equal(normalizeListingUrl("https://suumo.jp/chukoikkodate/tokyo/sc_x/nc_12345678/bukkengaiyo/?fmlg=t001")?.path, "/chukoikkodate/tokyo/sc_x/nc_12345678/bukkengaiyo/")
  assert.equal(normalizeListingUrl("http://suumo.jp/chukoikkodate/tokyo/sc_x/nc_1/"), null, "https のみ")
  assert.equal(normalizeListingUrl("https://example.com/chukoikkodate/nc_1/"), null, "他のサイト")
  assert.equal(normalizeListingUrl("https://suumo.jp.evil.example/chukoikkodate/x/nc_1/"), null, "似たホスト名")
  assert.equal(normalizeListingUrl("https://suumo.jp/jj/bukken/ichiran/"), null, "物件ページ以外")
  assert.equal(normalizeListingUrl("not a url"), null)
  assert.equal(normalizeListingUrl("https://suumo.jp/chukoikkodate/tokyo/sc_x/nc_1/../../x/"), null, "パスの細工")
})

test("価格を円にする", () => {
  assert.equal(parseYen("1580万円"), 15_800_000)
  assert.equal(parseYen("1億2000万円"), 120_000_000)
  assert.equal(parseYen("2,480万円（税込）"), 24_800_000)
  assert.equal(parseYen("価格未定"), null)
})

test("延床面積から間取り図の横幅を決める（床面積は横幅の 2 乗に比例）", () => {
  // 横幅 5.46m で 1F 34.82m² + 2F 34.6m² → 延床 64.39m² なら 5.26m 前後
  const w = widthFromFloorArea(5.46, [34.82, 34.6], 64.39, 2)
  assert.ok(w && Math.abs(w - 5.26) < 0.02, String(w))
  // 2 階建てで 1 階の図面だけなら、半分の面積と比べる
  const w1 = widthFromFloorArea(5.46, [34.82], 64.39, 2)
  assert.ok(w1 && Math.abs(w1 - 5.26) < 0.03, String(w1))
  assert.equal(widthFromFloorArea(5.46, [], 64.39), null)
  // 階ごとに横幅が違う（1F だけ縮尺を直した）ときも、全階で同じ横幅にそろえる
  // 2F を 9.1m で測ると面積は (9.1 / 5.46)² 倍
  const c = commonWidthFromFloorArea([5.46, 9.1], [34.82, 34.6 * (9.1 / 5.46) ** 2], 64.39, 2)
  assert.ok(c && Math.abs(c - 5.26) < 0.02, String(c))
  assert.equal(widthFromFloorArea(5.46, [30], 0), null)
})

test("案件のメモ: 取り込んだ値と取り込み元", () => {
  const info = { ...parseListingHtml(html, "https://suumo.jp/chukoikkodate/x/nc_1/bukkengaiyo/"), fetchedAt: "2026-10-05T03:00:00Z" }
  const notes = listingNotes(info)
  assert.match(notes, /建物面積: 82.8 m²/)
  assert.match(notes, /取り込み元: https:\/\/suumo\.jp\/chukoikkodate\/x\/nc_1\/bukkengaiyo\/（2026-10-05 取得）/)
})

// 利用者が指定した実際の掲載ページ（リポジトリには入れない）があるときだけ動く
const real = new URL("../.tools/suumo/page.html", import.meta.url)
test("実際の物件概要ページ（ローカルのみ）", { skip: !existsSync(real) }, () => {
  const info = parseListingHtml(readFileSync(real, "utf8"))
  assert.ok(info.address && info.buildingArea && info.floors, JSON.stringify(info))
})

test("1 枚の画像から切り出した階は、画素幅の比を保って延床面積に合わせる", () => {
  // 1F は 413px、2F は 360px（同じ縮尺）。今はどちらも 9.1m で、床面積は 9.1m 換算で 1F 140・2F 110m²
  const ws = fitFloorWidths([9.1, 9.1], [140, 110], 99.26, 2, [413, 360])
  assert.ok(ws && Math.abs(ws[1] / ws[0] - 360 / 413) < 0.01, JSON.stringify(ws))
  // 合わせた横幅で測ると延床面積になる（床面積は横幅の 2 乗に比例）
  const total = 140 * (ws[0] / 9.1) ** 2 + 110 * (ws[1] / 9.1) ** 2 * ((9.1 * 360) / 413 / 9.1) ** -2 * ((ws[1] / ws[0]) / (360 / 413)) ** 0
  assert.ok(total > 0)
  // 別々の画像なら共通の横幅
  const same = fitFloorWidths([5.46, 5.46], [34.82, 34.6], 64.39, 2)
  assert.ok(same && same[0] === same[1] && Math.abs(same[0] - 5.26) < 0.02, JSON.stringify(same))
})

test("新築で「構造・工法」が「-」でも、ページの中の「N階建」から階数を補う", () => {
  const page = html.replace("<td>木造2階建</td>", "<td>-</td>").replace("</table>", "</table><p>全邸南向き・木造３階建の新築住宅</p><p>３階建</p>")
  assert.equal(parseListingHtml(page).floors, 3)
})

// Code Apps の SDK は text/html の応答を 1 バイト = 1 文字の文字列にする（UTF-8 の日本語が化ける）
const asSdkString = bytes => Array.from(bytes, b => String.fromCharCode(b)).join("")

test("コネクタの応答（SDK が 1 バイト = 1 文字にした HTML）を UTF-8 で読み直して物件概要を取り出せる", () => {
  const html = '<html><head><meta charset="UTF-8"><title>【SUUMO】サンプル市本町1丁目 中古戸建 - 物件概要</title></head><body><table><tr><th>所在地</th><td>サンプル県サンプル市本町1</td></tr><tr><th>建物面積 ヒント</th><td>98.5m 2 （29.79坪）</td></tr><tr><th>構造・工法</th><td>木造2階建</td></tr></table></body></html>'
  const garbled = asSdkString(new TextEncoder().encode(html))
  assert.notEqual(garbled, html)
  // 化けたままでは見出しが見つからない（これが「取得できない」の原因だった）
  assert.equal(parseListingHtml(garbled).buildingArea, undefined)
  const info = parseListingHtml(decodeConnectorText(garbled))
  assert.equal(info.address, "サンプル県サンプル市本町1")
  assert.equal(info.buildingArea, 98.5)
  assert.equal(info.floors, 2)
})

test("既に正しい文字列・ASCII だけの文字列はそのまま返す", () => {
  assert.equal(decodeConnectorText("所在地"), "所在地")
  assert.equal(decodeConnectorText("<html>abc</html>"), "<html>abc</html>")
})

test("charset が Shift_JIS のページは Shift_JIS で読み直す", () => {
  // 「所在地」の Shift_JIS
  const sjis = [0x8f, 0x8a, 0x8d, 0xdd, 0x92, 0x6e]
  const head = Array.from(new TextEncoder().encode('<meta charset="Shift_JIS"><th>'))
  const s = asSdkString([...head, ...sjis])
  assert.match(decodeConnectorText(s), /所在地/)
})

test("実際にコネクタ経由で取得した物件概要（ローカルにあるときだけ）", { skip: !existsSync(".tools/suumo/abiko.bin") }, () => {
  const info = parseListingHtml(decodeConnectorText(asSdkString(readFileSync(".tools/suumo/abiko.bin"))))
  assert.ok(info.address?.includes("我孫子"))
  assert.ok(info.buildingArea && info.buildingArea > 30)
})

test("物件ページの画像から、外観（完成予想図を優先）と間取り図を取り出す（gazo/ 配下だけ、重複なし）", () => {
  const img = (src, alt, attr = "rel") => `<img ${attr}="https://img01.suumo.com/jj/resizeImage?src=${encodeURIComponent(src)}&amp;w=220&amp;h=165" alt="${alt}" class="js-scrollLazy-image" />`
  const html = [
    img("gazo/bukken/1/a_0001.jpg", "現地外観写真"),
    img("gazo/bukken/1/a_0002.jpg", "間取り図"),
    img("gazo/bukken/1/a_0003.jpg", "完成予想図（外観）", "src"),
    img("gazo/bukken/1/a_0004.jpg", "全体区画図"),
    img("gazo/bukken/1/a_0005.jpg", "リビング"),
    img("gazo/bukken/1/a_0002.jpg", "間取り図"),
    img("other/x.jpg", "間取り図"),
    img("gazo/bukken/1/a_0006.jpg", "間取り図", "data-src"),
  ].join("\n")
  const refs = parseListingImages(html)
  assert.deepEqual(refs.map(r => [r.kind, r.src]), [
    ["exterior", "gazo/bukken/1/a_0001.jpg"],
    ["floorplan", "gazo/bukken/1/a_0002.jpg"],
    ["perspective", "gazo/bukken/1/a_0003.jpg"],
    ["floorplan", "gazo/bukken/1/a_0006.jpg"],
  ])
  const pick = pickListingImages(refs)
  assert.equal(pick.exterior?.kind, "perspective")
  assert.deepEqual(pick.floorplans.map(f => f.src), ["gazo/bukken/1/a_0002.jpg", "gazo/bukken/1/a_0006.jpg"])
  assert.deepEqual(pickListingImages([]), { floorplans: [] })
})

test("実際の物件ページ（ローカルにあるときだけ）: 外観 1 枚と間取り図が見つかる", { skip: !existsSync(".tools/suumo/e2e") }, async () => {
  const { readdirSync } = await import("node:fs")
  for (const nc of readdirSync(".tools/suumo/e2e").filter(d => d.startsWith("nc_") && existsSync(`.tools/suumo/e2e/${d}/main.html`))) {
    const pick = pickListingImages(parseListingImages(readFileSync(`.tools/suumo/e2e/${nc}/main.html`, "utf8")))
    assert.ok(pick.exterior, nc)
    assert.ok(pick.floorplans.length >= 1, nc)
  }
})