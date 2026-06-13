#!/usr/bin/env node
/**
 * Diagnóstico: Cloudinary upload + Gemini Vision + respuesta del agente.
 *
 *   BASE_URL=https://botiva.space WIDGET_TOKEN=wt_xxx node scripts/probe-widget-vision.mjs
 */

const BASE = (process.env.BASE_URL || 'https://botiva.space').replace(/\/$/, '');
const TOKEN = process.env.WIDGET_TOKEN || 'wt_fc75ddb5253e192e0611a1d88257ab038c9edcb0e680ea62';
const AGENT_ID = process.env.AGENT_ID || '69d5084c78e0af3d5536fe95';
const WIDGET_ID = process.env.WIDGET_ID || '6a03a54c4f69fa7fa9027170';
const SESSION = `probe-vision-${Date.now()}`;

const RED_JPEG_B64 =
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAEAAGADASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=';
const dataUrl = `data:image/jpeg;base64,${RED_JPEG_B64}`;

const FAIL_RE =
  /limitaci[oó]n t[eé]cnica|no puedo visualizar|no logro visualizar|no me es posible visualizar|no tengo la capacidad t[eé]cnica|debido a una limitaci[oó]n|\[No se pudo analizar|VERTEX_GEMINI_API_KEY/i;

function log(title, obj) {
  console.log(`\n=== ${title} ===`);
  console.log(typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2));
}

async function readSSE(res) {
  const phases = [];
  const tokens = [];
  let done = null;
  let errEvt = null;
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  while (true) {
    const { value, done: streamDone } = await reader.read();
    if (streamDone) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const evt = JSON.parse(line.slice(6));
        if (evt.type === 'status') phases.push(`${evt.phase}${evt.message ? `: ${evt.message}` : ''}`);
        if (evt.type === 'token') tokens.push(evt.text || '');
        if (evt.type === 'done') done = evt;
        if (evt.type === 'error') errEvt = evt;
      } catch {
        /* ignore */
      }
    }
  }
  return { phases, tokens, done, errEvt };
}

async function chatJson(body, label) {
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/widget/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Widget-Token': TOKEN,
      Origin: 'https://botiva.space',
    },
    body: JSON.stringify({ agentId: AGENT_ID, widgetId: WIDGET_ID, token: TOKEN, ...body }),
  });
  const json = await res.json();
  const reply = json.reply || json.error || '';
  return { label, status: res.status, ms: Date.now() - t0, reply, json };
}

console.log(`Probe widget vision → ${BASE}`);
console.log(`Widget: ${WIDGET_ID} | Agent: ${AGENT_ID}`);
console.log(`Token: ${TOKEN.slice(0, 12)}...`);

// ── 1. Cloudinary upload ─────────────────────────────────────────────────────
const upRes = await fetch(`${BASE}/api/widget/upload-image`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Widget-Token': TOKEN, Origin: 'https://botiva.space' },
  body: JSON.stringify({ dataUrl, sessionId: SESSION, widgetId: WIDGET_ID, agentId: AGENT_ID, token: TOKEN }),
});
const upJson = await upRes.json();
log(`TEST 1 upload-image → HTTP ${upRes.status}`, upJson);

if (!upRes.ok || !upJson.url) {
  console.error('\n❌ Cloudinary NO configurado o token inválido.');
  process.exit(1);
}

const cloudUrl = upJson.url;
const imgGet = await fetch(cloudUrl, { signal: AbortSignal.timeout(15_000) });
log('GET URL Cloudinary', {
  status: imgGet.status,
  contentType: imgGet.headers.get('content-type'),
  urlPreview: `${cloudUrl.slice(0, 90)}...`,
});

// ── 2. Stream (esperado 503 si el agente tiene webhooks) ─────────────────────
const streamRes = await fetch(`${BASE}/api/widget/chat/stream`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Widget-Token': TOKEN, Origin: 'https://botiva.space' },
  body: JSON.stringify({
    agentId: AGENT_ID,
    widgetId: WIDGET_ID,
    sessionId: SESSION,
    message: '¿Qué color ves en la imagen?',
    token: TOKEN,
    userImages: [{ url: cloudUrl, mimeType: upJson.mimeType || 'image/jpeg', publicId: upJson.publicId }],
  }),
});
const stream = await readSSE(streamRes);
log(`TEST 2 chat/stream → HTTP ${streamRes.status}`, {
  phases: stream.phases,
  error: stream.errEvt,
  note: stream.errEvt?.code === 'STREAM_NOT_SUPPORTED'
    ? 'Normal: agente con webhooks → el widget usa /api/widget/chat (JSON)'
    : undefined,
});

