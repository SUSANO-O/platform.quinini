/**
 * WhatsApp Business (Cloud API) — helpers de Fase 2.
 *
 * El cliente conecta SU propia cuenta (phoneNumberId + access token). Nosotros
 * solo: (1) verificamos su webhook, (2) recibimos sus mensajes entrantes y los
 * metemos al inbox, (3) enviamos las respuestas del agente vía Graph API.
 * Meta factura al cliente, no a Botiva (conversaciones de servicio = gratis).
 */
import crypto from 'crypto';
import { decryptSecret } from '@/lib/secret-crypto';

const GRAPH = 'https://graph.facebook.com';

export type WhatsAppAgentConfig = {
  enabled?: boolean;
  phoneNumberId?: string;
  wabaId?: string;
  displayPhone?: string;
  accessTokenEnc?: string;
  appSecretEnc?: string;
  verifyToken?: string;
  apiVersion?: string;
  status?: string;
};

/** URL pública del webhook que el cliente configura en Meta. */
export function getWhatsAppWebhookUrl(): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || '').replace(/\/$/, '');
  return base ? `${base}/api/whatsapp/webhook` : '/api/whatsapp/webhook';
}

/** Genera un verify token aleatorio (el cliente lo pega en la config de Meta). */
export function generateVerifyToken(): string {
  return 'wv_' + crypto.randomBytes(18).toString('hex');
}

/** Descifra el access token del agente (o '' si no hay). */
export function getWhatsAppAccessToken(cfg: WhatsAppAgentConfig | null | undefined): string {
  if (!cfg || !cfg.accessTokenEnc) return '';
  return decryptSecret(cfg.accessTokenEnc);
}

/** Descifra el app secret del agente (o '' si no hay). */
export function getWhatsAppAppSecret(cfg: WhatsAppAgentConfig | null | undefined): string {
  if (!cfg || !cfg.appSecretEnc) return '';
  return decryptSecret(cfg.appSecretEnc);
}

/**
 * Verifica la firma X-Hub-Signature-256 del webhook con el app secret.
 * Si no hay app secret configurado, devuelve true (Meta lo permite, pero
 * recomendamos configurarlo).
 */
export function verifyWebhookSignature(
  appSecret: string,
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  if (!appSecret) return true; // sin secret: no podemos verificar, aceptamos
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;
  const expected = crypto.createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');
  const given = signatureHeader.slice('sha256='.length);
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given));
  } catch {
    return false;
  }
}

/**
 * Envía un mensaje de texto al usuario por WhatsApp Cloud API.
 * Devuelve { ok, id?, error? }.
 */
export async function sendWhatsAppText(
  cfg: WhatsAppAgentConfig,
  toPhone: string,
  text: string,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const token = getWhatsAppAccessToken(cfg);
  const phoneNumberId = (cfg.phoneNumberId || '').trim();
  const version = (cfg.apiVersion || 'v21.0').trim();
  if (!token || !phoneNumberId) return { ok: false, error: 'WhatsApp no configurado.' };
  if (!toPhone || !text) return { ok: false, error: 'Faltan destinatario o texto.' };

  try {
    const res = await fetch(`${GRAPH}/${version}/${encodeURIComponent(phoneNumberId)}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: toPhone,
        type: 'text',
        text: { preview_url: false, body: text.slice(0, 4096) },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error?.message || `HTTP ${res.status}`;
      return { ok: false, error: msg };
    }
    const id = data?.messages?.[0]?.id;
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error de red' };
  }
}
