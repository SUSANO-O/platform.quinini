import { When, Then } from '@cucumber/cucumber'
import assert from 'node:assert/strict'

When('consulto la página principal de la landing', async function () {
  await this.fetch('/')
})

When('consulto el status público de la plataforma', async function () {
  await this.fetch('/api/status')
})

Then('la landing debe responder correctamente', function () {
  const status = this.last?.res?.status
  assert.ok([200, 301, 302, 307, 308].includes(status), `HTTP ${status}`)
})

Then('el status debe reportar ok', function () {
  assert.equal(this.last?.res?.status, 200)
  const st = this.last?.json?.status
  assert.ok(st === 'operational' || st === 'degraded' || this.last?.json?.ok === true, `status=${st}`)
})

Then('el status debe incluir servicios', function () {
  assert.ok(Array.isArray(this.last?.json?.services), 'services debe ser array')
})
