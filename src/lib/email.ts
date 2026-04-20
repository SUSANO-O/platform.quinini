/**
 * Email service using Resend.
 * All functions are fire-and-forget safe — they return void and log errors.
 * If RESEND_API_KEY is not set, emails are logged to console (dev mode).
 */

import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

/**
 * Requiere dominio verificado en Resend cuando se usa EMAIL_FROM.
 * Fallback seguro: dominio de pruebas de Resend para evitar 403 por dominio no verificado.
 */
const FROM = process.env.EMAIL_FROM?.trim() || 'MatIAs <onboarding@resend.dev>';
// En servidor priorizamos APP_URL (no público) para enlaces de correo en producción.
const APP_URL =
  process.env.APP_URL?.trim() ||
  process.env.NEXT_PUBLIC_APP_URL?.trim() ||
  'http://localhost:3201';

/**
 * Base pública HTTPS para `<img src="…">` en HTML de correo.
 * Preferir NEXT_PUBLIC_APP_URL (p. ej. https://quinini.online) para que Gmail/Outlook carguen el logo.
 * Opcional: EMAIL_PUBLIC_ASSET_BASE solo para imágenes (si difiere del enlace de botones).
 */
const EMAIL_PUBLIC_ORIGIN = (
  process.env.EMAIL_PUBLIC_ASSET_BASE?.trim() ||
  process.env.NEXT_PUBLIC_APP_URL?.trim() ||
  process.env.APP_URL?.trim() ||
  'http://localhost:3201'
).replace(/\/$/, '');
const EMAIL_LOGO_URL = `${EMAIL_PUBLIC_ORIGIN}/t1.png`;

// ── Template helpers ──────────────────────────────────────────────────────────

function baseTemplate(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#0f172a;font-family:system-ui,-apple-system,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#1e293b;border-radius:16px;overflow:hidden;border:1px solid #334155;">
        <!-- Header -->
        <tr>
          <td style="padding:28px 32px;background:linear-gradient(135deg,#0d9488,#6366f1);">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td valign="middle" style="width:52px;padding-right:14px;">
                  <img src="${EMAIL_LOGO_URL}" width="40" height="40" alt="MatIAs" border="0" style="display:block;border-radius:10px;width:40px;height:40px;object-fit:cover;" />
                </td>
                <td valign="middle">
                  <span style="font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.5px;">MatIAs</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            ${bodyHtml}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:20px 32px;border-top:1px solid #334155;">
            <p style="margin:0;font-size:11px;color:#64748b;">
             MatIAs· <a href="${APP_URL}" style="color:#6366f1;text-decoration:none;">matias.online</a>
              · Este email fue enviado porque tienes una cuenta en MatIAs.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function btn(text: string, url: string, color = '#6366f1'): string {
  return `<a href="${url}" style="display:inline-block;margin-top:20px;padding:12px 28px;background:${color};color:#fff;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px;">${text}</a>`;
}

function h1(text: string): string {
  return `<h1 style="margin:0 0 12px;font-size:22px;font-weight:800;color:#f1f5f9;">${text}</h1>`;
}

function p(text: string): string {
  return `<p style="margin:0 0 10px;font-size:14px;color:#94a3b8;line-height:1.6;">${text}</p>`;
}

// ── Send helper ───────────────────────────────────────────────────────────────

export type EmailSendResult =
  | { ok: true }
  | { ok: false; code: 'no_api_key' | 'resend_error'; message: string };

async function send(to: string, subject: string, html: string): Promise<EmailSendResult> {
  if (!resend) {
    console.log('[Email] SIMULADO (terminal) — mismo shape que envío real; no se llama a Resend', {
      to,
      subject,
      id: '(simulado)',
      from: FROM,
      hint: 'Define RESEND_API_KEY en .env para enviar de verdad.',
    });
    return {
      ok: false,
      code: 'no_api_key',
      message: 'Falta RESEND_API_KEY en el servidor.',
    };
  }
  const MAX_ATTEMPTS = 3;
  let lastError = '';
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) await new Promise((r) => setTimeout(r, 1000 * (attempt - 1)));
    const { data, error } = await resend.emails.send({ from: FROM, to, subject, html });
    if (!error) {
      if (attempt > 1) console.log(`[Email] Enviado OK en intento ${attempt}`, { to, subject });
      else console.log('[Email] Enviado OK (Resend)', { to, subject, id: data?.id ?? '(sin id)', from: FROM });
      return { ok: true };
    }
    lastError =
      typeof error === 'object' && error && 'message' in error
        ? String((error as { message: unknown }).message)
        : String(error);
    console.error(`[Email] Send error (intento ${attempt}/${MAX_ATTEMPTS}):`, error);
  }
  return { ok: false, code: 'resend_error', message: lastError };
}

