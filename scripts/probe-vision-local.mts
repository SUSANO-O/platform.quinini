/**
 * Prueba local: upload + Gemini Vision + chat Math-ais con imagen.
 *   npx tsx --env-file=.env scripts/probe-vision-local.mts [email]
 */
import mongoose from 'mongoose';
import { readFileSync } from 'fs';
import { connectDB } from '../src/lib/db/connection.ts';
import { ClientAgent, User, Widget } from '../src/lib/db/models.ts';
import { createSessionToken } from '../src/lib/auth.ts';
import { analyzeSupportScreenshot } from '../src/lib/widget-image-vision.ts';

const BASE = (process.env.LOCAL_PROBE_URL || 'http://127.0.0.1:3201').replace(/\/$/, '');
const EMAIL = (process.argv[2] || 'limarle211990@gmail.com').trim().toLowerCase();

const RED_JPEG_B64 =
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAEAAGADASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=';
const dataUrl = `data:image/jpeg;base64,${RED_JPEG_B64}`;

async function main() {
  console.log('\n=== 1. Claves Gemini (visión) ===');
  const vKey = process.env.VERTEX_GEMINI_API_KEY?.trim();
  const gKey = process.env.GEMINI_API_KEY?.trim();
  console.log('VERTEX_GEMINI_API_KEY:', vKey ? `present (${vKey.slice(0, 8)}…)` : 'missing');
  console.log('GEMINI_API_KEY:', gKey ? `present (${gKey.slice(0, 8)}…)` : 'missing');

  console.log('\n=== 2. Gemini Vision directo (data URL) ===');
  const visionDirect = await analyzeSupportScreenshot(dataUrl);
  console.log('result:', visionDirect.slice(0, 300));
  const visionFail =
    /\[No se pudo analizar|\[Imagen adjunta — configura VERTEX|VERTEX_GEMINI_API_KEY|\[Formato de imagen no válido\]/.test(
      visionDirect,
    );
  console.log(visionFail ? '❌ Vision FAIL' : '✅ Vision OK');

  await connectDB();
  const user = await User.findOne({ email: EMAIL }).select('_id email');
  if (!user) {
    console.error('NO_USER', EMAIL);
    process.exit(1);
  }
  const token = createSessionToken(String(user._id));
  const cookie = `afhub_session=${token}`;

  const agent = await ClientAgent.findOne({ agentHubId: 'math-ais' });
  const widget = agent
    ? await Widget.findOne({ agentId: String(agent._id), active: { $ne: false } })
    : null;
  if (!widget?.afhubToken) {
    console.error('NO_MATH_AIS_WIDGET');
    process.exit(1);
  }

  const wt = widget.afhubToken.trim();
  const widgetId = String(widget._id);
  const agentId = 'math-ais';
  const sessionId = `probe-vision-local-${Date.now()}`;

  console.log('\n=== 3. Upload Cloudinary ===');
  const upRes = await fetch(`${BASE}/api/widget/upload-image`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Widget-Token': wt,
      Origin: BASE,
    },
    body: JSON.stringify({
      dataUrl,
      sessionId,
      widgetId,
      agentId,
      token: wt,
    }),
  });
  const upJson = (await upRes.json()) as { url?: string; error?: string; mimeType?: string };
  console.log('HTTP', upRes.status, upJson.error || upJson.url?.slice(0, 80));
  if (!upRes.ok || !upJson.url) {
    console.error('❌ Upload failed');
    process.exit(1);
  }

  console.log('\n=== 4. Vision desde URL Cloudinary ===');
  const visionUrl = await analyzeSupportScreenshot(upJson.url);
  console.log('result:', visionUrl.slice(0, 300));
  const urlFail = /\[No se pudo analizar|\[Imagen adjunta — configura/.test(visionUrl);
  console.log(urlFail ? '❌ Vision URL FAIL' : '✅ Vision URL OK');

  console.log('\n=== 5. Chat Math-ais con imagen (stream) ===');
  const chatRes = await fetch(`${BASE}/api/widget/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Widget-Token': wt,
      Origin: BASE,
      Cookie: cookie,
    },
    body: JSON.stringify({
      agentId,
      widgetId,
      token: wt,
      sessionId,
      message: 'que pasa aca?',
      pagePath: '/dashboard',
      userImages: [{ url: upJson.url, mimeType: upJson.mimeType || 'image/jpeg' }],
    }),
  });

  let reply = '';
  let errMsg = '';
  if (chatRes.body) {
    const reader = chatRes.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      for (const block of buf.split('\n\n')) {
        if (!block.startsWith('data:')) continue;
        try {
          const evt = JSON.parse(block.slice(5).trim()) as {
            type?: string;
            text?: string;
            reply?: string;
            message?: string;
          };
          if (evt.type === 'token') reply += evt.text || '';
          if (evt.type === 'done') reply = evt.reply || reply;
          if (evt.type === 'error') errMsg = evt.message || '';
        } catch {
          /* ignore */
        }
      }
      buf = buf.split('\n\n').pop() || '';
    }
  }
  console.log('HTTP', chatRes.status);
  if (errMsg) console.log('error:', errMsg);
  console.log('reply:', reply.slice(0, 500));
  const badReply =
    /no se pudo analizar|describe.*brevemente|qué te refieres|qué sección|no puedo ver/i.test(reply);
  console.log(badReply ? '❌ Chat ignoró / falló visión' : '✅ Chat usó contexto visual');

  await mongoose.disconnect();
  const ok = !visionFail && !urlFail && upRes.ok && !badReply && reply.length > 20;
  console.log(ok ? '\nPROBE_VISION_OK' : '\nPROBE_VISION_FAIL');
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
