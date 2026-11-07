import { createHmac } from 'crypto';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/whatsapp', async (orig) => ({
  ...(await orig<typeof import('@/lib/whatsapp')>()),
  // En los tests el "cifrado" es identidad: appSecretEnc = secreto en claro.
  getWhatsAppAppSecret: (cfg: { appSecretEnc?: string } | null | undefined) => cfg?.appSecretEnc ?? '',
}));

const { authenticateWhatsAppChange } = await import('@/lib/whatsapp-webhook-auth');
const { verifyWebhookSignature } = await import('@/lib/whatsapp');

const SECRET = 'app-secret-de-prueba';
const raw = JSON.stringify({ entry: [{ changes: [{ value: { metadata: { phone_number_id: '123' } } }] }] });
const sig = (body: string, secret = SECRET) => `sha256=${createHmac('sha256', secret).update(body, 'utf8').digest('hex')}`;

describe('verifyWebhookSignature', () => {
  it('sin app secret rechaza (antes aceptaba cualquier cosa)', () => {
    expect(verifyWebhookSignature('', raw, null)).toBe(false);
    expect(verifyWebhookSignature('', raw, sig(raw))).toBe(false);
  });
  it('con secreto: solo la firma correcta', () => {
    expect(verifyWebhookSignature(SECRET, raw, sig(raw))).toBe(true);
    expect(verifyWebhookSignature(SECRET, raw, sig(raw, 'otro'))).toBe(false);
    expect(verifyWebhookSignature(SECRET, raw, null)).toBe(false);
  });
});

describe('authenticateWhatsAppChange', () => {
  const find = (cfg: unknown) => vi.fn(async () => cfg as never);

  it('agente sin app secret: rechazado (los 5 agentes de hoy)', async () => {
    const r = await authenticateWhatsAppChange({ phoneNumberId: '123', rawBody: raw, signatureHeader: sig(raw), findAgentConfig: find({ phoneNumberId: '123' }) });
    expect(r).toEqual({ ok: false, reason: 'no_app_secret' });
  });

  it('firma falsificada: rechazado', async () => {
    const r = await authenticateWhatsAppChange({ phoneNumberId: '123', rawBody: raw, signatureHeader: sig(raw, 'adivinado'), findAgentConfig: find({ appSecretEnc: SECRET }) });
    expect(r).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('número sin agente o sin phone_number_id: rechazado', async () => {
    expect(await authenticateWhatsAppChange({ phoneNumberId: '999', rawBody: raw, signatureHeader: sig(raw), findAgentConfig: find(null) }))
      .toEqual({ ok: false, reason: 'no_agent_for_number' });
    expect(await authenticateWhatsAppChange({ phoneNumberId: undefined, rawBody: raw, signatureHeader: sig(raw), findAgentConfig: find({}) }))
      .toEqual({ ok: false, reason: 'no_phone_number_id' });
  });

  it('firma correcta con el secreto del agente: aceptado', async () => {
    const r = await authenticateWhatsAppChange({ phoneNumberId: '123', rawBody: raw, signatureHeader: sig(raw), findAgentConfig: find({ appSecretEnc: SECRET }) });
    expect(r).toEqual({ ok: true });
  });
});
