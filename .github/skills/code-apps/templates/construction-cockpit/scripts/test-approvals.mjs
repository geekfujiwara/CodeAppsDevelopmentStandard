// Dataverse 検索の結果統合と、承認待ちのまとめ・注意点の判定を Node で検証する。
//   node scripts/test-approvals.mjs
import assert from "node:assert/strict"

const search = await import("../src/lib/record-search.ts")
const queue = await import("../src/lib/approval-queue.ts")
let passed = 0
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✅ ${name}`) } catch (error) { console.error(`  ❌ ${name}\n${error.stack}`); process.exitCode = 1 }
}
const G = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`

console.log("record-search.ts")
await test("部分一致の条件: 語ごとに and、列は or、引用符はエスケープ、語は 5 つまで", () => {
  assert.equal(search.containsFilter(["a", "b"], "港南 O'Neil"), "(contains(a,'港南') or contains(b,'港南')) and (contains(a,'O''Neil') or contains(b,'O''Neil'))")
  assert.equal(search.containsFilter(["a"], "   "), "")
  assert.equal(search.containsFilter(["a"], "1 2 3 4 5 6 7").split(" and ").length, 5)
})
await test("ID の条件は GUID だけを使う（OData への注入を防ぐ）", () => {
  assert.equal(search.idFilter("x", [G(1), "1 or true", G(2)]), `x eq ${G(1)} or x eq ${G(2)}`)
  assert.equal(search.idFilter("x", ["bad"]), "")
})
await test("Dataverse 検索の順位を優先し、部分一致で補い、重複を除く（大文字小文字を無視）", () => {
  const rows = [{ id: G(1), name: "A" }, { id: G(2), name: "B" }, { id: G(3), name: "C" }]
  const merged = search.mergeRanked([G(3).toUpperCase(), G(1)], [rows[0], rows[2]], [rows[1], rows[2]], (row) => row.id)
  assert.deepEqual(merged.map((row) => `${row.item.name}:${row.source}`), ["C:dataverse-search", "A:dataverse-search", "B:contains"])
  assert.equal(search.mergeRanked([], [], rows, (row) => row.id, 2).length, 2)
})

console.log("approval-queue.ts")
const S = queue.REVIEW
const tasks = [
  { id: "t1", name: "床スラブ", projectId: "p1", progress: 50, reviewStatus: S.approved },
  { id: "t2", name: "鉄骨建方", projectId: "p1", progress: 75, reviewStatus: S.submitted },
  { id: "t3", name: "外装", projectId: "p2", progress: 0, reviewStatus: S.submitted },
]
const reports = [
  { id: "r1", projectId: "p1", reportDate: "2026-10-06", reviewStatus: S.submitted, createdById: "u1", createdOn: "2026-10-06T09:00:00Z" },
  { id: "r0", projectId: "p1", reportDate: "2026-10-05", reviewStatus: S.submitted, createdById: "u2", createdOn: "2026-10-05T18:00:00Z" },
  { id: "r2", projectId: "p2", reportDate: "2026-10-06", reviewStatus: S.returned, createdById: "u1", createdOn: "2026-10-06T10:00:00Z" },
  { id: "r3", projectId: "p1", reportDate: "2026-10-04", reviewStatus: S.approved, createdById: "u1", createdOn: "2026-10-04T10:00:00Z" },
]
const entries = [
  { id: "e1", reportId: "r1", taskId: "t1", reportedProgress: 75, previousProgress: 50, reviewStatus: S.submitted, createdById: "u1" },
  { id: "e2", reportId: "r0", taskId: "t1", reportedProgress: 40, previousProgress: 45, reviewStatus: S.submitted, createdById: "u2" },
  { id: "e3", reportId: "r0", taskId: "gone", reportedProgress: 10, previousProgress: 0, reviewStatus: S.submitted, createdById: "u2" },
]
const photos = [{ id: "ph1", reportId: "r1" }, { id: "ph2", reportId: "r1" }]

await test("確認待ちの日報に写真と進捗報告をまとめ、古い提出から並べる", () => {
  const bundles = queue.buildBundles(reports, entries, photos, tasks, { view: "pending" })
  assert.deepEqual(bundles.map((bundle) => bundle.report.id), ["r0", "r1"])
  const r1 = bundles[1]
  assert.equal(r1.photos.length, 2)
  assert.equal(r1.entries[0].task.name, "床スラブ")
  assert.deepEqual(r1.warnings, [])
})
await test("注意点: 現在値より低い・報告後に進捗が変わった・作業が無い・写真が無い・急な増加", () => {
  const [r0] = queue.buildBundles(reports, entries, photos, tasks, { view: "pending" })
  const kinds = r0.warnings.map((warning) => warning.kind).sort()
  assert.deepEqual(kinds, ["lower", "missing-task", "no-photo", "stale"])
  const jump = queue.entryWarnings({ id: "x", reportId: "r", taskId: "t3", reportedProgress: 60, previousProgress: 0, reviewStatus: S.submitted, createdById: "u" }, tasks[2], true)
  assert.deepEqual(jump.map((warning) => warning.kind), ["jump"])
  assert.deepEqual(queue.entryWarnings(entries[1], tasks[0], false), [], "承認済み・差戻しでは注意を出さない")
})
await test("工事・報告者・状態で絞り込む（差戻し中・承認済みは新しい順）", () => {
  assert.deepEqual(queue.buildBundles(reports, entries, photos, tasks, { view: "pending", userId: "u2" }).map((b) => b.report.id), ["r0"])
  assert.deepEqual(queue.buildBundles(reports, entries, photos, tasks, { view: "pending", projectId: "p2" }), [])
  assert.deepEqual(queue.buildBundles(reports, entries, photos, tasks, { view: "returned" }).map((b) => b.report.id), ["r2"])
  assert.deepEqual(queue.buildBundles(reports, entries, photos, tasks, { view: "approved" }).map((b) => b.report.id), ["r3"])
})
await test("日報に紐づかない工程の提出だけを別に出す（日報の進捗報告と二重に出さない）", () => {
  const extra = [...entries, { id: "e9", reportId: "r1", taskId: "t2", reportedProgress: 80, previousProgress: 75, reviewStatus: S.submitted, createdById: "u1" }]
  assert.deepEqual(queue.standaloneTaskSubmissions(tasks, entries).map((task) => task.id), ["t2", "t3"])
  assert.deepEqual(queue.standaloneTaskSubmissions(tasks, extra).map((task) => task.id), ["t3"])
  assert.deepEqual(queue.standaloneTaskSubmissions(tasks, entries, "p2").map((task) => task.id), ["t3"])
})
await test("承認する進捗は 0〜100 の整数だけを受け付ける", () => {
  assert.equal(queue.parseApprovedValue(" 75 "), 75)
  for (const bad of ["", "101", "-1", "7.5", "abc", "1000"]) assert.equal(queue.parseApprovedValue(bad), undefined, bad)
})

console.log(`\n${passed} 件成功${process.exitCode ? "（失敗あり）" : ""}`)
