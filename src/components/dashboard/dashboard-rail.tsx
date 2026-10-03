'use client';

/**
 * Menú lateral de escritorio en dos niveles: riel oscuro con las áreas (Inicio, Construir, Cuenta) y
 * panel con el contenido del área (buscador ⌘K, páginas, tus agentes y widgets, tarjeta de mejora).
 * Plegado (por defecto) el panel se abre flotando al pulsar un área; fijado ocupa su sitio.
 * Los enlaces por plan salen de buildDashboardNavGroups (mismas reglas que la barra anterior y el móvil).
 */

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { LucideIcon } from '@/components/ui/icons';
import { Bot, CircleHelp, LayoutDashboard, LogOut, Pin, Search, Settings, X } from '@/components/ui/icons';
import { BotivaOrbLogo } from '@/components/brand/botiva-orb-logo';
import { BRAND_NAME } from '@/lib/brand';
import { UserAvatar } from '@/components/shared/user-avatar';
import { PwaInstallButton } from '@/components/shared/pwa-install-button';
import { SidebarVersionLink } from '@/components/dashboard/sidebar-version-link';
import { useInboxOpenCount } from '@/hooks/use-inbox-open-count';
import { useDashboardPrefetch } from '@/hooks/dashboard/use-dashboard-prefetch';
import { useSubscription } from '@/hooks/use-subscription';
import { dashboardKeys } from '@/lib/dashboard-query-keys';
import { fetchAgentsList, fetchWidgetsList } from '@/lib/dashboard-fetch';
import {
  canUseApiAccess,
  canUseConversationFlows,
  effectiveProductPlan,
  isApiOnlyPlan,
  isSoloChatOnlyPlan,
  PLAN_ORDER,
} from '@/lib/plan-catalog';
import { ThemeCycleButton, ThemeSwitch } from './theme-switch';
import { buildDashboardNavGroups, isActive, SIDEBAR_TOUR_KEY_BY_HREF, type SidebarUser } from './dashboard-sidebar';
import './dashboard-rail.css';

type NavItem = { href: string; label: string; icon: LucideIcon; tag?: 'BETA' };
type Area = { id: string; label: string; icon: LucideIcon; groups: { title: string; items: NavItem[] }[] };

const PROMO_KEY = 'dashboard-rail-promo-dismissed';

/** Las tres áreas del riel a partir de los grupos del menú (respeta lo que el plan muestra). */
function buildAreas(groups: ReturnType<typeof buildDashboardNavGroups>): Area[] {
  const byTitle = new Map(groups.map((g) => [g.title, g.items as NavItem[]]));
  if (!byTitle.has('Panel')) {
    // Plan solo API: un único grupo "Desarrolladores".
    return [{ id: 'cuenta', label: 'Cuenta', icon: Settings, groups: groups.map((g) => ({ title: g.title, items: g.items as NavItem[] })) }];
  }
  return [
    { id: 'inicio', label: 'Inicio', icon: LayoutDashboard, groups: [{ title: 'Panel', items: byTitle.get('Panel') ?? [] }] },
    { id: 'construir', label: 'Construir', icon: Bot, groups: [{ title: 'Herramientas', items: byTitle.get('Agentes y widgets') ?? [] }] },
    { id: 'cuenta', label: 'Cuenta', icon: Settings, groups: [{ title: 'Cuenta', items: byTitle.get('Cuenta') ?? [] }] },
  ];
}

/** Onda al pulsar (como el ripple de los botones del menú anterior), desde el punto del clic. */
function ripple(e: React.PointerEvent<HTMLElement>) {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  const size = Math.max(r.width, r.height) * 2;
  const wave = document.createElement('span');
  wave.className = 'dr-ripple';
  wave.style.width = wave.style.height = `${size}px`;
  wave.style.left = `${e.clientX - r.left - size / 2}px`;
  wave.style.top = `${e.clientY - r.top - size / 2}px`;
  el.appendChild(wave);
  wave.addEventListener('animationend', () => wave.remove());
}

function areaForPath(areas: Area[], pathname: string): string {
  for (const a of areas) {
    if (a.groups.some((g) => g.items.some((i) => isActive(pathname, i.href)))) return a.id;
  }
  return areas[0]?.id ?? 'inicio';
}

/** Las listas traen `_id` (Mongo); el tipo declara `id`. */
function idOf(x: { id?: unknown; _id?: unknown }): string {
  return String(x._id ?? x.id ?? '');
}

function initials(name: string): string {
  const w = name.trim().split(/\s+/).filter(Boolean);
  return ((w[0]?.[0] ?? '?') + (w[1]?.[0] ?? '')).toUpperCase();
}

