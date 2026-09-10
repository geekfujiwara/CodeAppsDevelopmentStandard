import assert from 'node:assert/strict'
import test from 'node:test'
import { acceptPlantConnection, proposePlantConnections } from '../src/data/plant-connection-proposals.ts'
import { DEFAULT_PLANT_DESIGN } from '../src/data/plant-design-sample.ts'
import { compilePlantDesign, rectangle, validatePlantDesign } from '../src/data/plant-design.ts'
import { terminalPosition } from '../src/data/plant-network.ts'

const fresh = () => ({ ...structuredClone(DEFAULT_PLANT_DESIGN), connections: [] })

test('placement proposes compatible cross-unit connections without modifying the design', () => {
  const design = fresh()
  const original = JSON.stringify(design)
  const batch = proposePlantConnections(design, 'feed1')
  assert.ok(batch.proposals.length)
  assert.equal(JSON.stringify(design), original)
  for (const proposal of batch.proposals) {
    const { from, to } = proposal.connection
    assert.notEqual(from.unitId, to.unitId)
    assert.ok(from.unitId === 'feed1' || to.unitId === 'feed1')
    if (proposal.medium === 'process') {
      assert.equal(from.portId, 'outlet')
      assert.equal(to.portId, 'inlet')
      assert.notEqual(from.nodeId, 'tank')
      assert.notEqual(to.nodeId, 'pump')
    } else {
      assert.equal(from.unitId, 'power1')
      assert.equal(to.nodeId, 'pump')
    }
  }
  assert.deepEqual(batch.proposals.map(item => item.distance), batch.proposals.map(item => item.distance).sort((left, right) => left - right))
})

test('accept revalidates, adds one connection, and removes occupied endpoints from new proposals', () => {
  const design = fresh()
  const batch = proposePlantConnections(design, 'feed1')
  const chosen = batch.proposals[0]
  const next = acceptPlantConnection(design, batch, chosen.key)
  assert.equal(next.connections.length, 1)
  assert.equal(design.connections.length, 0)
  assert.deepEqual(validatePlantDesign(next), [])
  assert.ok(!proposePlantConnections(next, 'feed1').proposals.some(item => item.key === chosen.key))
  assert.throws(() => acceptPlantConnection(next, batch, chosen.key), /変更/)
  assert.throws(() => acceptPlantConnection(design, batch, 'invented'), /適用/)
  assert.equal(proposePlantConnections(DEFAULT_PLANT_DESIGN, 'power1').proposals.length, 0)
})

test('rotation uses world-space terminals and stale moved or removed units are rejected', () => {
  const design = fresh()
  design.units.find(unit => unit.id === 'storage1').rotation = 90
  const batch = proposePlantConnections(design, 'storage1')
  assert.ok(batch.proposals.length)
  const chosen = batch.proposals[0]
  const next = acceptPlantConnection(design, batch, chosen.key)
  const nodes = compilePlantDesign(next)
  const route = nodes.find(node => node.id === `link/${chosen.connection.id}`).route
  assert.deepEqual(route.points.at(-1), terminalPosition(nodes, route.to))
  const moved = structuredClone(design)
  moved.units.find(unit => unit.id === 'storage1').position[0] += 1
  assert.throws(() => acceptPlantConnection(moved, batch, chosen.key), /変更/)
  assert.equal(proposePlantConnections(design, 'removed').proposals.length, 0)
})

test('invalid placement, forbidden routes and distant endpoints are not proposed', () => {
  const overlap = fresh()
  overlap.units[2].position = [...overlap.units[0].position]
  assert.equal(proposePlantConnections(overlap, 'storage1').proposals.length, 0)
  const barrier = fresh()
  barrier.site.exclusions.push({ id: 'wall', name: 'wall', polygon: rectangle(11, -20, 12, 14) })
  assert.equal(proposePlantConnections(barrier, 'storage1').proposals.length, 0)
  const far = fresh()
  far.site.boundary = rectangle(-100, -100, 100, 100)
  far.units[2].position = [75, 0, -6]
  assert.equal(proposePlantConnections(far, 'storage1').proposals.length, 0)
})