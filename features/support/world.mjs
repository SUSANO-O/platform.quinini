import { setWorldConstructor, World } from '@cucumber/cucumber'

export class LandingWorld extends World {
  constructor(options) {
    super(options)
    this.baseUrl = (process.env.BASE_URL || 'http://localhost:3201').replace(/\/$/, '')
    this.last = null
    this.state = {}
  }

  async fetch(path, init = {}) {
    const res = await fetch(`${this.baseUrl}${path}`, { ...init, redirect: init.redirect ?? 'manual' })
    let json = {}
    const ct = res.headers.get('content-type') || ''
    if (ct.includes('application/json')) json = await res.json().catch(() => ({}))
    this.last = { res, json }
    return this.last
  }

  async postJson(path, body, headers = {}) {
    return this.fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    })
  }
}

setWorldConstructor(LandingWorld)
