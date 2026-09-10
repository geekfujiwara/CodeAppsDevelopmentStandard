import assert from 'node:assert/strict'
import test from 'node:test'
import { detectPlantAuthentication, PlantAuthenticationRequiredError, plantConnectionManagerUrl } from '../src/lib/plant-agent-auth.ts'
import { parseAgentReply, parseStartedConversationId } from '../src/lib/plant-agent-contract.ts'

test('OAuth and sign-in attachments are surfaced before incomplete or empty replies', () => {
  for (const contentType of ['application/vnd.microsoft.card.oauth', 'application/vnd.microsoft.card.signin']) {
    const reply = { data: { completed: false, conversationId: 'conversation-1', activities: [{ attachments: [{ contentType, content: { buttons: [{ value: 'https://untrusted.example/secret' }] } }] }] } }
    for (const parse of [parseAgentReply, parseStartedConversationId]) assert.throws(() => parse(reply), error => {
      assert.ok(error instanceof PlantAuthenticationRequiredError)
      assert.equal(error.conversationId, 'conversation-1')
      assert.ok(!JSON.stringify(error).includes('untrusted'))
      return true
    })
  }
})

test('structured consent and expired authorization produce sanitized reasons', () => {
  assert.equal(detectPlantAuthentication({ error: { code: 'Unauthorized', message: 'AADSTS65001 PRIVATE_DETAIL' } }).reason, 'consent')
  assert.equal(detectPlantAuthentication({ code: 'invalid_grant', message: 'SECRET' }).reason, 'sign-in')
  assert.equal(detectPlantAuthentication({ error: { code: 'Forbidden' } }), undefined)
  assert.equal(detectPlantAuthentication({ error: { statusCode: 500 } }), undefined)
  assert.equal(detectPlantAuthentication({ ConversationId: 'session-1', error: { code: 'consent_required' } }).conversationId, 'session-1')
  assert.equal(detectPlantAuthentication({ conversationId: 'https://unsafe.example', error: { code: 'Unauthorized' } }).conversationId, undefined)
})

test('agent text and arbitrary adaptive cards cannot trigger authentication', () => {
  for (const value of ['AADSTS65001', { responses: ['consent_required AADSTS65001'] }, { result: 'Unauthorized' }, { attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', content: { text: 'AADSTS65001' } }] }]) {
    assert.equal(detectPlantAuthentication(value), undefined)
  }
  const cycle = {}; cycle.data = cycle
  assert.equal(detectPlantAuthentication(cycle), undefined)
})

test('connection manager links use only a validated environment and fixed Microsoft origin', () => {
  const environment = '00000000-0000-4000-8000-000000000001'
  assert.equal(plantConnectionManagerUrl(environment), `https://make.powerapps.com/environments/${environment}/connections`)
  for (const invalid of ['', '//evil.example', environment + '?redirect=https://evil.example']) assert.throws(() => plantConnectionManagerUrl(invalid))
})