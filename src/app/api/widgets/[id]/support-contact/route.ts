/**
 * POST /api/widgets/[id]/support-contact
 *
 * Contacto con soporte de BotIvA desde un widget SUSPENDIDO por falta de pago.
 *
 * Por qué existe: cuando a un cliente se le agota la cortesía, su widget deja
 * de atender. El formulario de ticket normal (`/api/widgets/[id]/ticket`) no
 * sirve en ese escenario porque va al Slack del propio cliente moroso — el
 * visitante quedaría escribiéndole al que justamente no puede responderle.
 * Este endpoint manda el mensaje a soporte de BotIvA.
 *
 * No exige suscripción activa, por definición: se usa cuando NO la hay.
 *
 * Body: { name?, email?, message?, token? }
 * Header opcional: X-Widget-Token (wt_*)
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { Widget, User, Subscription } from '@/lib/db/models';
import { getCorsHeaders, handlePreflight, withCors } from '@/lib/cors';
import { sendEmail } from '@/lib/email';

const SUPPORT_TO =
  process.env.SUPPORT_EMAIL?.trim() ||
  process.env.BILLING_ISSUER_EMAIL?.trim() ||
  '';

export async function OPTIONS(req: NextRequest) {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(req) });
}

function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    email?: string;
    message?: string;
    token?: string;
  };

  const headerToken = req.headers.get('x-widget-token')?.trim() || '';
  const token = (body.token || headerToken).trim();

  await connectDB();

  const widget = (await Widget.findById(id)
    .select({ userId: 1, name: 1, afhubToken: 1 })
    .lean()) as { userId?: string; name?: string; afhubToken?: string } | null;

  if (!widget) {
    return withCors(req, NextResponse.json({ error: 'Widget no encontrado.' }, { status: 404 }));
  }
  if (widget.afhubToken && token && widget.afhubToken !== token) {
    return withCors(req, NextResponse.json({ error: 'Token inválido.' }, { status: 401 }));
  }

  const message = String(body.message || '').trim().slice(0, 2000);
  if (!message) {
    return withCors(req, NextResponse.json({ error: 'Contanos qué necesitás.' }, { status: 400 }));
  }

  // Contexto del dueño para que soporte no tenga que investigar quién es.
  let ownerEmail = '';
  let ownerName = '';
  let plan = '';
  let expiredAt = '';
  if (widget.userId) {
    try {
      const [owner, sub] = await Promise.all([
        User.findById(String(widget.userId)).select('email displayName').lean() as Promise<{ email?: string; displayName?: string } | null>,
        Subscription.findOne({ userId: String(widget.userId) }).select('plan currentPeriodEnd').lean() as Promise<{ plan?: string; currentPeriodEnd?: number } | null>,
      ]);
      ownerEmail = owner?.email || '';
      ownerName = owner?.displayName || '';
      plan = sub?.plan || '';
      expiredAt = sub?.currentPeriodEnd ? new Date(sub.currentPeriodEnd * 1000).toISOString() : '';
    } catch { /* non-critical */ }
  }

  if (!SUPPORT_TO) {
    console.error('[support-contact] SUPPORT_EMAIL/BILLING_ISSUER_EMAIL sin configurar — mensaje perdido:', {
      widgetId: id, ownerEmail, message: message.slice(0, 120),
    });
    return withCors(req, NextResponse.json({ error: 'Soporte no disponible en este momento.' }, { status: 503 }));
  }

  const subject = `Widget suspendido — contacto desde ${widget.name || id}`;
  const html = `
    <h2>Contacto desde un widget suspendido</h2>
    <p><strong>Mensaje del visitante:</strong></p>
    <blockquote>${esc(message)}</blockquote>
    <hr>
    <p><strong>Contacto que dejó:</strong> ${esc(body.name) || '(sin nombre)'} — ${esc(body.email) || '(sin email)'}</p>
    <p><strong>Widget:</strong> ${esc(widget.name || '')} (<code>${esc(id)}</code>)</p>
    <p><strong>Cuenta:</strong> ${esc(ownerName)} &lt;${esc(ownerEmail)}&gt;</p>
    <p><strong>Plan:</strong> ${esc(plan)} — venció: ${esc(expiredAt) || 'sin fecha'}</p>
  `;

  const sent = await sendEmail({ to: SUPPORT_TO, subject, html });
  if (!sent.ok) {
    console.error('[support-contact] no se pudo enviar:', sent);
    return withCors(req, NextResponse.json({ error: 'No pudimos enviar tu mensaje. Intentá más tarde.' }, { status: 502 }));
  }

  return withCors(req, NextResponse.json({ ok: true }));
}