function RailLink({
  href,
  label,
  icon: Icon,
  active,
  badge,
  tag,
  onNavigate,
  onPrefetch,
}: NavItem & { active: boolean; badge?: number; onNavigate: () => void; onPrefetch: (href: string) => void }) {
  return (
    <Link
      href={href}
      prefetch
      className={`dr-link${active ? ' is-active' : ''}`}
      aria-current={active ? 'page' : undefined}
      data-tour={SIDEBAR_TOUR_KEY_BY_HREF[href]}
      onClick={onNavigate}
      onPointerDown={ripple}
      onMouseEnter={() => onPrefetch(href)}
      onFocus={() => onPrefetch(href)}
    >
      <Icon size={16} strokeWidth={1.75} aria-hidden />
      <span className="dr-link__label">{label}</span>
      {tag ? <span className="dr-tag">{tag}</span> : null}
      {badge && badge > 0 ? <span className="dr-count is-hot">{badge > 99 ? '99+' : badge}</span> : null}
    </Link>
  );
}

function EntityLink({ href, name, meta, active, onNavigate, dot }: { href: string; name: string; meta?: string; active: boolean; onNavigate: () => void; dot?: 'on' | 'off' }) {
  return (
    <Link href={href} className={`dr-link dr-link--entity${active ? ' is-active' : ''}`} aria-current={active ? 'page' : undefined} onClick={onNavigate} onPointerDown={ripple} title={name}>
      <span className="dr-initials" aria-hidden>
        {initials(name)}
        {dot ? <i className={`dr-dot is-${dot}`} /> : null}
      </span>
      <span className="dr-link__label">{name}</span>
      {meta ? <span className="dr-count">{meta}</span> : null}
    </Link>
  );
}

