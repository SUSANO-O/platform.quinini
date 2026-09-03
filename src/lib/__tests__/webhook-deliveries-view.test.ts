import { describe, expect, it } from 'vitest';
import {
  agentIdsForOwner,
  buildSummary,
  explicarResultado,
  leadFieldsOf,
  toDeliveryItem,
  type DeliveryRow,
} from '@/lib/webhook-deliveries-view';

const row = (over: Partial<DeliveryRow> = {}): DeliveryRow => ({
  _id: 'd1',
  agentId: 'asesor-de-ventas',
  event: 'lead_captured',
  webhookName: 'webhook2',
  urlHost: 'webhook.site',
  attempt: 1,
  ok: true,
  status: 200,
  durationMs: 90,
  createdAt: new Date('2026-09-03T16:00:00.000Z'),
  ...over,
});

describe('explicarResultado — el dueño tiene que saber qué hacer', () => {
  it('el 429 que costó los leads se explica sin jerga', () => {
    expect(explicarResultado(row({ ok: false, status: 429 }))).toBe(
      'El destino rechazó por límite de peticiones (429)',
    );
  });

  it('distingue credenciales de ruta inexistente', () => {
    expect(explicarResultado(row({ ok: false, status: 401 }))).toContain('credenciales');
    expect(explicarResultado(row({ ok: false, status: 403 }))).toContain('credenciales');
    expect(explicarResultado(row({ ok: false, status: 404 }))).toContain('no existe');
  });

  it('los 5xx son culpa del destino, no del cliente', () => {
    expect(explicarResultado(row({ ok: false, status: 503 }))).toBe('El destino falló (503)');
  });

  it('status 0 = ni hubo respuesta, e incluye el motivo si se conoce', () => {
    expect(explicarResultado(row({ ok: false, status: 0, error: 'ECONNRESET' }))).toBe(
      'Sin respuesta del destino — ECONNRESET',
    );
  });

  it('explica los bloqueos de seguridad en lugar de mostrar un código', () => {
    expect(explicarResultado(row({ ok: false, status: 0, statusText: 'ssrf_blocked' }))).toContain(
      'Destino no permitido',
    );
    expect(
      explicarResultado(row({ ok: false, status: 0, statusText: 'ssrf_blocked_redirect' })),
    ).toContain('Destino no permitido');
  });

  it('explica los problemas de redirección', () => {
    expect(
      explicarResultado(row({ ok: false, status: 0, statusText: 'redirect_without_location' })),
    ).toContain('redirección');
  });

  it('el caso feliz también se dice claro', () => {
    expect(explicarResultado(row())).toBe('Entregado (200)');
  });
});

describe('leadFieldsOf — nombres de campo, nunca valores', () => {
  it('lista solo los campos con contenido', () => {
    const campos = leadFieldsOf({
      lead: { name: 'Ana', email: 'ana@test.com', phone: '', company: '   ' },
    });
    expect(campos).toEqual(['name', 'email']);
  });

  it('NO expone los valores — esto se muestra en pantalla', () => {
    const campos = leadFieldsOf({ lead: { email: 'secreto@privado.com' } });
    expect(JSON.stringify(campos)).not.toContain('secreto@privado.com');
  });

  it('detecta el caso real: lead sin nombre', () => {
    expect(leadFieldsOf({ lead: { name: '', email: 'a@b.com', phone: '300' } })).toEqual([
      'email',
      'phone',
    ]);
  });

  it('tolera payload ausente o malformado', () => {
    expect(leadFieldsOf(null)).toEqual([]);
    expect(leadFieldsOf({})).toEqual([]);
    expect(leadFieldsOf({ lead: 'no-es-objeto' })).toEqual([]);
  });
});

