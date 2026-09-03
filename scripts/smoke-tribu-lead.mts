/**
 * Lead real por el widget Navi del agente "landing tribu", contra producción.
 * Verifica que llegue al webhook `contactos` (evento lead_captured).
 * Solo lectura de config; no modifica nada. No imprime tokens ni URLs completas.
 *
 *   npx tsx --env-file=.env scripts/smoke-tribu-lead.mts
 */
import { createConnection, Types } from 'mongoose';

const HUB_ID = 'landing-tribu';
const WIDGET_ID = '6a51250b728e44a9e771e8d9';
const BASE = process.env.BASE_URL?.trim() || 'https://botiva.space';

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error('Falta MONGODB_URI');
const c = await createConnection(uri).asPromise();

const agent = await c.db!.collection('clientagents').findOne({ agentHubId: HUB_ID });
if (!agent) throw new Error('Agente landing-tribu no encontrado');

const widget = await c.db!.collection('widgets').findOne({ _id: new Types.ObjectId(WIDGET_ID) });
if (!widget) throw new Error('Widget Navi no encontrado');
const token = String(widget.afhubToken || widget.publicToken || '');
if (!token) throw new Error('Widget sin token');

/** URL del webhook `contactos`, solo para leer el bin al final. */
let hookUrl = '';
for (const t of (agent.tools ?? []) as Array<{ toolId?: string; config?: any }>) {
  if (String(t.toolId) !== 'webhook') continue;
  for (const w of (t.config?.webhooks ?? []) as Array<Record<string, any>>) {
    if (String(w.name) === 'contactos' && w.url) hookUrl = String(w.url);
  }
}

const stamp = Date.now();
const sessionId = `tribu_navi_smoke_${stamp}`;
const email = `tribu.navi.${stamp}@example.com`;
const mensaje =
  `Hola, me interesa. Me llamo Camila Ortiz, mi correo es ${email} ` +
  `y mi celular 3009998877. ¿Me contactan?`;

console.log(`\n→ enviando lead por el widget Navi (sesión ${sessionId.slice(-14)})…`);
const t0 = Date.now();
const res = await fetch(`${BASE}/api/widget/chat`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    agentId: String(agent._id),
    widgetId: WIDGET_ID,
    token,
    message: mensaje,
    sessionId,
  }),
  signal: AbortSignal.timeout(120_000),
});
const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
const toolsUsed = Array.isArray(json.toolsUsed) ? json.toolsUsed.map(String) : [];

console.log(
  JSON.stringify(
    {
      http: res.status,
      ms: Date.now() - t0,
      respondio: typeof json.reply === 'string' && json.reply.length > 10,
      toolsUsed,
      capturoLead: toolsUsed.some((t) => t.includes('lead:capture') || t.includes('wh:')),
      error: typeof json.error === 'string' ? json.error.slice(0, 200) : null,
    },
    null,
    2,
  ),
);

// ── ¿Qué registró la bitácora? ────────────────────────────────────────────────
await new Promise((r) => setTimeout(r, 3_000));
const entregas = await c.db!
  .collection('webhookdeliveries')
  .find({ agentId: HUB_ID, createdAt: { $gte: new Date(t0 - 5_000) } })
  .sort({ createdAt: -1 })
  .toArray();
console.log('\n── bitácora de entregas ──');
console.log(
  JSON.stringify(
    entregas.map((e) => ({
      evento: e.event,
      webhook: e.webhookName || null,
      host: e.urlHost,
      intento: e.attempt,
      ok: e.ok,
      status: e.status,
      ms: e.durationMs,
      leadTraia: e.payload?.lead
        ? Object.entries(e.payload.lead)
            .filter(([, v]) => typeof v === 'string' && String(v).trim())
            .map(([k]) => k)
        : null,
    })),
    null,
    2,
  ),
);

// ── ¿Llegó de verdad al bin? ──────────────────────────────────────────────────
if (hookUrl.includes('webhook.site')) {
  const uuid = hookUrl.split('/').pop();
  const r = await fetch(`https://webhook.site/token/${uuid}/requests?sorting=newest&per_page=3`);
  const data = (await r.json()) as { data?: Array<{ created_at: string; content: string }> };
  console.log('\n── recibido en el destino ──');
  for (const req of (data.data ?? []).slice(0, 2)) {
    try {
      const body = JSON.parse(req.content) as Record<string, any>;
      console.log(
        JSON.stringify(
          {
            at: req.created_at,
            event: body.event,
            deliveryId: body.deliveryId,
            agentId: body.agentId,
            leadEmail: body.lead?.email,
            leadName: body.lead?.name,
            leadPhone: body.lead?.phone,
          },
          null,
          2,
        ),
      );
    } catch {
      /* no-json */
    }
  }
}

await c.close();
