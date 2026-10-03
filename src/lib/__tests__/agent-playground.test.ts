import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { exists, serve } = vi.hoisted(() => ({ exists: vi.fn(), serve: vi.fn() }));
vi.mock('@/lib/db/connection', () => ({ connectDB: async () => undefined }));
vi.mock('@/lib/auth', () => ({ verifySessionToken: (t: string) => (t === 'ok' ? 'u_owner_123456' : null) }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimitAsync: async () => ({ success: true }) }));
vi.mock('@/lib/db/models', () => ({ ClientAgent: { exists } }));
vi.mock('@/lib/widget-chat-direct-mcp', () => ({ tryServeWidgetChatViaHubMcp: serve }));

import { POST } from '@/app/api/agents/[id]/playground/route';
import { sanitizePlaygroundIdentity } from '@/lib/agent-playground';

const ID = 'a'.repeat(24);
const ctx = { params: Promise.resolve({ id: ID }) };
const req = (body: unknown, cookie = 'ok') =>
  new NextRequest(`http://x/api/agents/${ID}/playground`, {
    method: 'POST',
    headers: { cookie: `afhub_session=${cookie}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  exists.mockReset().mockResolvedValue({ _id: ID });
  serve.mockReset().mockResolvedValue({ reply: 'Hola, soy Navi.', toolsUsed: ['mcp:mysql:mysql_query'] });
});

describe('POST /api/agents/[id]/playground', () => {
  it('sin sesión → 401; agente ajeno → 404 sin llamar al hub', async () => {
    expect((await POST(req({ message: 'hola' }, 'mala'), ctx)).status).toBe(401);
    exists.mockResolvedValue(null);
    expect((await POST(req({ message: 'hola' }), ctx)).status).toBe(404);
    expect(exists).toHaveBeenCalledWith({ _id: ID, userId: 'u_owner_123456' });
    expect(serve).not.toHaveBeenCalled();
  });

  it('responde con el texto y las herramientas usadas, restringido al dueño', async () => {
    const res = await POST(req({ message: '¿dónde está mi carro?', history: [{ role: 'user', content: 'hola' }] }), ctx);
    const d = await res.json();
    expect(d.reply).toBe('Hola, soy Navi.');
    expect(d.toolsUsed).toEqual(['mcp:mysql:mysql_query']);
    const call = serve.mock.calls[0][0];
    expect(call.ownerUserId).toBe('u_owner_123456');
    expect(JSON.parse(call.rawBody)).toMatchObject({ agentId: ID, message: '¿dónde está mi carro?' });
    expect(call.verifiedIdentity).toBeUndefined();
  });

  it('"probar como" un cliente: pasa solo claims válidos', async () => {
    await POST(req({ message: 'hola', identity: { cliente: ' 1013 ', 'mal clave': 'x', admin: 5 } }), ctx);
    expect(serve.mock.calls[0][0].verifiedIdentity).toEqual({ cliente: '1013' });
    expect(sanitizePlaygroundIdentity({})).toBeUndefined();
  });

  it('el hub no responde → 502 con mensaje útil', async () => {
    serve.mockResolvedValue(null);
    const res = await POST(req({ message: 'hola' }), ctx);
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/activo y sincronizado/);
  });

  it('mensaje vacío → 400', async () => {
    expect((await POST(req({ message: '  ' }), ctx)).status).toBe(400);
  });
});

describe('toolLabel', () => {
  it('nombres legibles para las herramientas usadas', async () => {
    const { toolLabel } = await import('@/components/dashboard/agent-playground');
    expect(toolLabel('mcp:mysql:mysql_query')).toBe('MySQL · consulta');
    expect(toolLabel('mcp:gmail:send_email')).toBe('Gmail · send email');
    expect(toolLabel('std:web_search')).toBe('web search');
  });
});