export function DashboardRail({
  pathname,
  user,
  pinned,
  onTogglePin,
  onLogout,
  footer,
}: {
  pathname: string;
  user: SidebarUser;
  /** Panel fijado (ocupa su sitio). Si no, se abre flotando al pulsar un área. */
  pinned: boolean;
  onTogglePin: () => void;
  onLogout: () => void;
  /** Avisos de cuenta, progreso y tour (se muestran al pie del panel). */
  footer?: ReactNode;
}) {
  const { openCount: inboxOpenCount } = useInboxOpenCount(true);
  const { subscription } = useSubscription();
  const prefetch = useDashboardPrefetch();
  const rawPlan = subscription?.plan ?? 'free';
  const status = subscription?.status ?? 'free';
  const plan = effectiveProductPlan(rawPlan, status);
  const apiOnly = isApiOnlyPlan(plan);
  const groups = buildDashboardNavGroups({
    showApiLink: canUseApiAccess(rawPlan, status, subscription?.features),
    showFlowsLink: canUseConversationFlows(rawPlan, status, subscription?.features),
    hideQuickStart: isSoloChatOnlyPlan(rawPlan) || apiOnly,
    apiOnly,
  });
  const areas = buildAreas(groups);
  const routeArea = areaForPath(areas, pathname);
  const [areaId, setAreaId] = useState(routeArea);
  const [flyout, setFlyout] = useState(false);
  const [query, setQuery] = useState('');
  const [promoHidden, setPromoHidden] = useState(true);
  const searchRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const open = pinned || flyout;

  // Al cambiar de página: el área sigue a la ruta y el panel flotante se cierra.
  useEffect(() => {
    setAreaId(routeArea);
    setFlyout(false);
    setQuery('');
  }, [pathname, routeArea]);

  useEffect(() => {
    try {
      setPromoHidden(localStorage.getItem(PROMO_KEY) === '1');
    } catch {
      setPromoHidden(false);
    }
  }, []);

  // ⌘K / Ctrl+K abre el buscador; Escape cierra el panel flotante.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (!pinned) setFlyout(true);
        requestAnimationFrame(() => searchRef.current?.focus());
      } else if (e.key === 'Escape' && flyout) {
        setFlyout(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pinned, flyout]);

  // Clic fuera cierra el panel flotante.
  useEffect(() => {
    if (!flyout) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setFlyout(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [flyout]);

  const showEntities = !apiOnly;
  const agentsQ = useQuery({ queryKey: dashboardKeys.agents(), queryFn: fetchAgentsList, enabled: showEntities && open, staleTime: 60_000 });
  const widgetsQ = useQuery({ queryKey: dashboardKeys.widgets(), queryFn: fetchWidgetsList, enabled: showEntities && open, staleTime: 60_000 });
  const agents = useMemo(() => (agentsQ.data ?? []).filter((a) => !a.isPlatform), [agentsQ.data]);
  const widgets = widgetsQ.data ?? [];

  const closeFlyout = () => setFlyout(false);
  const area = areas.find((a) => a.id === areaId) ?? areas[0];
  const q = query.trim().toLowerCase();
  const allItems = areas.flatMap((a) => a.groups.flatMap((g) => g.items));
  const hits = q
    ? {
        pages: allItems.filter((i) => i.label.toLowerCase().includes(q)),
        agents: agents.filter((a) => a.name.toLowerCase().includes(q)).slice(0, 8),
        widgets: widgets.filter((w) => w.name.toLowerCase().includes(q)).slice(0, 8),
      }
    : null;

  const planRank = (PLAN_ORDER as readonly string[]).indexOf(plan);
  const showPromo = !promoHidden && !apiOnly && planRank >= 0 && planRank < (PLAN_ORDER as readonly string[]).indexOf('business');

  const link = (item: NavItem) => (
    <RailLink
      key={item.href}
      {...item}
      active={isActive(pathname, item.href)}
      badge={item.href === '/dashboard/inbox' ? inboxOpenCount : undefined}
      onNavigate={closeFlyout}
      onPrefetch={prefetch}
    />
  );
  const agentLink = (a: (typeof agents)[number]) => (
    <EntityLink
      key={idOf(a)}
      href={`/dashboard/agents/${idOf(a)}`}
      name={a.name || 'Sin nombre'}
      active={isActive(pathname, `/dashboard/agents/${idOf(a)}`)}
      dot={a.status === 'disabled' || a.status === 'inactive' ? 'off' : 'on'}
      meta={typeof a.model === 'string' ? a.model.replace(/^.*\//, '').replace(/-preview.*$/, '') : undefined}
      onNavigate={closeFlyout}
    />
  );
  const widgetLink = (w: (typeof widgets)[number]) => (
    <EntityLink
      key={idOf(w)}
      href={`/dashboard/widget-builder?edit=${idOf(w)}`}
      name={w.name || 'Sin nombre'}
      active={false}
      dot={w.active === false ? 'off' : 'on'}
      onNavigate={closeFlyout}
    />
  );

  return (
    <div ref={rootRef} className={`dr${pinned ? ' is-pinned' : ''}${flyout && !pinned ? ' is-flyout' : ''}`}>
      <aside className="dr-rail" aria-label="Navegación del panel">
        <Link href="/" className="dr-logo" title={BRAND_NAME}>
          <BotivaOrbLogo size={30} />
        </Link>
        <nav className="dr-areas" aria-label="Áreas">
          {areas.map((a) => {
            const Icon = a.icon;
            const on = a.id === (open ? areaId : routeArea);
            const hot = a.id === 'inicio' && inboxOpenCount > 0;
            return (
              <button
                key={a.id}
                type="button"
                className={`dr-area${on ? ' is-on' : ''}`}
                aria-pressed={open && a.id === areaId}
                onPointerDown={ripple}
                onClick={() => {
                  if (open && a.id === areaId && !pinned) {
                    setFlyout(false);
                    return;
                  }
                  setAreaId(a.id);
                  if (!pinned) setFlyout(true);
                }}
              >
                <span className="dr-area__icon">
                  <Icon size={19} strokeWidth={1.75} aria-hidden />
                  {hot ? <i className="dr-area__dot" aria-label={`${inboxOpenCount} pendientes en Inbox`} /> : null}
                </span>
                <span className="dr-area__label">{a.label}</span>
                {/* Con el panel cerrado, el tour guiado señala el área de cada página. */}
                {!open
                  ? a.groups
                      .flatMap((g) => g.items)
                      .map((i) => SIDEBAR_TOUR_KEY_BY_HREF[i.href])
                      .filter(Boolean)
                      .map((key) => <span key={key} className="dr-tour-anchor" data-tour={key} aria-hidden />)
                  : null}
              </button>
            );
          })}
        </nav>
        <div className="dr-rail__foot">
          <button
            type="button"
            className="dr-area dr-area--small"
            onPointerDown={ripple}
            title="Buscar (⌘K)"
            onClick={() => {
              if (!pinned) setFlyout(true);
              requestAnimationFrame(() => searchRef.current?.focus());
            }}
          >
            <Search size={17} strokeWidth={1.75} aria-hidden />
          </button>
          <button
            type="button"
            className="dr-area dr-area--small"
            onPointerDown={ripple}
            title="Ayuda asistente"
            onClick={() => {
              window.__BIV?.show?.();
              window.dispatchEvent(new CustomEvent('biv:show-assist'));
            }}
          >
            <CircleHelp size={17} strokeWidth={1.75} aria-hidden />
          </button>
          <ThemeCycleButton className="dr-area dr-area--small" />
          <Link href="/dashboard/settings" className="dr-me" title={user.displayName || user.email}>
            <UserAvatar displayName={user.displayName} email={user.email} avatarUrl={user.avatarUrl} size={32} />
          </Link>
        </div>
      </aside>

      {open ? (
        <section className="dr-panel" aria-label={area?.label}>
          <div className="dr-panel__head">
            <div className="dr-search">
              <Search size={14} aria-hidden />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar…"
                aria-label="Buscar páginas, agentes y widgets"
              />
              {query ? (
                <button type="button" onClick={() => setQuery('')} aria-label="Limpiar búsqueda">
                  <X size={12} />
                </button>
              ) : (
                <kbd>⌘K</kbd>
              )}
            </div>
            <button type="button" className={`dr-pin${pinned ? ' is-on' : ''}`} onClick={onTogglePin} title={pinned ? 'Soltar panel' : 'Fijar panel'} aria-pressed={pinned}>
              <Pin size={14} aria-hidden />
            </button>
          </div>

          <div className="dr-panel__body">
            {hits ? (
              <>
                {hits.pages.length ? (
                  <div className="dr-group">
                    <p className="dr-group__title">Páginas</p>
                    {hits.pages.map(link)}
                  </div>
                ) : null}
                {hits.agents.length ? (
                  <div className="dr-group">
                    <p className="dr-group__title">Agentes</p>
                    {hits.agents.map(agentLink)}
                  </div>
                ) : null}
                {hits.widgets.length ? (
                  <div className="dr-group">
                    <p className="dr-group__title">Widgets</p>
                    {hits.widgets.map(widgetLink)}
                  </div>
                ) : null}
                {!hits.pages.length && !hits.agents.length && !hits.widgets.length ? <p className="dr-empty">Nada coincide con «{query.trim()}».</p> : null}
              </>
            ) : (
              <>
                <p className="dr-panel__title">{area?.label}</p>
                {area?.id === 'construir' && showEntities ? (
                  <>
                    <div className="dr-group">
                      <p className="dr-group__title">
                        Mis agentes <span>{agents.length || ''}</span>
                      </p>
                      {agentsQ.isLoading ? <p className="dr-empty">Cargando…</p> : agents.slice(0, 12).map(agentLink)}
                      {agents.length > 12 ? (
                        <Link href="/dashboard/agents" className="dr-more" onClick={closeFlyout}>
                          Ver los {agents.length}
                        </Link>
                      ) : null}
                      {!agentsQ.isLoading && agents.length === 0 ? (
                        <Link href="/dashboard/agents/new" className="dr-more" onClick={closeFlyout}>
                          + Crear tu primer agente
                        </Link>
                      ) : null}
                    </div>
                    {widgets.length ? (
                      <div className="dr-group">
                        <p className="dr-group__title">
                          Mis widgets <span>{widgets.length}</span>
                        </p>
                        {widgets.slice(0, 8).map(widgetLink)}
                      </div>
                    ) : null}
                  </>
                ) : null}
                {area?.groups.map((g) => (
                  <div key={g.title} className="dr-group">
                    {area.id === 'construir' ? <p className="dr-group__title">{g.title}</p> : null}
                    {g.items.map(link)}
                  </div>
                ))}
                {area?.id === 'cuenta' ? (
                  <div className="dr-group">
                    <p className="dr-group__title">Apariencia</p>
                    <ThemeSwitch className="dr-theme" />
                  </div>
                ) : null}
                {area?.id === 'cuenta' ? (
                  <div className="dr-group">
                    <PwaInstallButton collapsed={false} />
                    <button type="button" className="dr-link" onClick={onLogout} onPointerDown={ripple}>
                      <LogOut size={16} strokeWidth={1.75} aria-hidden />
                      <span className="dr-link__label">Cerrar sesión</span>
                    </button>
                  </div>
                ) : null}
                {area?.id === 'inicio' ? <div className="dr-extra">{footer}</div> : null}
              </>
            )}
          </div>

          <div className="dr-panel__foot">
            {showPromo ? (
              <div className="dr-promo">
                <button
                  type="button"
                  className="dr-promo__x"
                  aria-label="Ocultar"
                  onClick={() => {
                    setPromoHidden(true);
                    try {
                      localStorage.setItem(PROMO_KEY, '1');
                    } catch {
                      /* noop */
                    }
                  }}
                >
                  <X size={12} />
                </button>
                <strong>Desbloquea Business</strong>
                <p>Widgets multiagente, más conversaciones e integraciones avanzadas.</p>
                <Link href="/pricing" className="dr-promo__cta" onPointerDown={ripple}>
                  Ver planes
                </Link>
              </div>
            ) : null}
            <div className="dr-me-row">
              <span className="dr-me-row__name">{user.displayName || user.email.split('@')[0]}</span>
              <SidebarVersionLink collapsed={false} />
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