describe('toDeliveryItem', () => {
  it('mapea la fila a algo mostrable', () => {
    expect(toDeliveryItem(row({ payload: { lead: { email: 'a@b.com' } } }))).toMatchObject({
      id: 'd1',
      agentId: 'asesor-de-ventas',
      event: 'lead_captured',
      webhookName: 'webhook2',
      host: 'webhook.site',
      attempt: 1,
      ok: true,
      status: 200,
      detalle: 'Entregado (200)',
      leadFields: ['email'],
    });
  });

  it('nunca filtra el payload crudo al cliente', () => {
    const item = toDeliveryItem(row({ payload: { lead: { email: 'privado@x.com' } } }));
    expect(JSON.stringify(item)).not.toContain('privado@x.com');
  });

  it('sobrevive a una fila incompleta', () => {
    const item = toDeliveryItem({});
    expect(item.attempt).toBe(1);
    expect(item.createdAt).toBeNull();
    expect(item.leadFields).toEqual([]);
  });
});

describe('buildSummary — la respuesta a "¿están llegando mis leads?"', () => {
  it('sin datos no inventa una tasa', () => {
    expect(buildSummary([])).toEqual({
      total: 0,
      ok: 0,
      fallidas: 0,
      tasaExito: null,
      principalMotivoFallo: null,
    });
  });

  it('todo OK: 100% y sin motivo de fallo', () => {
    const s = buildSummary([row(), row(), row()]);
    expect(s).toMatchObject({ total: 3, ok: 3, fallidas: 0, tasaExito: 100, principalMotivoFallo: null });
  });

  it('todo fallando: 0% y señala el motivo — el escenario que vivimos', () => {
    const s = buildSummary([
      row({ ok: false, status: 429 }),
      row({ ok: false, status: 429 }),
      row({ ok: false, status: 429 }),
    ]);
    expect(s).toMatchObject({ total: 3, ok: 0, fallidas: 3, tasaExito: 0 });
    expect(s.principalMotivoFallo).toContain('429');
  });

  it('con motivos mezclados elige el más frecuente', () => {
    const s = buildSummary([
      row({ ok: false, status: 429 }),
      row({ ok: false, status: 429 }),
      row({ ok: false, status: 500 }),
      row(),
    ]);
    expect(s.principalMotivoFallo).toContain('429');
    expect(s.tasaExito).toBe(25);
  });

  it('redondea la tasa a un decimal', () => {
    expect(buildSummary([row(), row(), row({ ok: false, status: 500 })]).tasaExito).toBe(66.7);
  });
});

describe('agentIdsForOwner — la propiedad NO se resuelve por tenantId', () => {
  it('incluye el _id de Mongo y el agentHubId: la bitácora usa uno u otro', () => {
    const ids = agentIdsForOwner([
      { _id: '6a3441c15688b5b1509fad7d', agentHubId: 'landing-tribu' },
      { _id: '6a80f6a6543cb99549025dd2', agentHubId: 'asesor-de-ventas' },
    ]);
    // Casos reales observados en producción: Tribu quedó registrado con el _id,
    // Ventas con el hub id. Filtrar por uno solo perdería la mitad.
    expect(ids).toContain('6a3441c15688b5b1509fad7d');
    expect(ids).toContain('landing-tribu');
    expect(ids).toContain('asesor-de-ventas');
    expect(ids).toHaveLength(4);
  });

  it('deduplica', () => {
    expect(agentIdsForOwner([{ _id: 'a', agentHubId: 'a' }])).toEqual(['a']);
  });

  it('tolera agentes sin hub id', () => {
    expect(agentIdsForOwner([{ _id: 'x' }, { _id: 'y', agentHubId: '  ' }])).toEqual(['x', 'y']);
  });

  it('sin agentes devuelve lista vacía — y el endpoint debe responder vacío, no todo', () => {
    expect(agentIdsForOwner([])).toEqual([]);
  });

  it('documenta el bug: el tenantId de la bitácora es "default", no el userId', () => {
    // Las 11 filas de producción tenían tenantId="default" (el tenant de
    // AIBackHub), así que `{ tenantId: userId }` no habría devuelto nada.
    const filaReal = { tenantId: 'default', agentId: 'landing-tribu' };
    const userIdReal = '6a34213314907484d7733575';
    expect(filaReal.tenantId).not.toBe(userIdReal);
    expect(agentIdsForOwner([{ _id: 'otro', agentHubId: 'landing-tribu' }])).toContain(
      filaReal.agentId,
    );
  });
});
