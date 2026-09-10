import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_PLANT_DESIGN } from '../src/data/plant-design-sample.ts'
import { confirmPlacement, placementCandidate, snapPlacementPoint } from '../src/data/plant-placement.ts'

test('gallery selection and placement preview do not commit to the original design', () => {
  const design = structuredClone(DEFAULT_PLANT_DESIGN)
  const basis = JSON.stringify(design)
  const draft = { id: 'new-storage', moduleId: 'storage', name: '貯槽', position: [0, 0, 6], rotation: 0 }
  const preview = placementCandidate(design, draft)
  assert.equal(preview.units.length, 5)
  assert.equal(JSON.stringify(design), basis)
  const placed = confirmPlacement(design, basis, draft)
  assert.equal(placed.units.length, 5)
  assert.deepEqual(placed.units.at(-1).position, [0, 0, 6])
  assert.equal(design.units.length, 4)
})

test('invalid or stale placement cannot be confirmed', () => {
  const design = structuredClone(DEFAULT_PLANT_DESIGN)
  const basis = JSON.stringify(design)
  const draft = { id: 'new-storage', moduleId: 'storage', name: '貯槽', position: [0, 0, 6], rotation: 90 }
  assert.throws(() => confirmPlacement(design, basis, { ...draft, position: [-16, 0, -6] }))
  assert.throws(() => confirmPlacement(design, basis, { ...draft, position: [0, 0, 17] }))
  assert.throws(() => confirmPlacement(design, basis, { ...draft, position: [100, 0, 0] }))
  assert.throws(() => confirmPlacement({ ...design, name: 'changed' }, basis, draft), /変更/)
  assert.throws(() => placementCandidate(design, { ...draft, id: 'feed1' }), /重複/)
  assert.throws(() => placementCandidate(design, { ...draft, position: [NaN, 0, 0] }))
})

test('point selection snaps to half-metre grid including negative coordinates', () => {
  assert.deepEqual(snapPlacementPoint(3.24, -5.76), [3, 0, -6])
  assert.deepEqual(snapPlacementPoint(3.3, -5.6), [3.5, 0, -5.5])
  assert.throws(() => snapPlacementPoint(Infinity, 0))
})