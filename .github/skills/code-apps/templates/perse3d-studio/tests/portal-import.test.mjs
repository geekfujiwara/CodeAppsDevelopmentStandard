import { test } from "node:test"
import assert from "node:assert/strict"
import { decodeListingHtmlFile, normalizePropertyUrl, parseListing } from "../src/lib/listing.ts"

const urls = {
  homes: "https://www.homes.co.jp/kodate/b-1234567890123/?ref=sample",
  athome: "https://www.athome.co.jp/kodate/1234567890/?DOWN=1",
  yahoo: "https://realestate.yahoo.co.jp/used/house/detail_cid_b0012345678/?ref=test",
}
test("SUUMOと主要3サイトの詳細URLを認識し、未追加の自動接続を成功扱いにしない", () => {
  for (const [site, url] of Object.entries(urls)) {
    const result = normalizePropertyUrl(url)
    assert.equal(result.site, site)
    assert.equal(result.automatic, false)
    assert.ok(!result.url.includes("?"))
  }
  assert.equal(normalizePropertyUrl("https://suumo.jp/ikkodate/ibaraki/sc_sample/nc_12345678/").automatic, true)
  for (const bad of [
    "https://www.homes.co.jp.evil.example/kodate/b-1/", "https://homes.co.jp/kodate/list/", "http://homes.co.jp/kodate/b-1/",
    "https://user:secret@www.homes.co.jp/kodate/b-1/", "https://www.athome.co.jp/login/", "https://www.athome.co.jp/kodate/1/../../",
    "https://realestate.yahoo.co.jp/used/house/search/", "https://www.homes.co.jp:8443/kodate/b-1/",
  ]) assert.equal(normalizePropertyUrl(bad), null, bad)
})

test("HOME'S・at homeのdt/dd形式の保存HTMLから物件概要を取り込める", () => {
  const html = `<html><title>【ホームズ】サンプルの家 - 物件詳細</title><dl>
    <dt>所在地</dt><dd>サンプル県中央市1-2</dd><dt>販売価格</dt><dd>2,980万円</dd>
    <dt>建物面積（延床）</dt><dd>98.45㎡</dd><dt>土地面積</dt><dd>132.6㎡</dd>
    <dt>間取り</dt><dd>4LDK</dd><dt>建物構造</dt><dd>木造2階建</dd>
    <dt>建ぺい率</dt><dd>60%</dd><dt>容積率</dt><dd>200%</dd><dt>土地権利</dt><dd>所有権</dd>
    <dt>引渡し</dt><dd>相談</dd><dt>取引態様</dt><dd>媒介</dd></dl></html>`
  for (const url of [urls.homes, urls.athome]) {
    const info = parseListing(html, url)
    assert.equal(info.address, "サンプル県中央市1-2")
    assert.equal(info.buildingArea, 98.45)
    assert.equal(info.landArea, 132.6)
    assert.equal(info.floors, 2)
    assert.equal(info.coverage, 60)
    assert.equal(info.floorAreaRatio, 200)
    assert.equal(info.tenure, "所有権")
    assert.equal(info.transaction, "媒介")
  }
})

test("Yahoo!不動産などのコピー本文・全角コロン付きの見出しを読み取れる", () => {
  const info = parseListing(`新築一戸建て サンプル邸\n価格：3,180万円\n住所：サンプル県中央市\n交通：サンプル線「中央」徒歩8分\n間取：3LDK\n延べ床面積：102.3㎡\n土地面積：150㎡\n構造・階建：木造2階建\n接道：南 6m\n土地権利：所有権\n引渡時期：即時`, urls.yahoo)
  assert.equal(info.site, "yahoo")
  assert.equal(info.price, "3,180万円")
  assert.equal(info.address, "サンプル県中央市")
  assert.equal(info.buildingArea, 102.3)
  assert.equal(info.layout, "3LDK")
  assert.equal(info.road.direction, "南")
  assert.equal(info.road.width, 6)
  assert.equal(info.available, "即時")
})

test("JSON-LDは住所・面積・JPY価格を構造化データから補う（掲載HTMLを実行しない）", () => {
  const html = `<html><script type="application/ld+json">${JSON.stringify({
    "@graph": [{ "@type": "SingleFamilyResidence", name: "サンプル邸",
      address: { addressRegion: "サンプル県", addressLocality: "中央市", streetAddress: "1-2-3" },
      floorSize: { value: 98.7, unitCode: "MTK" }, offers: { "@type": "Offer", priceCurrency: "JPY", price: "39800000" } }],
  })}</script><script>throw new Error("実行不可")</script></html>`
  const info = parseListing(html, urls.homes)
  assert.equal(info.title, "サンプル邸")
  assert.equal(info.address, "サンプル県中央市1-2-3")
  assert.equal(info.buildingArea, 98.7)
  assert.equal(info.price, "3,980万円")
  assert.ok(parseListing('<script type="application/ld+json">{bad}</script>').warnings?.length)
})

test("異なる単位のJSON-LD面積を平方メートルと取り違えず、サイトの制限画面も成功扱いにしない", () => {
  const html = `<script type="application/ld+json">{"@type":"House","floorSize":{"value":400,"unitCode":"FTK"}}</script>`
  assert.equal(parseListing(html).buildingArea, undefined)
  const blocked = parseListing("<html><title>認証にご協力ください</title><p>Access denied</p></html>", urls.athome)
  assert.equal(blocked.address, undefined)
  assert.equal(blocked.buildingArea, undefined)
})

test("保存HTMLはUTF-8とShift_JISを読み分け、不正な文字コードは明示エラー", () => {
  const utf8 = '<meta charset="utf-8"><dl><dt>所在地</dt><dd>サンプル県</dd></dl>'
  assert.equal(decodeListingHtmlFile(new TextEncoder().encode(utf8)), utf8)
  const head = [...new TextEncoder().encode('<meta charset="Shift_JIS"><th>')]
  const bytes = new Uint8Array([...head, 0x8f, 0x8a, 0x8d, 0xdd, 0x92, 0x6e])
  assert.match(decodeListingHtmlFile(bytes), /所在地/)
  assert.throws(() => decodeListingHtmlFile(new Uint8Array([0xff, 0xfe, 0x00])), /読み取れません/)
})
