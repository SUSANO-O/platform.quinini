#!/usr/bin/env node
/**
 * Prueba directa de AIBackHub POST /api/models (sin pasar por landing ni AgentFlowhub).
 *
 *   node --env-file=.env scripts/test-aibackhub-model.mjs
 *   BACKEND_URL=http://127.0.0.1:9003 MODEL=gemini-3.1-pro-preview node --env-file=.env scripts/test-aibackhub-model.mjs
 *
 * Variables:
 *   BACKEND_URL / AUTH_BACKEND_URL — base AIBackHub (default http://127.0.0.1:9003)
 *   MODEL — ID API sin prefijo vx/ (default gemini-3.1-pro-preview)
 *   PROVIDER — default vertex
 *   PROMPT — mensaje de prueba
 */
import { loadWidgetTestEnv, getAibackhubUrl, aibackhubHeaders } from './lib/load-env.mjs';

loadWidgetTestEnv();

const base = getAibackhubUrl();
const model = process.env.MODEL || 'gemini-3.1-pro-preview';
const provider = process.env.PROVIDER || 'vertex';
const prompt = process.env.PROMPT || 'Di hola en una frase corta como consultor de ventas de autos.';

console.log(`POST ${base}/api/models`);
console.log(`  provider=${provider} model=${model}\n`);

const res = await fetch(`${base}/api/models`, {
  method: 'POST',
  headers: aibackhubHeaders(process.env.AGENT_HUB_ID || 'ventas'),
  body: JSON.stringify({
    prompt,
    systemPrompt: process.env.SYSTEM_PROMPT || 'Eres un consultor de ventas de autos.',
    provider,
    model,
    taskType: 'chat',
  }),
  signal: AbortSignal.timeout(Number(process.env.TIMEOUT_MS || 120_000)),
});

const json = await res.json().catch(() => ({}));
console.log('Status:', res.status);
console.log(JSON.stringify(json, null, 2));

const reply =
  json?.data?.reply ||
  json?.data?.text ||
  json?.reply ||
  json?.text ||
  json?.error ||
  '';

if (res.ok && typeof reply === 'string' && reply.length > 5) {
  console.log('\n✅ OK —', reply.slice(0, 200));
  process.exit(0);
}

console.log('\n❌ FAIL');
process.exit(1);
