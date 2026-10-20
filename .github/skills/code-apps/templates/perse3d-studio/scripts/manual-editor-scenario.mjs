import assert from "node:assert/strict"
import { mkdirSync, writeFileSync } from "node:fs"

// ローカル検証専用。capture_3d --scenario-file で、CDP の実ポインターイベントを使って UI → 保存 → 再読込 → 3D を通す。
export default async function ({ evaluate, send, sleep }) {
  const wait = async expression => {
    for (let i = 0; i < 180; i++) {
      if (await evaluate(`Boolean(${expression})`)) return
      await sleep(300)
    }
    throw new Error(`待機の時限: ${expression}`)
  }
  await wait("document.body && document.querySelector('header')")
  await wait("document.body.innerText.includes('DEMO（ブラウザ保存）')")
  await evaluate(`(() => {
    window.__manualReloadMark = true;
    localStorage.setItem('perse3d-guide-seen','1');
    const c = document.createElement('canvas'); c.width=400; c.height=400;
    const ctx=c.getContext('2d'); ctx.fillStyle='white'; ctx.fillRect(0,0,400,400);
    localStorage.setItem('perse3d:projects:v1', JSON.stringify([{
      id:'manual-ui-case', name:'手動補正 UI 検証', clientName:'合成画像', address:'', stage:'received',
      budget:null, designOwner:'', salesOwner:'', notes:'', spec:null, variants:[], activeVariantId:null,
      images:{floorplans:{'0':c.toDataURL('image/png')}}, createdOn:new Date().toISOString(), modifiedOn:new Date().toISOString()
    }]));
    location.hash='#/projects/manual-ui-case?tab=analyze';
  })()`)
  await send("Page.reload", {})
  await sleep(700)
  await wait("!window.__manualReloadMark")
  await wait("document.querySelector('[data-testid=manual-toggle]')")
  const click = async selector => {
    await evaluate(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'center'})`)
    await sleep(300)
    const p = await evaluate(`(() => {
      const e=document.querySelector(${JSON.stringify(selector)}); if(!e) throw new Error('要素がありません: '+${JSON.stringify(selector)});
      e.scrollIntoView({block:'center'}); const r=e.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2};
    })()`)
    await send("Input.dispatchMouseEvent", { type: "mousePressed", ...p, button: "left", clickCount: 1 })
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", ...p, button: "left", clickCount: 1 })
    await sleep(200)
  }
  const surface = "[data-testid=manual-surface]"
  const point = async (x, y) => {
    const r = await evaluate(`(() => {const e=document.querySelector('${surface}');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};})()`)
    return { x: r.x + r.w * x, y: r.y + r.h * y }
  }
  const drag = async (a, b) => {
    const start = await point(...a), end = await point(...b)
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", ...start })
    await send("Input.dispatchMouseEvent", { type: "mousePressed", ...start, button: "left", buttons: 1, clickCount: 1 })
    for (let k = 1; k <= 8; k++) {
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: start.x + (end.x - start.x) * k / 8, y: start.y + (end.y - start.y) * k / 8, button: "left", buttons: 1 })
      await sleep(20)
    }
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", ...end, button: "left", clickCount: 1 })
    await sleep(600)
  }
  const category = v => click(`[data-category="${v}"]`)
  const button = async text => {
    await evaluate(`(() => {const b=[...document.querySelectorAll('[data-testid=manual-editor] button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}); if(!b)throw new Error('ボタンがありません');b.setAttribute('data-scenario-target','1');})()`)
    await click("[data-scenario-target]")
    await evaluate("document.querySelector('[data-scenario-target]')?.removeAttribute('data-scenario-target')")
  }
  await click("[data-testid=manual-toggle]")
  await category("floor"); await drag([0.1, 0.1], [0.9, 0.9])
  await wait("document.body.innerText.includes('自動判定できないため')")
  await category("wall")
  for (const [a, b] of [
    [[0.1, 0.1], [0.9, 0.12]], [[0.1, 0.88], [0.9, 0.9]],
    [[0.1, 0.12], [0.12, 0.88]], [[0.88, 0.12], [0.9, 0.88]],
    [[0.5, 0.12], [0.52, 0.88]],
  ]) await drag(a, b)
  await category("window"); await drag([0.3, 0.1], [0.5, 0.12])
  await category("door"); await drag([0.49, 0.42], [0.53, 0.58])
  await category("storage"); await drag([0.6, 0.6], [0.8, 0.8])
  await button("選択・移動・サイズ")
  await drag([0.7, 0.7], [0.72, 0.72])
  await drag([0.818, 0.818], [0.848, 0.848])
  // 部屋の名前も選択後に変更できる。
  await category("washroom")
  await category("storage")
  await button("選択を削除")
  await button("元に戻す")
  await button("追加・分類")
  await category("window")
  await drag([0.7, 0.11], [0.7, 0.11])
  await click("[data-testid=save-corrections]")
  await wait("!document.body.innerText.includes('未保存の変更')")
  const saved = await evaluate("JSON.parse(localStorage.getItem('perse3d:projects:v1'))[0].images")
  assert.equal(saved.floorplanEdits["0"].length, 10)
  const storage = saved.floorplanEdits["0"].find(e => e.category === "storage")
  assert.ok(Math.abs(storage.x - 0.62) < 0.01, `ドラッグ移動: ${storage.x}`)
  assert.ok(storage.w > 0.22, `右下ハンドルでのサイズ変更: ${storage.w}`)
  assert.ok(saved.floorplanSettings["0"].widthMeters > 0)
  await evaluate("window.__manualReloadMark=true")
  await send("Page.reload", {})
  await sleep(700)
  await wait("!window.__manualReloadMark")
  await wait("document.querySelector('[data-testid=manual-editor]')?.innerText.includes('手動指定 10 件')")
  await wait("document.body.innerText.includes('自動判定できないため') && document.querySelector('[data-testid=manual-editor] canvas')?.width===400")
  assert.deepEqual(await evaluate("JSON.parse(localStorage.getItem('perse3d:projects:v1'))[0].images"), saved)
  await click("[data-testid=manual-toggle]")
  await wait("document.querySelector('[data-category=wall]')")
  await point(0.5, 0.5)
  mkdirSync(".tools/shots", { recursive: true })
  const correctionShot = await send("Page.captureScreenshot", { format: "png" })
  writeFileSync(".tools/shots/manual-editor-corrections.png", Buffer.from(correctionShot.data, "base64"))
  await click("[data-tour=generate]")
  await wait("location.hash.includes('tab=viewer') && window.__viewer?.spec")
  const model = await evaluate(`(() => {
    const v=window.__viewer,s=v.spec,f=s.floors[0];
    const door=f.walls.find(w=>w.kind==='door'); const x=door.x+door.w/2,z=door.z+door.d/2;
    return {floors:s.floors.length, storage:f.rooms.some(r=>r.name==='収納'),
      windows:f.walls.filter(w=>w.kind==='window').length, doors:f.walls.filter(w=>w.kind==='door').length,
      walkableDoor:v.walkable(x,z,0), saved:JSON.parse(localStorage.getItem('perse3d:projects:v1'))[0].spec!=null};
  })()`)
  assert.equal(model.floors, 1)
  assert.equal(model.storage, true)
  assert.ok(model.windows > 0)
  assert.ok(model.doors > 0)
  assert.equal(model.walkableDoor, true)
  assert.equal(model.saved, true)
  const project = await evaluate("JSON.parse(localStorage.getItem('perse3d:projects:v1'))[0]")
  writeFileSync(".tools/shots/manual-editor-project.json", JSON.stringify(project))
  return { edits: 10, persistence: "reload verified", pointer: "CDP click / drag / resize", model }
}
