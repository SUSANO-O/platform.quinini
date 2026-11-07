import { describe, expect, it } from 'vitest';
import {
  SECURITY_PROBES,
  evaluateProbeResponse,
  summarizeProbeRun,
  type ProbeCase,
} from '@/lib/security/probe-cases';

const probe = (over: Partial<ProbeCase> = {}): ProbeCase => ({
  id: 't',
  description: 'd',
  target: 'landing',
  severity: 'critical',
  method: 'POST',
  path: '/x',
  expect: { status: [401], notStatus: [200] },
  rationale: 'r',
  ...over,
});

describe('evaluateProbeResponse', () => {
  it('pasa cuando el status está permitido', () => {
    expect(evaluateProbeResponse(probe(), 401, '').ok).toBe(true);
  });

  it('falla cuando llega un status prohibido (200 donde esperamos rechazo)', () => {
    const r = evaluateProbeResponse(probe(), 200, '{"reply":"hola"}');
    expect(r.ok).toBe(false);
    expect(r.reasons.join(' ')).toContain('200');
  });

  it('falla cuando el status no está en la lista esperada', () => {
    const r = evaluateProbeResponse(probe({ expect: { status: [401] } }), 500, '');
    expect(r.ok).toBe(false);
  });

  it('exige texto presente y ausente en el cuerpo', () => {
    const p = probe({ expect: { status: [401], bodyIncludes: ['INVALID'], bodyExcludes: ['reply'] } });
    expect(evaluateProbeResponse(p, 401, '{"code":"INVALID"}').ok).toBe(true);
    expect(evaluateProbeResponse(p, 401, '{"code":"OTRO"}').ok).toBe(false);
    expect(evaluateProbeResponse(p, 401, '{"code":"INVALID","reply":"x"}').ok).toBe(false);
  });

  it('bodyExcludes atrapa una respuesta real del agente donde esperábamos rechazo', () => {
    const p = probe({ expect: { notStatus: [200], bodyExcludes: ['"reply"'] } });
    expect(evaluateProbeResponse(p, 200, '{"reply":"respuesta del agente"}').ok).toBe(false);
  });
});

describe('summarizeProbeRun', () => {
  it('cuenta fallos y fallos críticos', () => {
    const results = [
      evaluateProbeResponse(probe({ severity: 'critical' }), 401, ''),
      evaluateProbeResponse(probe({ severity: 'critical' }), 200, ''),
      evaluateProbeResponse(probe({ severity: 'info', expect: { status: [200] } }), 500, ''),
    ];
    const s = summarizeProbeRun(results);
    expect(s).toEqual({ total: 3, passed: 1, failed: 2, failedCritical: 1 });
  });
});

describe('catálogo de sondas', () => {
  it('todas tienen id único, rationale y expectativa', () => {
    const ids = new Set<string>();
    for (const p of SECURITY_PROBES) {
      expect(ids.has(p.id), `id duplicado: ${p.id}`).toBe(false);
      ids.add(p.id);
      expect(p.rationale.length).toBeGreaterThan(0);
      expect(Boolean(p.expect.status || p.expect.notStatus)).toBe(true);
    }
  });

  it('cubre los huecos críticos cerrados el 2026-11-07', () => {
    const critical = SECURITY_PROBES.filter((p) => p.severity === 'critical').map((p) => p.id);
    for (const id of ['landing-chat-stream-no-token', 'hub-chat-no-token', 'backend-agents-no-key']) {
      expect(critical).toContain(id);
    }
  });

  it('ninguna sonda modifica datos (solo GET, o POST a rutas de validación)', () => {
    // Guardia: las sondas POST solo tocan rutas de chat/validación/métricas, nunca de borrado.
    const forbidden = /delete|remove|destroy|drop|purge/i;
    for (const p of SECURITY_PROBES) {
      expect(forbidden.test(p.path), `ruta sospechosa: ${p.path}`).toBe(false);
    }
  });
});