// ── 3. Chat JSON con imagen (ruta real del widget con webhooks) ──────────────
const noImg = await chatJson({ sessionId: `${SESSION}-plain`, message: 'hola' }, 'sin imagen');
const withImg = await chatJson(
  {
    sessionId: SESSION,
    message: '¿Qué ves en esta imagen? Describe color y texto.',
    userImages: [{ url: cloudUrl, mimeType: upJson.mimeType || 'image/jpeg' }],
  },
  'con imagen',
);

log(`TEST 3a chat JSON sin imagen (${noImg.ms}ms)`, { reply: noImg.reply.slice(0, 200) });
log(`TEST 3b chat JSON con imagen (${withImg.ms}ms, +${withImg.ms - noImg.ms}ms)`, {
  reply: withImg.reply.slice(0, 500),
  visionLikelyCalled: withImg.ms - noImg.ms > 1500,
});

// ── 4. Control: body con contexto de visión (formato post-fix) ───────────────
const fakeEnriched = {
  message: 'Describe lo que ves en la captura.',
  sessionContextBlock: [
    '[ANÁLISIS DE IMAGEN DEL USUARIO — generado por el servidor, usar como descripción fiel]',
    '',
    '[Imagen adjunta]',
    'Contenido detectado (OCR/visión):',
    'Captura Vision: toggle ON, modelo Gemini 2.5 Flash, RAG+Vision y OCR activos.',
  ].join('\n'),
  systemPromptOverride: [
    'Eres un asesor comercial.',
    '',
    '[CAPACIDAD DE VISIÓN — PRIORIDAD ALTA]',
    'El usuario adjuntó imagen(es). NO digas que no puedes visualizar imágenes.',
    'Trata Contenido detectado como lo que hay en la imagen.',
  ].join('\n'),
  visionEnriched: true,
};

const ctrl = await chatJson({ sessionId: `${SESSION}-ctrl`, ...fakeEnriched }, 'contexto vision hub');
log(`TEST 4 control texto enriquecido (${ctrl.ms}ms)`, { reply: ctrl.reply.slice(0, 500) });

const ctrlUsesVision = /gemini|vision|ocr|rag/i.test(ctrl.reply) && !FAIL_RE.test(ctrl.reply);

// ── Resumen ───────────────────────────────────────────────────────────────────
console.log('\n=== RESUMEN DIAGNÓSTICO ===');
console.log(`1. Cloudinary upload:        ${upRes.ok ? '✅ OK' : '❌ FALLO'}`);
console.log(`2. URL Cloudinary accesible: ${imgGet.ok ? '✅ OK' : '❌ FALLO'}`);
console.log(
  `3. Gemini Vision (heurística): ${
    withImg.ms - noImg.ms > 1500 ? '✅ API llamada (+~' + (withImg.ms - noImg.ms) + 'ms)' : '⚠ no detectada / key ausente'
  }`,
);
console.log(
  `4. Agente usa análisis:       ${!FAIL_RE.test(withImg.reply) && withImg.reply.length > 30 ? '✅ SI' : '❌ NO — responde limitación técnica'}`,
);
console.log(
  `5. Control texto enriquecido:  ${ctrlUsesVision ? '✅ el agente SÍ lee Contenido detectado' : '❌ el agente IGNORA Contenido detectado (prompt/hub)'}`,
);

if (stream.errEvt?.code === 'STREAM_NOT_SUPPORTED') {
  console.log('\nℹ️  Stream devuelve 503 STREAM_NOT_SUPPORTED porque el agente tiene webhooks.');
  console.log('   El widget cae a POST /api/widget/chat — prueba 3b es la ruta real.');
}

if (FAIL_RE.test(withImg.reply)) {
  console.log('\n❌ El pipeline de imagen falla o el agente no usa el análisis.');
  if (!ctrlUsesVision) {
    console.log('   Causa probable: el modelo del hub ignora el bloque [IMAGEN DEL USUARIO] / Contenido detectado.');
  } else {
    console.log('   Causa probable: Gemini Vision en Vercel falla (revisar VERTEX_GEMINI_API_KEY y logs).');
  }
  process.exit(1);
}

console.log('\n✅ Pipeline completo operativo.');
