import { Given, When, Then } from '@cucumber/cucumber'
import assert from 'node:assert/strict'
import { findTestWidget } from '../support/widget-fixture.mjs'

function fold(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

async function sendTurn(world, session, message) {
  const fixture = world.state.widgetFixture
  await world.postJson(
    '/api/widget/chat',
    {
      agentId: fixture.agentId,
      widgetId: fixture.widgetId,
      token: fixture.token,
      sessionId: session.sessionId,
      visitorId: session.visitorId,
      message,
      history: session.history,
    },
    { 'X-Widget-Token': fixture.token },
  )
  const reply = String(world.last?.json?.reply ?? '')
  session.history.push({ role: 'user', content: message })
  if (reply) session.history.push({ role: 'model', content: reply })
  world.state.lastReply = reply
  return reply
}

Given('que tengo un widget de prueba de {string} configurado', async function (keyword) {
  this.state.widgetFixture = await findTestWidget(keyword)
})

When('en una sesión nueva le digo {string}', async function (message) {
  this.state.session = { sessionId: newId('sess'), visitorId: newId('vis'), history: [] }
  await sendTurn(this, this.state.session, message)
})

When('en la misma sesión le pregunto {string}', async function (message) {
  assert.ok(this.state.session, 'no hay sesión activa — falta el paso "en una sesión nueva le digo..."')
  await sendTurn(this, this.state.session, message)
})

Given('que un visitante ya le contó que se llama {string} y que su carro es {string}', async function (name, color) {
  const session = { sessionId: newId('sess'), visitorId: newId('vis'), history: [] }
  await sendTurn(
    this,
    session,
    `Hola, me llamo ${name} y mi carro es de color ${color}.`,
  )
  this.state.priorVisitorFacts = { name, color }
})

When('un visitante distinto, en una sesión nueva, pregunta {string}', async function (message) {
  const session = { sessionId: newId('sess'), visitorId: newId('vis'), history: [] }
  await sendTurn(this, session, message)
})

Then('la respuesta debe mencionar {string}', function (needle) {
  const reply = fold(this.state.lastReply)
  assert.ok(
    reply.includes(fold(needle)),
    `la respuesta no menciona "${needle}". Respuesta: ${this.state.lastReply}`,
  )
})

Then('la respuesta NO debe mencionar {string}', function (needle) {
  const reply = fold(this.state.lastReply)
  assert.ok(
    !reply.includes(fold(needle)),
    `la respuesta filtró "${needle}" a un visitante distinto. Respuesta: ${this.state.lastReply}`,
  )
})