async function sendWithAttachments(
  to: string,
  subject: string,
  html: string,
  attachments: { filename: string; content: Buffer }[],
): Promise<EmailSendResult> {
  if (!resend) {
    console.log('[Email] SIMULADO (terminal, con adjuntos) — no se llama a Resend', {
      to,
      subject,
      id: '(simulado)',
      from: FROM,
      attachments: attachments.length,
      hint: 'Define RESEND_API_KEY en .env para enviar de verdad.',
    });
    return {
      ok: false,
      code: 'no_api_key',
      message: 'Falta RESEND_API_KEY en el servidor.',
    };
  }
  const { data, error } = await resend.emails.send({
    from: FROM,
    to,
    subject,
    html,
    attachments: attachments.map((a) => ({
      filename: a.filename,
      content: a.content,
    })),
  });
  if (error) {
    const message =
      typeof error === 'object' && error && 'message' in error
        ? String((error as { message: unknown }).message)
        : String(error);
    console.error('[Email] Send (attachments) error:', error);
    return { ok: false, code: 'resend_error', message };
  }
  console.log('[Email] Enviado OK (Resend, con adjuntos)', {
    to,
    subject,
    id: data?.id ?? '(sin id)',
    from: FROM,
    attachments: attachments.length,
  });
  return { ok: true };
}

function logSendFailure(context: string, r: EmailSendResult) {
  if (!r.ok) console.error(`[Email] ${context}:`, r.code, r.message);
}

/** Descarga el PDF público que Stripe genera para la factura (URL temporal). */
export async function fetchInvoicePdfBuffer(pdfUrl: string): Promise<Buffer | null> {
  try {
    const r = await fetch(pdfUrl, {
      headers: { Accept: 'application/pdf' },
      redirect: 'follow',
    });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    return buf.length > 0 ? buf : null;
  } catch {
    return null;
  }
}

export type PaidInvoiceEmailKind = 'first_payment' | 'plan_change' | 'renewal' | 'other';

/**
 * Correo tras un cobro de factura de suscripción (adjunta PDF si está disponible).
 */
