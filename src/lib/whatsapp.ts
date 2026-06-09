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

/** Normaliza un número de teléfono a solo dígitos (sin + ni espacios). */
export function normalizePhoneDigits(phone: string): string {
  return phone.replace(/[^\d]/g, '');
}

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
  /** Plantilla Meta aprobada para alertas de handoff (override de HANDOFF_WA_TEMPLATE_NAME). */
  handoffTemplateName?: string;
  handoffTemplateLang?: string;
};

function resolveHandoffTemplateName(cfg: WhatsAppAgentConfig): string {
  const enabled = process.env.HANDOFF_WA_TEMPLATE_ENABLED === '1'
    || process.env.HANDOFF_WA_TEMPLATE_ENABLED === 'true';
  if (!enabled) return '';
  const fromAgent = typeof cfg.handoffTemplateName === 'string' ? cfg.handoffTemplateName.trim() : '';
  if (fromAgent) return fromAgent;
  return (process.env.HANDOFF_WA_TEMPLATE_NAME || '').trim();
}

function resolveHandoffTemplateLang(cfg: WhatsAppAgentConfig): string {
  const fromAgent = typeof cfg.handoffTemplateLang === 'string' ? cfg.handoffTemplateLang.trim() : '';
  if (fromAgent) return fromAgent;
  return (process.env.HANDOFF_WA_TEMPLATE_LANG || 'es').trim() || 'es';
}

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

/** Motivo legible si faltan credenciales o el token no descifra (p. ej. SECRET_ENCRYPTION_KEY distinta en local). */
export function resolveWhatsAppSendConfigError(cfg: WhatsAppAgentConfig | null | undefined): string | null {
  if (!cfg) return 'WhatsApp: agente sin configuración.';
  const phoneNumberId = (cfg.phoneNumberId || '').trim();
  if (!phoneNumberId) return 'WhatsApp: falta phoneNumberId en el agente.';
  if (!cfg.accessTokenEnc) return 'WhatsApp: el agente no tiene access token guardado.';
  if (!getWhatsAppAccessToken(cfg)) {
    if (process.env.SECRET_ENCRYPTION_KEY?.trim()) {
      return 'WhatsApp: no se pudo descifrar el token (SECRET_ENCRYPTION_KEY incorrecta).';
    }
    return 'WhatsApp: no se pudo descifrar el token (copia SECRET_ENCRYPTION_KEY de producción a tu .env local).';
  }
  return null;
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
  const configError = resolveWhatsAppSendConfigError(cfg);
  if (configError) return { ok: false, error: configError };
  const token = getWhatsAppAccessToken(cfg)!;
  const phoneNumberId = (cfg.phoneNumberId || '').trim();
  const version = (cfg.apiVersion || 'v21.0').trim();
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

/** Plantilla Meta (utility) — funciona sin ventana de 24 h. */
export async function sendWhatsAppTemplate(
  cfg: WhatsAppAgentConfig,
  toPhone: string,
  templateName: string,
  lang: string,
  bodyParams: string[],
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const configError = resolveWhatsAppSendConfigError(cfg);
  if (configError) return { ok: false, error: configError };
  const token = getWhatsAppAccessToken(cfg)!;
  const phoneNumberId = (cfg.phoneNumberId || '').trim();
  const version = (cfg.apiVersion || 'v21.0').trim();
  if (!toPhone || !templateName) return { ok: false, error: 'Faltan destinatario o plantilla.' };

  const components =
    bodyParams.length > 0
      ? [{
          type: 'body',
          parameters: bodyParams.map((text) => ({ type: 'text', text: text.slice(0, 1024) })),
        }]
      : undefined;

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
        type: 'template',
        template: {
          name: templateName,
          language: { code: lang },
          ...(components ? { components } : {}),
        },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error?.message || `HTTP ${res.status}`;
      return { ok: false, error: msg };
    }
    return { ok: true, id: data?.messages?.[0]?.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error de red' };
  }
}

