import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { widgetFindOne, msgFindOne } = vi.hoisted(() => ({ widgetFindOne: vi.fn(), msgFindOne: vi.fn() }));
vi.mock('@/lib/db/connection', () => ({ connectDB: async () => undefined }));
vi.mock('@/lib/db/models', () => ({
  Widget: { findOne: widgetFindOne },
  WidgetMessage: { findOne: msgFindOne, find: vi.fn(), updateMany: vi.fn() },
  ConversationSession: { findOne: vi.fn() },
}));

import { GET } from '@/app/api/widget/messages/route';

const chain = (v: unknown) => ({ sort: () => ({ select: () => ({ lean: async () => v }) }) });
const req = (qs: string) => new NextRequest(`http://x/api/widget/messages?${qs}`);
const SINCE = encodeURIComponent('2026-10-02T10:00:00.000Z');

beforeEach(() => {
  widgetFindOne.mockReset().mockReturnValue({ select: () => ({ lean: async () => ({ _id: 'w1', active: true }) }) });
  msgFindOne.mockReset();
});

describe('GET /api/widget/messages?reply=1 — recuperar la respuesta tras cambiar de página', () => {
  it('devuelve la última respuesta del bot de ESA sesión y widget, sin el bloque de navegación', async () => {
    msgFindOne.mockReturnValue(chain({
      content: 'Están en Vigilancia → Geocercas.\n```assist-nav\n{"path":"/views/geocercas.php","afterNavigate":"Ya estás."}\n```',
      createdAt: new Date('2026-10-02T10:00:05Z'),
    }));
    const res = await GET(req(`token=wt_x&sessionId=sess_1&reply=1&since=${SINCE}`));
    const d = await res.json();
    expect(msgFindOne).toHaveBeenCalledWith(expect.objectContaining({
      widgetId: 'w1', sessionId: 'sess_1', role: 'assistant', sentBy: 'ai',
    }));
    expect(d.reply.text).toBe('Están en Vigilancia → Geocercas.');
    expect(d.reply.navOffer.path).toBe('/views/geocercas.php');
  });

  it('aún no hay respuesta → reply null', async () => {
    msgFindOne.mockReturnValue(chain(null));
    expect(await (await GET(req(`token=wt_x&sessionId=s&reply=1&since=${SINCE}`))).json()).toEqual({ reply: null });
  });

  it('token inválido → 401; since inválido → 400', async () => {
    widgetFindOne.mockReturnValue({ select: () => ({ lean: async () => null }) });
    expect((await GET(req(`token=mal&sessionId=s&reply=1&since=${SINCE}`))).status).toBe(401);
    widgetFindOne.mockReturnValue({ select: () => ({ lean: async () => ({ _id: 'w1' }) }) });
    expect((await GET(req('token=wt_x&sessionId=s&reply=1&since=ayer'))).status).toBe(400);
  });
});
