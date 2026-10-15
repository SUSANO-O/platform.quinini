import { describe, expect, it } from 'vitest';
import { buildAgentAuditBody, groupConversations, redactPii } from '@/lib/agent-audit-input';
import { canUseAgentAudit } from '@/lib/plan-catalog';

describe('redactPii', () => {
  it('oculta emails y teléfonos (móvil CO, con prefijo y separadores)', () => {
    expect(redactPii('soy ana@correo.com y mi cel es 300 219 7252')).toBe('soy [email] y mi cel es [teléfono]');
    expect(redactPii('llámame al +57 (601) 555-1234')).toBe('llámame al [teléfono]');
    expect(redactPii('tengo 2 motos y 1 carro')).toBe('tengo 2 motos y 1 carro');
  });
});

describe('groupConversations', () => {
  const t = (m: number) => new Date(Date.UTC(2026, 9, 15, 12, m));
  it('agrupa por sesión en orden, excluye la sonda horaria y las sesiones sin mensajes del cliente', () => {
    const convs = groupConversations([
      { sessionId: 'b', role: 'assistant', content: 'Hola', createdAt: t(5) },
      { sessionId: 'a', role: 'assistant', content: 'Hola', createdAt: t(1) },
      { sessionId: 'a', role: 'user', content: 'mi correo: x@y.co', createdAt: t(2) },
      { sessionId: 'hourly_123', role: 'user', content: 'sonda', createdAt: t(3) },
      { sessionId: 'c', role: 'user', content: 'quiero un gps', createdAt: t(6) },
    ]);
    expect(convs.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(convs[0]).toMatchObject({ startedAt: t(1).toISOString(), messages: [{ role: 'assistant', content: 'Hola' }, { role: 'user', content: 'mi correo: [email]' }] });
    expect(convs[1].messages).toEqual([{ role: 'user', content: 'quiero un gps' }]);
  });

  it('se queda con las conversaciones más recientes', () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ sessionId: `s${i}`, role: 'user', content: `m${i}`, createdAt: t(i) }));
    expect(groupConversations(rows, 2).map((c) => c.messages[0].content)).toEqual(['m3', 'm4']);
  });
});

describe('buildAgentAuditBody', () => {
  it('mapea FAQ, reglas activas (interpretedRule), tools y documentos', () => {
    const body = buildAgentAuditBody(
      {
        name: 'Navi',
        systemPrompt: 'Eres Navi.',
        agentFaqs: [{ question: '¿Horario?', answer: '8 a 6' }, { question: 'sin respuesta' }],
        behaviorRules: [
          { title: 'Breve', interpretedRule: 'Responde corto', enabled: true },
          { title: 'Apagada', interpretedRule: 'x', enabled: false },
        ],
        enabledMcpToolIds: ['mcp:slack:slack_create_ticket'],
        ragSources: [{ name: 'Manual' }, { fileName: 'precios.pdf' }],
        updatedAt: new Date('2026-10-15T20:05:47Z'),
      },
      [],
    );
    expect(body.agent.faqs).toEqual([{ question: '¿Horario?', answer: '8 a 6' }]);
    expect(body.agent.rules).toEqual([{ title: 'Breve', description: 'Responde corto' }]);
    expect(body.agent.tools).toEqual(['mcp:slack:slack_create_ticket']);
    expect(body.agent.ragSources).toEqual(['Manual', 'precios.pdf']);
    expect(body.agent.configUpdatedAt).toBe('2026-10-15T20:05:47.000Z');
    expect(body.conversations).toEqual([]);
  });
});

describe('canUseAgentAudit', () => {
  it('Team+ con suscripción activa; override de admin', () => {
    expect(canUseAgentAudit('team', 'active')).toBe(true);
    expect(canUseAgentAudit('plus', 'active')).toBe(true);
    expect(canUseAgentAudit('solo', 'active')).toBe(false);
    expect(canUseAgentAudit('team', 'canceled')).toBe(false);
    expect(canUseAgentAudit('free', 'free', ['agent_audit'])).toBe(true);
  });
});