export async function sendPaidInvoiceEmail(
  to: string,
  params: {
    kind: PaidInvoiceEmailKind;
    planLabel: string;
    amountFormatted: string;
    invoiceNumber: string | null;
    hostedInvoiceUrl: string | null;
    pdfBuffer: Buffer | null;
  },
): Promise<void> {
  const { kind, planLabel, amountFormatted, invoiceNumber, hostedInvoiceUrl, pdfBuffer } = params;

  let title: string;
  let lead: string;
  if (kind === 'first_payment') {
    title = 'Suscripción confirmada';
    lead = `Tu pago se ha registrado correctamente. Plan: <strong style="color:#f1f5f9;">${planLabel}</strong>. Importe: <strong style="color:#f1f5f9;">${amountFormatted}</strong>.`;
  } else if (kind === 'plan_change') {
    title = 'Cambio de plan — factura';
    lead = `Se ha aplicado el cambio de plan. Plan actual: <strong style="color:#f1f5f9;">${planLabel}</strong>. Importe de esta factura: <strong style="color:#f1f5f9;">${amountFormatted}</strong>.`;
  } else if (kind === 'renewal') {
    title = 'Renovación — factura';
    lead = `Se ha procesado la renovación de tu suscripción (${planLabel}). Importe: <strong style="color:#f1f5f9;">${amountFormatted}</strong>.`;
  } else {
    title = 'Factura de MatIAs';
    lead = `Nueva factura. Plan: ${planLabel}. Importe: ${amountFormatted}.`;
  }

  const invRef = invoiceNumber ? `N.º ${invoiceNumber}` : 'Factura';
  const bodyHtml = `
    ${h1(title)}
    ${p(lead)}
    ${p('Adjuntamos el PDF de la factura emitida por Stripe. También puedes verla en tu cuenta si lo necesitas.')}
    ${hostedInvoiceUrl ? p(`<a href="${hostedInvoiceUrl}" style="color:#6366f1;font-weight:600;">Ver factura en línea</a>`) : ''}
    ${btn('Ir al dashboard', `${APP_URL}/dashboard`, '#0d9488')}
  `;
  const html = baseTemplate(`${invRef} — MatIAs`, bodyHtml);

  if (pdfBuffer && pdfBuffer.length > 0) {
    const safeName = `factura-agentflow-${invoiceNumber || 'stripe'}.pdf`.replace(/[^a-zA-Z0-9._-]/g, '_');
    logSendFailure('invoice email', await sendWithAttachments(to, `${invRef} — MatIAs`, html, [{ filename: safeName, content: pdfBuffer }]));
  } else {
    logSendFailure('invoice email', await send(to, `${invRef} — MatIAs`, html));
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Registro (variant welcome): bienvenida + enlace de verificación.
 * Reenvío desde /verify-email (variant resend): mismo enlace, tono de recordatorio.
 */
export async function sendVerificationEmail(
  email: string,
  displayName: string,
  token: string,
  variant: 'welcome' | 'resend' = 'welcome',
): Promise<EmailSendResult> {
  const url = `${APP_URL}/verify-email?token=${encodeURIComponent(token)}`;
  const safeName = displayName.trim() || email.split('@')[0];

  if (variant === 'welcome') {
    const subject = 'Bienvenido a MatIAs — confirma tu correo';
    const html = baseTemplate(subject, `
      ${h1('Te damos la bienvenida')}
      ${p(`Hola <strong style="color:#f1f5f9;">${escapeHtml(safeName)}</strong>,`)}
      ${p('Gracias por crear tu cuenta en MatIAs. Estamos encantados de tenerte con nosotros.')}
      ${p(
        'Para confirmar que este correo es real y es tuyo, solo tienes que pulsar el botón de abajo. Así activamos tu cuenta por completo y podrás disfrutar del <strong style="color:#f1f5f9;">periodo de prueba</strong> y del resto de funciones sin trabas.',
      )}
      ${p('El enlace caduca en <strong style="color:#f1f5f9;">24 horas</strong>.')}
      ${btn('Confirmar mi correo', url, '#0d9488')}
      ${p('<br/><span style="font-size:13px;color:#64748b;">Si no has sido tú quien se ha registrado, puedes ignorar este mensaje con tranquilidad.</span>')}
    `);
    return await send(email, subject, html);
  }

  const subject = 'Tu enlace de verificación — MatIAs';
  const html = baseTemplate(subject, `
    ${h1('Confirma tu correo')}
    ${p(`Hola ${escapeHtml(safeName)},`)}
    ${p('Has solicitado un nuevo enlace para verificar tu dirección de email.')}
    ${p('Pulsa el botón para confirmar tu cuenta. El enlace caduca en 24 horas.')}
    ${btn('Confirmar mi correo', url, '#0d9488')}
    ${p('<br/><span style="font-size:13px;color:#64748b;">Si no has pedido este correo, ignora este mensaje.</span>')}
  `);
  return await send(email, subject, html);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function sendPasswordResetEmail(
  email: string,
  displayName: string,
  token: string,
): Promise<void> {
  const url = `${APP_URL}/reset-password?token=${token}`;
  const html = baseTemplate('Recupera tu contraseña — MatIAs', `
    ${h1('Recupera tu contraseña')}
    ${p(`Hola ${displayName}, recibimos una solicitud para restablecer la contraseña de tu cuenta.`)}
    ${p('Haz clic en el botón para crear una nueva contraseña. El enlace expira en 1 hora.')}
    ${btn('Restablecer contraseña', url, '#ef4444')}
    ${p('<br/>Si no solicitaste este cambio, ignora este mensaje. Tu contraseña no será modificada.')}
  `);
  logSendFailure('password reset', await send(email, 'Recupera tu contraseña — MatIAs', html));
}

/** Código de 6 dígitos para confirmar cambio de email (se envía al correo nuevo). */
export async function sendEmailChangeCodeEmail(
  newEmail: string,
  displayName: string,
  code: string,
): Promise<void> {
  const html = baseTemplate('Confirma tu nuevo email — MatIAs', `
    ${h1('Código de verificación')}
    ${p(`Hola ${displayName}, has solicitado usar esta dirección en tu cuenta MatIAs.`)}
    ${p('Introduce este código en Ajustes (válido 15 minutos):')}
    <p style="margin:20px 0;font-size:28px;font-weight:800;letter-spacing:0.3em;color:#0d9488;text-align:center;">${code}</p>
    ${p('Si no has sido tú, ignora este mensaje. Tu cuenta actual no cambia hasta que confirmes el código.')}
  `);
  logSendFailure('email change code', await send(newEmail, `Tu código MatIAs: ${code}`, html));
}

const PLAN_NAMES: Record<string, string> = {
  starter: 'Starter ($29/mes)',
  growth: 'Growth ($79/mes)',
  business: 'Business ($199/mes)',
  enterprise: 'Enterprise',
};

export async function sendSubscriptionEmail(
  userIdOrEmail: string,
  event: 'activated' | 'canceled' | 'payment_failed' | 'trial_ending',
  plan: string,
): Promise<void> {
  // userIdOrEmail can be either — resolve to email if it's a userId
  let to = userIdOrEmail;
  if (!userIdOrEmail.includes('@')) {
    try {
      const { connectDB } = await import('@/lib/db/connection');
      const { User } = await import('@/lib/db/models');
      await connectDB();
      const user = await User.findById(userIdOrEmail, { email: 1 }).lean() as { email?: string } | null;
      if (!user?.email) return;
      to = user.email;
    } catch { return; }
  }

  const planName = PLAN_NAMES[plan] || plan;
  const dashUrl = `${APP_URL}/dashboard`;

  let subject: string;
  let bodyHtml: string;

  if (event === 'activated') {
    subject = `¡Bienvenido al plan ${planName}! — MatIAs`;
    bodyHtml = `
      ${h1('¡Suscripción activada!')}
      ${p(`Tu plan <strong style="color:#f1f5f9;">${planName}</strong> ya está activo.`)}
      ${p('Ahora tienes acceso completo a todos los beneficios de tu plan. Comienza creando tus agentes y widgets.')}
      ${btn('Ir al dashboard', dashUrl, '#22c55e')}
    `;
  } else if (event === 'canceled') {
    subject = 'Tu suscripción ha sido cancelada — MatIAs';
    bodyHtml = `
      ${h1('Suscripción cancelada')}
      ${p(`Tu plan <strong style="color:#f1f5f9;">${planName}</strong> ha sido cancelado.`)}
      ${p('Tu acceso continuará hasta el final del período pagado. Puedes reactivar tu suscripción en cualquier momento.')}
      ${btn('Reactivar suscripción', dashUrl, '#6366f1')}
    `;
  } else if (event === 'payment_failed') {
    subject = 'Problema con tu pago — MatIAs';
    bodyHtml = `
      ${h1('Pago fallido')}
      ${p('No pudimos procesar el pago de tu suscripción.')}
      ${p('Por favor actualiza tu método de pago para mantener el acceso a MatIAs.')}
      ${btn('Actualizar método de pago', dashUrl, '#ef4444')}
    `;
  } else {
    subject = 'Tu trial vence en 3 días — MatIAs';
    bodyHtml = `
      ${h1('Tu prueba vence pronto')}
      ${p('Tu período de prueba gratuita deMatIAsvence en 3 días.')}
      ${p('Suscríbete ahora para mantener el acceso a tus agentes y widgets sin interrupciones.')}
      ${btn('Ver planes', dashUrl, '#f59e0b')}
    `;
  }

  logSendFailure('subscription email', await send(to, subject, baseTemplate(subject, bodyHtml)));
}

/** Alerta cuando el usuario supera el 80 % de su cuota mensual de conversaciones. */
export async function sendQuotaWarningEmail(
  to: string,
  displayName: string,
  used: number,
  limit: number,
  plan: string,
): Promise<void> {
  const safeName = displayName.trim() || to.split('@')[0];
  const percent = Math.round((used / limit) * 100);
  const planLabel = PLAN_NAMES[plan] || plan;
  const subject = `Has usado el ${percent} % de tus conversaciones este mes — MatIAs`;
  const html = baseTemplate(subject, `
    ${h1('Estás cerca del límite')}
    ${p(`Hola <strong style="color:#f1f5f9;">${escapeHtml(safeName)}</strong>,`)}
    ${p(`Has utilizado <strong style="color:#f87600;">${used.toLocaleString('es')} de ${limit.toLocaleString('es')} conversaciones</strong> de tu plan <strong style="color:#f1f5f9;">${planLabel}</strong> este mes.`)}
    ${p('Cuando llegues al 100 %, el widget dejará de responder hasta que empiece el próximo ciclo de facturación o mejores tu plan.')}
    ${btn('Mejorar plan ahora', `${APP_URL}/dashboard/settings`, '#e41414')}
    ${p('<br/><span style="font-size:13px;color:#64748b;">Si no quieres recibir estos avisos, puedes ignorarlos — solo son informativos.</span>')}
  `);
  logSendFailure('quota warning', await send(to, subject, html));
}
