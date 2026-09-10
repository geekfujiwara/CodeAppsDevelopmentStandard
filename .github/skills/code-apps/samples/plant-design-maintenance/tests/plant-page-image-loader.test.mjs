import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { loadPlantPageImages } from '../src/lib/plant-page-image-loader.ts'

const source = '00000000-0000-4000-8000-000000000006'
const revision = '00000000-0000-4000-8000-000000000007'
const drawing = '00000000-0000-4000-8000-000000000008'
const path = 'drawings/tk101/DWG-TK101-1001_Rev.B.pdf'
const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=', 'base64')
const image = { path, drawingNumber: 'DWG-TK101-1001', revision: 'Rev.B', page: 1, mimeType: 'image/png', width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), data: bytes.toString('base64'), sha256: createHash('sha256').update(bytes).digest('hex') }
const row = { sample_kbsourceindexid: source, sample_pagenumber: 1, sample_pageimagejson: JSON.stringify(image), _sample_drawingrevisionid_value: revision }
const fixture = (cache = row, revisionRows = [{ sample_name: 'Rev.B', sample_fileurl: path, _sample_drawingid_value: drawing }]) => async (table, options) => {
  assert.match(options.filter, /statecode eq 0/)
  if (table === 'sample_kbsourceindexes') {
    assert.ok(!options.select.includes('sample_pageimagejson'))
    assert.ok(options.filter.includes(source))
    assert.match(options.filter, /sample_verified eq true/)
    return [cache]
  }
  if (table === 'sample_kbdrawingrevisions') {
    assert.ok(options.filter.includes(revision))
    assert.match(options.filter, /sample_status eq 100000000/)
    return revisionRows
  }
  assert.equal(table, 'sample_kbdrawings')
  assert.ok(options.filter.includes(drawing))
  return [{ sample_name: 'DWG-TK101-1001' }]
}
const load = (reader, direct = true, ids = [source], fetchImage = async id => ({ ...image, sourceId: id })) => loadPlantPageImages(reader, ids, '', direct, 'sample', 'sample_kb', fetchImage)

test('explicit image request validates a synthetic PNG without AI reply text', async () => {
  assert.equal((await load(fixture()))[0].src, 'data:image/png;base64,' + image.data)
  assert.deepEqual(await load(fixture(), false), [])
})
test('missing image and inaccessible revision do not substitute another image', async () => {
  assert.equal((await load(fixture({ ...row, sample_pageimagejson: null })))[0].src, 'data:image/png;base64,' + image.data)
  assert.deepEqual(await load(fixture(row, [])), [])
  await assert.rejects(load(fixture({ ...row, sample_pagenumber: 2 })), /検証できません/)
  await assert.rejects(load(fixture(), true, [source], async () => ({ ...image, sourceId: revision })), /索引ID/)
  await assert.rejects(load(fixture(), true, [source], async () => { throw new Error('renderer unavailable') }), /renderer unavailable/)
})
test('permission errors propagate and invalid IDs do not query', async () => {
  await assert.rejects(load(async () => { throw new Error('403') }), /403/)
  assert.deepEqual(await load(async () => assert.fail('invalid ID must not query'), true, ['invalid']), [])
})