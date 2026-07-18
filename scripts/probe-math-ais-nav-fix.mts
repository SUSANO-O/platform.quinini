/**
 * Verifica fixes: MCP count + llevame a API (sin XML crudo).
 */
import mongoose from 'mongoose';
import { connectDB } from '../src/lib/db/connection.ts';
import { ClientAgent, User, Widget } from '../src/lib/db/models.ts';
import { createSessionToken } from '../src/lib/auth.ts';
import { finalizeAssistChatReply } from '../src/lib/assist-chat-reply.ts';

const BASE = 'http://127.0.0.1:3201';
const EMAIL = 'limarle211990@gmail.com';

async function chat(cookie: string, widget: { _id: unknown; afhubToken: string }, message: string, pagePath: string) {
  const res = await fetch(`${BASE}/api/widget/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: BASE },
    body: JSON.stringify({
      agentId: 'math-ais',
      widgetId: String(widget._id),
      token: widget.afhubToken,
      message,
      history: [],
      sessionId: `nav-fix-${Date.now()}`,
      pagePath,
    }),
  });
  return (await res.json()) as { reply?: string; navOffer?: { path?: string }; toolsUsed?: string[] };
}

async function main() {
  // Unit: XML strip
  const xmlRaw =
    'Entendido.\n<assist-nav path="/dashboard/api" onDecline="x" afterNavigate="y"/>';
  const nav = finalizeAssistChatReply(xmlRaw, true, { userMessage: 'llevame a API' });
  console.log('UNIT_XML_STRIP', !nav.reply.includes('<assist-nav'), nav.navOffer?.path);

  await connectDB();
  const user = await User.findOne({ email: EMAIL });
  const agent = await ClientAgent.findOne({ agentHubId: 'math-ais' });
  const widget = await Widget.findOne({ agentId: String(agent!._id), active: { $ne: false } });
  const cookie = `afhub_session=${createSessionToken(String(user!._id))}`;

  const mcp = await chat(
    cookie,
    widget!,
    'quiero que me digas cuantos de mis agentes tiene mcps',
    '/dashboard/inbox',
  );
  console.log('\nMCP_COUNT', (mcp.reply || '').slice(0, 400));
  console.log('has_mcp_number', /\d/.test(mcp.reply || ''));

  const api = await chat(cookie, widget!, 'llevame a API', '/dashboard/inbox');
  console.log('\nNAV_API reply', (api.reply || '').slice(0, 300));
  console.log('navOffer', api.navOffer?.path);
  console.log('no_xml', !(api.reply || '').includes('<assist-nav'));

  await mongoose.disconnect();
  const ok =
    !nav.reply.includes('<assist-nav') &&
    nav.navOffer?.path === '/dashboard/api' &&
    !(api.reply || '').includes('<assist-nav') &&
    (api.navOffer?.path === '/dashboard/api' || /api/i.test(api.reply || ''));
  console.log('\n', ok ? 'NAV_FIX_OK' : 'NAV_FIX_FAIL');
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
