// Optional passive recorder for an existing approved loopback CDP browser. Never closes shared pages.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { performance } from 'node:perf_hooks';
import path from 'node:path';

const [endpoint, url, destination] = process.argv.slice(2);
if (!endpoint || !url || !destination) throw new Error('Usage: node record-demo.mjs <approved-loopback-CDP-endpoint> <existing-approved-url> <new-folder>');
const cdp = new URL(endpoint);
if (cdp.protocol !== 'http:' || cdp.hostname !== '127.0.0.1' || cdp.username || cdp.password) throw new Error('Only an explicitly approved loopback HTTP CDP endpoint is permitted');
if (!process.stdin.isTTY) throw new Error('Use an interactive terminal, or the shared-page capture utility; do not substitute automatic business actions');
const browser = await chromium.connectOverCDP(endpoint);
const page = browser.contexts().flatMap(context => context.pages()).find(candidate => candidate.url() === url);
if (!page) throw new Error('The approved page must already exist; this adapter never opens or navigates a page');
const output = path.resolve(destination);
await mkdir(output, { recursive: false });
const session = await page.context().newCDPSession(page);
const terminal = createInterface({ input: process.stdin, output: process.stdout });
const frames = [];
let finished = false;
const started = performance.now();
const completion = terminal.question('Record only separately approved operations. Press Enter here to finish. ').then(() => { finished = true; });
try {
  while (!finished) {
    if (frames.length >= 1500) throw new Error('1500-frame recording limit exceeded');
    const screenshot = await session.send('Page.captureScreenshot', { format: 'jpeg', quality: 94 });
    const file = path.join(output, `${String(frames.length).padStart(5, '0')}.jpg`);
    await writeFile(file, Buffer.from(screenshot.data, 'base64'), { flag: 'wx' });
    frames.push({ path: file, at: (performance.now() - started) / 1000 });
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  await completion;
  if (frames.length < 2) throw new Error('Recording needs at least two real frames');
  const firstTimestamp = frames[0].at;
  for (const frame of frames) frame.at -= firstTimestamp;
  await writeFile(path.join(output, 'recording.frames.json'), JSON.stringify({
    provenance: 'Approved existing CDP page / passive capture', frames,
    duration: (performance.now() - started) / 1000 - firstTimestamp + .5,
  }, null, 2), { flag: 'wx' });
} finally {
  terminal.close();
  await session.detach();
  // Disconnect this client only; do not call browser.close() on the shared browser.
  browser.removeAllListeners();
}
process.exit(0);
