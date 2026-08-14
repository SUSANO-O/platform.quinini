/**
 * Comprueba que la ruta de streaming recuerda una imagen entre turnos.
 *
 * Turno 1 envia una imagen con un texto conocido. Turno 2 pregunta por ella sin
 * adjuntar nada: solo puede responder si el analisis quedo guardado en la sesion.
 *
 * Uso: node --env-file=.env scripts/probe-stream-vision.mjs <agentId> <token> <sessionId>
 */
import http from 'node:http';
import sharp from 'sharp';

const [agentId, token, sessionId] = process.argv.slice(2);
if (!agentId || !token || !sessionId) {
  console.error('Uso: <agentId> <token> <sessionId>');
  process.exit(2);
}

const LANDING = process.env.LANDING_URL || 'http://127.0.0.1:3201';

/**
 * La imagen lleva dos datos. El turno 1 pregunta solo por el primero, asi que el
 * segundo no llega a la memoria conversacional y sirve de testigo: si el turno 2
 * lo acierta, solo puede venir del analisis de imagen guardado en la sesion.
 */
const DATO_PREGUNTADO = '7734';
const DATO_TESTIGO = '91,50';

const svg = `<svg width="700" height="320" xmlns="http://www.w3.org/2000/svg">
  <rect width="700" height="320" fill="white"/>
  <text x="40" y="130" font-family="Helvetica, Arial, sans-serif" font-size="58" fill="black">FACTURA ${DATO_PREGUNTADO}</text>
  <text x="40" y="230" font-family="Helvetica, Arial, sans-serif" font-size="58" fill="black">TOTAL ${DATO_TESTIGO} EUR</text>
</svg>`;
const png = await sharp(Buffer.from(svg)).png().toBuffer();

const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': png.length });
  res.end(png);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const imageUrl = `http://127.0.0.1:${server.address().port}/factura.png`;
console.log(
  `imagen servida en ${imageUrl} (FACTURA ${DATO_PREGUNTADO} / TOTAL ${DATO_TESTIGO} EUR)\n`,
);

/** Lee el SSE y devuelve la respuesta final del evento done. */
async function chat(message, userImages) {
  const res = await fetch(`${LANDING}/api/widget/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Widget-Token': token,
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({
      agentId,
      message,
      history: [],
      sessionId,
      token,
      ...(userImages ? { userImages } : {}),
    }),
  });

  const texto = await res.text();
  let reply = '';
  let error = '';
  for (const linea of texto.split('\n')) {
    if (!linea.startsWith('data:')) continue;
    try {
      const evt = JSON.parse(linea.slice(5).trim());
      if (evt.type === 'done' && typeof evt.reply === 'string') reply = evt.reply;
      if (evt.type === 'error') error = evt.message || 'error';
    } catch {
      /* eventos parciales */
    }
  }
  return { reply, error, status: res.status };
}

const idxPregunta = process.argv.indexOf('--pregunta');
const pregunta =
  idxPregunta !== -1
    ? process.argv[idxPregunta + 1]
    : 'Cual era el total que aparecia en la imagen? Responde solo la cifra.';

/** Regresion: un turno normal sin imagen no debe verse afectado. */
if (process.argv.includes('--sin-imagen')) {
  console.log(`### TURNO SIN IMAGEN (regresion): "${pregunta}"`);
  const solo = await chat(pregunta);
  console.log(`  HTTP ${solo.status}${solo.error ? ` error=${solo.error}` : ''}`);
  console.log(`  ${solo.reply.replace(/\s+/g, ' ').slice(0, 120)}`);
  server.close();
  process.exit(0);
}

console.log('### TURNO 1 — con imagen, preguntando solo por el numero de factura');
const t1 = await chat(
  `Que numero de factura ves en esta imagen? Responde solo el numero, nada mas.`,
  [{ url: imageUrl }],
);
console.log(`  HTTP ${t1.status}${t1.error ? ` error=${t1.error}` : ''}`);
console.log(`  ${t1.reply.replace(/\s+/g, ' ').slice(0, 220)}\n`);

await new Promise((r) => setTimeout(r, 4000));

console.log(`### TURNO 2 — sin adjuntar nada: "${pregunta}"`);
const t2 = await chat(pregunta);
console.log(`  HTTP ${t2.status}${t2.error ? ` error=${t2.error}` : ''}`);
console.log(`  ${t2.reply.replace(/\s+/g, ' ').slice(0, 220)}\n`);

const testigoFiltrado = t1.reply.includes(DATO_TESTIGO) || t1.reply.includes('91.50');
const acierta = t2.reply.includes(DATO_TESTIGO) || t2.reply.includes('91.50');

if (testigoFiltrado) {
  console.log(
    'RESULTADO: no concluyente — el turno 1 ya menciono el total, asi que podria venir de la memoria conversacional',
  );
} else {
  console.log(
    acierta
      ? 'RESULTADO: recuerda la imagen (el total nunca se dijo en texto, solo estaba en la imagen)'
      : 'RESULTADO: NO recuerda la imagen',
  );
}

server.close();
