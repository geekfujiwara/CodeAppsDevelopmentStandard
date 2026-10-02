import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PcmSegmenter } from '../src/lib/speech/pcm-segmenter.ts';

const second = (value: number) => new Int16Array(16000).fill(value).buffer;

test('認識の位置（ms）で録音を切り出し、残りを次の発言に回す', async () => {
  const s = new PcmSegmenter();
  s.append(second(1));
  s.append(second(2));
  s.append(second(3));
  const first = s.take(1500);
  assert.ok(first);
  assert.equal(first.durationSec, 1.5);
  assert.equal(first.blob.size, 44 + 1.5 * 16000 * 2);
  const head = new Int16Array(await first.blob.arrayBuffer(), 44);
  assert.equal(head[0], 1);
  assert.equal(head[head.length - 1], 2);
  const rest = s.take();
  assert.ok(rest);
  assert.equal(rest.durationSec, 1.5);
  const tail = new Int16Array(await rest.blob.arrayBuffer(), 44);
  assert.equal(tail[0], 2);
  assert.equal(tail[tail.length - 1], 3);
  assert.equal(s.take(), null);
});

test('前回より前の位置を指定しても空の区間を返さない', () => {
  const s = new PcmSegmenter();
  s.append(second(1));
  s.take(800);
  assert.equal(s.take(500), null);
});
