import { getWhatsAppAppSecret, verifyWebhookSignature, type WhatsAppAgentConfig } from '@/lib/whatsapp';

export type WhatsAppWebhookAuthResult =
  | { ok: true }
  | { ok: false; reason: 'no_phone_number_id' | 'no_agent_for_number' | 'no_app_secret' | 'bad_signature' };

/**
 * Autentica un cambio del webhook de WhatsApp antes de procesar NADA (estados de entrega,
 * respuestas del dueño, mensajes de clientes): exige el app secret del agente dueño del número y
 * una firma X-Hub-Signature-256 válida.
 *
 * Antes la firma solo se miraba si había app secret (ninguno de los 5 agentes lo tenía) y nunca en
 * la ruta de "respuesta del dueño": con el teléfono de soporte de un negocio (visible en el widget)
 * se podían meter mensajes que el visitante veía como escritos por el negocio.
 */
export async function authenticateWhatsAppChange(params: {
  phoneNumberId: string | undefined;
  rawBody: string;
  signatureHeader: string | null;
  findAgentConfig: (phoneNumberId: string) => Promise<WhatsAppAgentConfig | null | undefined>;
}): Promise<WhatsAppWebhookAuthResult> {
  const phoneNumberId = params.phoneNumberId?.trim();
  if (!phoneNumberId) return { ok: false, reason: 'no_phone_number_id' };
  const cfg = await params.findAgentConfig(phoneNumberId);
  if (!cfg) return { ok: false, reason: 'no_agent_for_number' };
  const appSecret = getWhatsAppAppSecret(cfg);
  if (!appSecret) return { ok: false, reason: 'no_app_secret' };
  if (!verifyWebhookSignature(appSecret, params.rawBody, params.signatureHeader)) {
    return { ok: false, reason: 'bad_signature' };
  }
  return { ok: true };
}