export type HandoffNotificationResult = {
  ok: boolean;
  messageId?: string;
  error?: string;
  method?: 'template' | 'text';
  notifyPhone?: string;
  /** true si el dueño escribió al Business en las últimas 24 h (texto libre entregable). */
  serviceWindowOpen?: boolean;
};

/**
 * Envía alerta de handoff al número del widget (WhatsApp humano).
 * Por defecto solo texto libre. Plantillas desactivadas salvo HANDOFF_WA_TEMPLATE_ENABLED=1.
 */
export async function sendHandoffNotification(params: {
  waConfig: WhatsAppAgentConfig;
  ownerPhone: string;
  visitorName?: string;
  userMessage?: string;
  widgetName?: string;
  sessionId: string;
  ownerWaLastInboundAt?: Date | null;
}): Promise<HandoffNotificationResult> {
  const visitorLabel = params.visitorName?.trim() || 'Visitante anónimo';
  const msgPreview = params.userMessage?.trim().slice(0, 120) || 'Sin mensaje adicional';
  const widgetLabel = params.widgetName?.trim() || 'widget';
  const toPhone = normalizePhoneDigits(params.ownerPhone);
  const serviceWindowOpen = params.ownerWaLastInboundAt
    ? Date.now() - params.ownerWaLastInboundAt.getTime() < 24 * 60 * 60 * 1000
    : false;

  console.log('[AFHUB-DEBUG] sendHandoffNotification:', {
    toPhone,
    widgetLabel,
    visitorLabel,
    serviceWindowOpen,
    templateEnabled: Boolean(resolveHandoffTemplateName(params.waConfig)),
    phoneNumberId: params.waConfig.phoneNumberId || null,
  });

  const templateName = resolveHandoffTemplateName(params.waConfig);
  if (templateName) {
    const templateResult = await sendWhatsAppTemplate(
      params.waConfig,
      toPhone,
      templateName,
      resolveHandoffTemplateLang(params.waConfig),
      [widgetLabel, visitorLabel, msgPreview],
    );
    if (templateResult.ok) {
      return {
        ok: true,
        messageId: templateResult.id,
        method: 'template',
        notifyPhone: toPhone,
        serviceWindowOpen,
      };
    }
    console.warn('[handoff] template send failed, trying free text:', templateResult.error);
  }

  // Meta no permite texto libre business→usuario sin ventana 24 h (error "Re-engagement message").
  // No intentamos enviar: evita ok:true falso. Inbox + Slack siguen funcionando siempre.
  if (!serviceWindowOpen) {
    return {
      ok: false,
      error:
        'Ventana WhatsApp cerrada: Meta no permite alertas en texto libre sin que el operador haya escrito al Business en 24 h. Usa Inbox/Slack (siempre activos) o activa una plantilla Meta aprobada (HANDOFF_WA_TEMPLATE_ENABLED=1).',
      method: 'text',
      notifyPhone: toPhone,
      serviceWindowOpen: false,
    };
  }

  const body = [
    `🔔 *Nueva solicitud de atención humana*`,
    `👤 ${visitorLabel} — ${widgetLabel}`,
    ...(msgPreview !== 'Sin mensaje adicional' ? [`💬 "${msgPreview}"`] : []),
    ``,
    `↩️ *Responde ESTE mensaje* (usa Reply/Responder en WhatsApp) para contestar al visitante en tiempo real.`,
  ].join('\n');

  const result = await sendWhatsAppText(params.waConfig, toPhone, body);
  if (!result.ok) {
    return {
      ok: false,
      error: result.error,
      method: 'text',
      notifyPhone: toPhone,
      serviceWindowOpen,
    };
  }
  return {
    ok: true,
    messageId: result.id,
    method: 'text',
    notifyPhone: toPhone,
    serviceWindowOpen,
  };
}
