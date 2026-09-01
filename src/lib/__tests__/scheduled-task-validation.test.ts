import { describe, expect, it } from 'vitest';
import { describeActionFlow, sanitizeAction } from '@/lib/scheduled-task-validation';

describe('sanitizeAction flow', () => {
  it('acepta webhook → email', () => {
    const r = sanitizeAction({
      type: 'webhook',
      config: { url: 'https://example.com/hook', method: 'POST' },
      then: [
        {
          type: 'email',
          config: {
            to: 'a@b.com',
            subject: 'Resultado',
            body: 'Salida:\n{{prev.output}}',
          },
        },
      ],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.then).toHaveLength(1);
    expect(r.value.then?.[0].type).toBe('email');
    expect(describeActionFlow(r.value)).toBe('Webhook → Email');
  });

  it('rechaza agent_run en then', () => {
    const r = sanitizeAction({
      type: 'webhook',
      config: { url: 'https://example.com/hook' },
      then: [{ type: 'agent_run', config: { prompt: 'x' } }],
    });
    expect(r.ok).toBe(false);
  });

  it('compat: sin then sigue igual', () => {
    const r = sanitizeAction({
      type: 'email',
      config: { to: 'a@b.com', subject: 'Hola', body: 'Mundo' },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.then).toBeUndefined();
  });

  it('then vacío limpia la cadena', () => {
    const r = sanitizeAction({
      type: 'webhook',
      config: { url: 'https://x.test/hook' },
      then: [],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.then).toEqual([]);
  });
});

describe('sanitizeAction calendar_reminder', () => {
  it('acepta con thresholds explícitos, los ordena descendente y dedupea', () => {
    const r = sanitizeAction({
      type: 'calendar_reminder',
      config: { to: 'a@b.com', thresholdsMinutes: [5, 30, 5, 0, 15] },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.config).toEqual({ to: 'a@b.com', calendarId: 'primary', thresholdsMinutes: [30, 15, 5, 0] });
    expect(describeActionFlow(r.value)).toBe('Recordatorio Calendario');
  });

  it('sin thresholds usa el default 30/15/5/0', () => {
    const r = sanitizeAction({ type: 'calendar_reminder', config: { to: 'a@b.com' } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.config.thresholdsMinutes).toEqual([30, 15, 5, 0]);
  });

  it('rechaza email inválido', () => {
    const r = sanitizeAction({ type: 'calendar_reminder', config: { to: 'no-es-email' } });
    expect(r.ok).toBe(false);
  });

  it('respeta calendarId custom', () => {
    const r = sanitizeAction({
      type: 'calendar_reminder',
      config: { to: 'a@b.com', calendarId: 'trabajo@group.calendar.google.com' },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.config.calendarId).toBe('trabajo@group.calendar.google.com');
  });

  it('rechaza calendar_reminder en then (solo como acción principal)', () => {
    const r = sanitizeAction({
      type: 'webhook',
      config: { url: 'https://x.test/hook' },
      then: [{ type: 'calendar_reminder', config: { to: 'a@b.com' } }],
    });
    expect(r.ok).toBe(false);
  });
});
