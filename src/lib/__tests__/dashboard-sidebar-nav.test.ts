import { describe, it, expect } from 'vitest';
import { isActive, buildDashboardNavGroups } from '@/components/dashboard/dashboard-sidebar';

const todo = { showApiLink: true, showFlowsLink: true, hideQuickStart: false };
const hrefs = (groups: ReturnType<typeof buildDashboardNavGroups>) =>
  groups.flatMap((g) => g.items.map((i) => i.href));

describe('isActive', () => {
  it('el inicio solo se enciende en el inicio', () => {
    expect(isActive('/dashboard', '/dashboard')).toBe(true);
    expect(isActive('/dashboard/agents', '/dashboard')).toBe(false);
  });

  it('una sección se enciende en sus subrutas', () => {
    expect(isActive('/dashboard/agents', '/dashboard/agents')).toBe(true);
    expect(isActive('/dashboard/agents/123', '/dashboard/agents')).toBe(true);
    expect(isActive('/dashboard/agents/123/edit', '/dashboard/agents')).toBe(true);
  });

  it('no se enciende en otra sección', () => {
    expect(isActive('/dashboard/widgets', '/dashboard/agents')).toBe(false);
  });

  // El fallo que tenía: `startsWith` puro casa cualquier prefijo, así que una
  // ruta hermana con el mismo comienzo encendía el ítem equivocado.
  it('respeta el límite de segmento', () => {
    expect(isActive('/dashboard/agents-archivo', '/dashboard/agents')).toBe(false);
    expect(isActive('/dashboard/widget-builder', '/dashboard/widgets')).toBe(false);
  });

  it('una barra final no cambia el resultado', () => {
    expect(isActive('/dashboard/agents/', '/dashboard/agents')).toBe(true);
  });
});

describe('buildDashboardNavGroups', () => {
  it('con todo habilitado están los tres grupos', () => {
    const g = buildDashboardNavGroups(todo);
    expect(g.map((x) => x.title)).toEqual(['Panel', 'Agentes y widgets', 'Cuenta']);
  });

  it('esconde Quick Start cuando el plan no lo tiene', () => {
    const h = hrefs(buildDashboardNavGroups({ ...todo, hideQuickStart: true }));
    expect(h).not.toContain('/dashboard/quick-start');
    expect(h).toContain('/dashboard/inbox');
  });

  it('esconde Flujos sin el permiso', () => {
    expect(hrefs(buildDashboardNavGroups({ ...todo, showFlowsLink: false }))).not.toContain('/dashboard/flows');
  });

  it('esconde API sin el permiso', () => {
    expect(hrefs(buildDashboardNavGroups({ ...todo, showApiLink: false }))).not.toContain('/dashboard/api');
  });

  // Un plan solo-API no debería ver agentes, widgets ni inbox.
  it('el plan solo-API deja un único grupo con API y Ajustes', () => {
    const g = buildDashboardNavGroups({ ...todo, apiOnly: true });
    expect(g).toHaveLength(1);
    expect(hrefs(g)).toEqual(['/dashboard/api', '/dashboard/settings']);
  });

  it('el plan solo-API manda por encima de los demás permisos', () => {
    const g = buildDashboardNavGroups({ showApiLink: false, showFlowsLink: false, hideQuickStart: false, apiOnly: true });
    expect(hrefs(g)).toContain('/dashboard/api');
  });

  // Los filtros no deben mutar la lista compartida entre renders.
  it('no muta la definición original entre llamadas', () => {
    buildDashboardNavGroups({ ...todo, showFlowsLink: false });
    expect(hrefs(buildDashboardNavGroups(todo))).toContain('/dashboard/flows');
  });

  it('cada ítem trae destino, etiqueta e icono', () => {
    for (const item of buildDashboardNavGroups(todo).flatMap((g) => g.items)) {
      expect(item.href.startsWith('/dashboard')).toBe(true);
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.icon).toBeTruthy();
    }
  });
});
