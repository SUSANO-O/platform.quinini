/**
 * Prueba navOffer en SSE stream Math-ais.
 *   npx tsx --env-file=.env scripts/probe-math-ais-stream-nav.mts
 */
import mongoose from 'mongoose';
import { connectDB } from '../src/lib/db/connection.ts';
import { ClientAgent, User, Widget } from '../src/lib/db/models.ts';
import { createSessionToken } from '../src/lib/auth.ts';

const BASE = (process.env.LOCAL_PROBE_URL || 'http://127.0.0.1:3201').replace(/\/$/, '');

async function main() {
  await connectDB();
  const user = await User.findOne({ email: 'limarle211990@gmail.com' });
  if (!user) throw new Error('NO_USER');
  const cookie = `afhub_session=${createSessionToken(String(user._id))}`;
  const agent = await ClientAgent.findOne({ agentHubId: 'math-ais' });
  const widget = await Widget.findOne({ agentId: String(agent!._id), active: { $ne: false } });
  if (!widget?.afhubToken) throw new Error('NO_WIDGET');

  const body = {
    agentId: 'math-ais',
    widgetId: String(widget._id),
    token: widget.afhubToken,
    message: 'co mom contruyo un agente ?',
    history: [],
    sessionId: `probe-stream-${Date.now()}`,
    pagePath: '/dashboard',
  };

  const res = await fetch(`${BASE}/api/widget/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie,
      Origin: BASE,
      'X-Widget-Token': widget.afhubToken,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let done: { navOffer?: { path?: string }; reply?: string } | null = null;
  for (const chunk of text.split('\n\n')) {
    const line = chunk.trim();
    if (!line.startsWith('data:')) continue;
    try {
      const j = JSON.parse(line.slice(5).trim()) as { type?: string; navOffer?: { path?: string }; reply?: string };
      if (j.type === 'done') done = j;
    } catch {
      /* skip */
    }
  }

  console.log('STREAM', res.status);
  console.log('navOffer.path', done?.navOffer?.path || '(none)');
  console.log('reply_has_question', /¿Quieres que te lleve/i.test(done?.reply || ''));
  console.log('reply_tail', (done?.reply || '').slice(-120));

  await mongoose.disconnect();
  const ok = res.ok && Boolean(done?.navOffer?.path);
  console.log(ok ? 'STREAM_NAV_OK' : 'STREAM_NAV_FAIL');
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
