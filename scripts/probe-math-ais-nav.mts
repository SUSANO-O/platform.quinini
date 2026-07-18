/**
 * Prueba navOffer Math-ais en chat local.
 *   npx tsx --env-file=.env scripts/probe-math-ais-nav.mts
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
    message: 'guíame a suscripción y cuenta',
    history: [],
    sessionId: `probe-nav-${Date.now()}`,
    pagePath: '/dashboard',
  };

  const res = await fetch(`${BASE}/api/widget/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: BASE },
    body: JSON.stringify(body),
  });
  const j = (await res.json()) as { reply?: string; navOffer?: { path?: string }; error?: string };
  console.log('CHAT', res.status);
  console.log('navOffer.path', j.navOffer?.path || '(none)');
  console.log('reply_tail', (j.reply || j.error || '').slice(-180));

  await mongoose.disconnect();
  const ok = res.ok && j.navOffer?.path?.includes('/dashboard/settings');
  console.log(ok ? 'NAV_PROBE_OK' : 'NAV_PROBE_FAIL');
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
