import { describe, expect, it } from 'vitest';
import { decideNotice, GRACE_NOTICE_DAYS } from '@/lib/subscription-suspension';
import { GRACE_PERIOD_DAYS } from '@/lib/subscription';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-09-10T13:00:00Z').getTime();
/** Vencimiento que cae exactamente `d` días antes de NOW. */
const expiredDaysAgo = (d: number) => Math.floor((NOW - d * DAY_MS) / 1000);

describe('decideNotice', () => {
  it('el día del vencimiento avisa cortesía con los días restantes', () => {
    const r = decideNotice({ expiredAtSec: expiredDaysAgo(0), nowMs: NOW, alreadyMarks: [] });
    expect(r?.kind).toBe('grace');
    expect(r?.dayIntoGrace).toBe(0);
    expect(r?.daysLeft).toBe(GRACE_PERIOD_DAYS);
  });

  it('el último día de cortesía avisa que queda 1 día', () => {
    const r = decideNotice({ expiredAtSec: expiredDaysAgo(6), nowMs: NOW, alreadyMarks: [] });
    expect(r?.kind).toBe('grace');
    expect(r?.dayIntoGrace).toBe(6);
    expect(r?.daysLeft).toBe(1);
  });

  it('pasada la cortesía avisa suspensión', () => {
    const r = decideNotice({ expiredAtSec: expiredDaysAgo(8), nowMs: NOW, alreadyMarks: [] });
    expect(r?.kind).toBe('suspended');
  });

  it('no repite un aviso ya enviado', () => {
    const expiredAtSec = expiredDaysAgo(3);
    const first = decideNotice({ expiredAtSec, nowMs: NOW, alreadyMarks: [] });
    expect(first?.kind).toBe('grace');
    const again = decideNotice({ expiredAtSec, nowMs: NOW, alreadyMarks: [first!.mark] });
    expect(again).toBeNull();
  });

  it('no repite la suspensión ya avisada', () => {
    const expiredAtSec = expiredDaysAgo(30);
    const first = decideNotice({ expiredAtSec, nowMs: NOW, alreadyMarks: [] });
    const again = decideNotice({ expiredAtSec, nowMs: NOW, alreadyMarks: [first!.mark] });
    expect(first?.kind).toBe('suspended');
    expect(again).toBeNull();
  });

  // Resiliencia: si el cron no corrió el día 0 (o el sistema se estrenó con el
  // cliente ya en cortesía), igual tiene que recibir un aviso — no esperar al
  // día 3. Caso real: TRIBUGPS venció 1 día antes de desplegar esto.
  it('si nunca se avisó en este ciclo, avisa aunque no sea un día programado', () => {
    const dia1 = 1;
    expect(GRACE_NOTICE_DAYS).not.toContain(dia1);
    const r = decideNotice({ expiredAtSec: expiredDaysAgo(dia1), nowMs: NOW, alreadyMarks: [] });
    expect(r?.kind).toBe('grace');
    expect(r?.dayIntoGrace).toBe(dia1);
    expect(r?.daysLeft).toBe(GRACE_PERIOD_DAYS - dia1);
  });

  it('un día no programado NO avisa si ya hubo aviso en el mismo ciclo', () => {
    const expiredAtSec = expiredDaysAgo(1);
    const iso = new Date(expiredAtSec * 1000).toISOString().slice(0, 10);
    const r = decideNotice({ expiredAtSec, nowMs: NOW, alreadyMarks: [`grace:0:${iso}`] });
    expect(r).toBeNull();
  });

  it('un ciclo nuevo vuelve a avisar aunque el anterior ya se haya notificado', () => {
    const cicloViejo = `suspended:${new Date(expiredDaysAgo(400) * 1000).toISOString().slice(0, 10)}`;
    const r = decideNotice({ expiredAtSec: expiredDaysAgo(2), nowMs: NOW, alreadyMarks: [cicloViejo] });
    expect(r?.kind).toBe('grace');
  });

  it('sin fecha de vencimiento no hay aviso', () => {
    expect(decideNotice({ expiredAtSec: 0, nowMs: NOW, alreadyMarks: [] })).toBeNull();
  });
});
