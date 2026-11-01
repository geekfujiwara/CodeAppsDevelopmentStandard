// Pass the already-shared, approved page and loopback relay; never launch a browser.
function captureName(name, revision) {
  if (!/^[a-z0-9-]+$/.test(name) || !/^v\d+$/.test(revision)) throw new Error('Use a lowercase name and revision such as v1')
  return `${name}-${revision}`
}

async function saveSharedCapture(page, name, scale = 2, revision = 'v1') {
  return captureSharedPage(page, name, scale, revision, 1)
}

async function recordSharedPage(page, name, frameCount = 40, revision = 'v1', scale = 2) {
  // Approved actions happen outside this passive recorder; capture permission is not action permission.
  return captureSharedPage(page, name, scale, revision, frameCount)
}

async function captureSharedPage(page, name, scale, revision, frameCount) {
  const filename = captureName(name, revision)
  if (!Number.isFinite(scale) || scale <= 0 || scale > 4 || !Number.isInteger(frameCount) || frameCount < 1 || frameCount > 1500) throw new Error('Invalid capture scale or frame count')
  const relay = page.context().pages().find(candidate => new URL(candidate.url()).origin === 'http://127.0.0.1:5191')
  if (!relay) throw new Error('Share the approved loopback relay page first')
  await page.bringToFront()
  const session = await page.context().newCDPSession(page)
  try {
    const bounds = await page.evaluate(() => ({ x: scrollX, y: scrollY, width: innerWidth, height: innerHeight }))
    const frames = []
    const started = performance.now()
    for (let index = 0; index < frameCount; index += 1) {
      const screenshot = await session.send('Page.captureScreenshot', {
        format: frameCount === 1 ? 'png' : 'jpeg', quality: frameCount === 1 ? undefined : 94,
        clip: { ...bounds, scale }, captureBeyondViewport: true,
      })
      frames.push({ data: screenshot.data, timestamp: (performance.now() - started) / 1000 })
    }
    const expectedPixels = [Math.round(bounds.width * scale), Math.round(bounds.height * scale)]
    const duration = (performance.now() - started) / 1000 + .5
    const suffix = frameCount === 1 ? 'png' : 'frames'
    const payload = frameCount === 1 ? { data: frames[0].data } : { frames, duration }
    const saved = await relay.evaluate(async ({ filename, suffix, payload }) => {
      const response = await fetch(`http://127.0.0.1:5192/${filename}.${suffix}`, {
        method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error(`Capture receiver failed (${response.status}): ${await response.text()}`)
      return response.json()
    }, { filename, suffix, payload })
    if (JSON.stringify(saved.size) !== JSON.stringify(expectedPixels)) throw new Error(`Saved dimensions differ: ${JSON.stringify(saved.size)}; expected ${JSON.stringify(expectedPixels)}`)
    return { ...saved, bounds, expectedPixels }
  } finally {
    await session.detach()
  }
}
