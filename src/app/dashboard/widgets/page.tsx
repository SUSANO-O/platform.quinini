'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EncryptedDownloadModal } from '@/components/encrypted-download-modal';
import { Plus, Boxes, Sparkles, GitBranch } from '@/components/ui/icons';
import { useSubscription } from '@/hooks/use-subscription';
import { WidgetListCard, type WidgetListItem } from '@/components/dashboard/widget-list-card';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { DashboardPageHeader } from '@/components/dashboard/dashboard-page-header';
import { DashboardStatStrip } from '@/components/dashboard/dashboard-stat-strip';
import { DashboardEmptyState } from '@/components/dashboard/dashboard-empty-state';
import { DashboardButton, DashboardButtonLink } from '@/components/dashboard/dashboard-button';
import { DashboardFilterBar } from '@/components/dashboard/dashboard-filter-bar';
import { DashboardGridToolbar } from '@/components/dashboard/dashboard-grid-toolbar';
import { AiLoadingInline } from '@/components/ui/ai-loading-screen';
import { BackgroundRefreshIndicator } from '@/components/dashboard/background-refresh-indicator';
import { dashboardKeys } from '@/lib/dashboard-query-keys';
import { fetchWidgetsList } from '@/lib/dashboard-fetch';

type WidgetFilter = 'all' | 'active' | 'inactive' | 'multi';

const WIDGET_FILTER_OPTIONS: { value: WidgetFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Activos' },
  { value: 'inactive', label: 'Inactivos' },
  { value: 'multi', label: 'Multiagente' },
];

interface Widget extends WidgetListItem {
  humanSupportPhone?: string;
}

interface MultiAgentAnalytics {
  totals?: {
    sessionsWithRouting?: number;
    totalRouted?: number;
    totalHandoffs?: number;
    totalParallel?: number;
  };
  enabledWidgets?: number;
}

function buildMinimalSnippet(w: Widget, origin: string) {
  return [
    `<script src="${origin}/widget.js"></script>`,
    `<script>`,
    `  window.AgentFlowhub.init({`,
    `    token: '${w.afhubToken || 'wt_…'}',`,
    `    host:  '${origin}',`,
    `  });`,
    `</script>`,
  ].join('\n');
}

export default function WidgetsPage() {
  const queryClient = useQueryClient();
  const { subscription } = useSubscription();
  const widgetsQuery = useQuery({
    queryKey: dashboardKeys.widgets(),
    queryFn: fetchWidgetsList,
  });
  const widgets = (widgetsQuery.data ?? []) as unknown as Widget[];
  const loading = widgetsQuery.isLoading && widgets.length === 0;
  const fetchError = widgetsQuery.isError
    ? (widgetsQuery.error instanceof Error ? widgetsQuery.error.message : 'Error de red')
    : null;
  const [multiAgentStats, setMultiAgentStats] = useState<MultiAgentAnalytics | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [exportModalWidget, setExportModalWidget] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<WidgetFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    setOrigin(typeof window !== 'undefined' ? window.location.origin : '');
  }, []);

  async function toggleWidgetActive(w: Widget) {
    const isActive = w.active !== false;
    setTogglingId(w._id);
    try {
      const res = await fetch(`/api/widgets/${w._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !isActive }),
      });
      if (!res.ok) {
        toast.error(isActive ? 'No se pudo desactivar el widget' : 'No se pudo activar el widget');
        return;
      }
      const data = (await res.json()) as { widget?: Widget };
      const nextActive = data.widget?.active !== false;
      queryClient.setQueryData(dashboardKeys.widgets(), (prev: Widget[] | undefined) =>
        (prev ?? []).map((item) => (item._id === w._id ? { ...item, active: nextActive } : item)),
      );
      toast.success(nextActive ? 'Widget activado' : 'Widget desactivado — el embed ya no acepta mensajes');
    } catch {
      toast.error('Error al cambiar el estado del widget');
    } finally {
      setTogglingId(null);
    }
  }

  async function confirmDeleteWidget() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/widgets?id=${deleteTarget}`, { method: 'DELETE' });
      if (!res.ok) {
        toast.error('No se pudo eliminar el widget');
        return;
      }
      queryClient.setQueryData(dashboardKeys.widgets(), (prev: Widget[] | undefined) =>
        (prev ?? []).filter((w) => w._id !== deleteTarget),
      );
      toast.success('Widget eliminado');
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  function copySnippet(w: Widget) {
    const code = buildMinimalSnippet(w, origin);
    void navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success('Código copiado al portapapeles');
    setTimeout(() => setCopied(false), 2000);
  }

  function toggleExpanded(id: string) {
    if (expanded === id) {
      setExpanded(null);
    } else {
      setExpanded(id);
      setCopied(false);
    }
  }

  const plan = subscription?.plan ?? 'free';
  const planActive = subscription?.status === 'active' || subscription?.status === 'trialing';
  const multiAgentEligible = planActive && (plan === 'business' || plan === 'enterprise');

  useEffect(() => {
    if (!multiAgentEligible) return;
    void (async () => {
      try {
        const res = await fetch('/api/widgets/multi-agent-analytics');
        if (!res.ok) return;
        const data = (await res.json()) as MultiAgentAnalytics;
        setMultiAgentStats(data);
      } catch {
        /* ignore */
      }
    })();
  }, [multiAgentEligible]);

  const filteredWidgets = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return widgets.filter((w) => {
      const isActive = w.active !== false;
      if (filter === 'active' && !isActive) return false;
      if (filter === 'inactive' && isActive) return false;
      if (filter === 'multi' && !w.multiAgentEnabled) return false;
      if (!query) return true;

      const haystack = [
        w.name,
        w.agentName,
        w.position,
        w.theme,
        w.multiAgentEnabled ? 'multiagente' : '',
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [widgets, filter, searchQuery]);

  async function downloadWidgetEncrypted(widgetId: string, password: string) {
    const r = await fetch(`/api/widgets/${widgetId}/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, format: 'json' }),
    });
    if (!r.ok) {
      toast.error('No se pudo generar el archivo.');
      return null;
    }
    const blob = await r.blob();
    const filename =
      r.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] ||
      `widget-${widgetId}.html`;
    return { blob, filename };
  }

  return (
    <DashboardShell width="wide">
      <EncryptedDownloadModal
        open={exportModalWidget !== null}
        onClose={() => setExportModalWidget(null)}
        title="Descargar historial cifrado"
        onDownload={(pw) => downloadWidgetEncrypted(exportModalWidget!, pw)}
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Eliminar widget"
        description="¿Eliminar este widget? Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        variant="danger"
        loading={deleting}
        onConfirm={() => void confirmDeleteWidget()}
        onCancel={() => setDeleteTarget(null)}
      />

      <DashboardPageHeader
        badge="Widgets"
        badgeIcon={Sparkles}
        title="Mis"
        titleAccent="widgets"
        description="Crea, prueba y publica chat widgets en tu sitio."
        compact
        hideIcon
        actions={
          <>
            <BackgroundRefreshIndicator active={widgetsQuery.isFetching && !loading} />
            <DashboardButtonLink
              href="/dashboard/widget-builder"
              variant="primary"
              data-tour="widgets-new"
              className="px-5 py-2.5 text-sm"
            >
              <Plus size={16} strokeWidth={2.5} />
              Nuevo widget
            </DashboardButtonLink>
          </>
        }
      />

      {fetchError ? (
        <div className="dashboard-callout flex flex-wrap items-center justify-between gap-3 border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.06)]">
          <p className="dashboard-callout__text m-0 text-[var(--state-error)]">{fetchError}</p>
          <DashboardButton variant="primary" className="text-xs px-3 py-1.5" onClick={() => void widgetsQuery.refetch()}>
            Reintentar
          </DashboardButton>
        </div>
      ) : null}

      {loading ? (
        <AiLoadingInline
          label="Cargando widgets…"
          hint="Recuperando tus chat widgets"
          style={{ padding: '56px 0' }}
        />
      ) : widgets.length === 0 ? (
        <DashboardEmptyState
          icon={<Boxes size={28} className="text-[var(--primary)]" strokeWidth={1.75} />}
          title="Aún no tienes widgets"
          description="Diseña tu primer chat widget y publícalo en minutos."
          action={
            <DashboardButtonLink href="/dashboard/widget-builder" variant="primary" className="px-6 py-2.5">
              <Plus size={16} />
              Crear widget
            </DashboardButtonLink>
          }
        />
      ) : (
        <div data-tour="widgets-list">
          <DashboardGridToolbar
            title="Tus widgets"
            count={filteredWidgets.length}
            countLabel={filteredWidgets.length === 1 ? 'widget' : 'widgets'}
          />

          <DashboardFilterBar
            searchValue={searchQuery}
            onSearchChange={setSearchQuery}
            searchPlaceholder="Buscar widget…"
            searchAriaLabel="Buscar widget por nombre o agente"
            filterValue={filter}
            filterOptions={WIDGET_FILTER_OPTIONS}
            onFilterChange={setFilter}
            filterAriaLabel="Filtrar widgets"
          />

          {filteredWidgets.length === 0 ? (
            <DashboardEmptyState
              icon={<Boxes size={28} className="text-[var(--primary)]" strokeWidth={1.75} />}
              title="Sin resultados"
              description={
                searchQuery.trim()
                  ? `Ningún widget coincide con «${searchQuery.trim()}».`
                  : 'Ningún widget coincide con este filtro.'
              }
              action={
                <DashboardButton
                  variant="secondary"
                  onClick={() => {
                    setFilter('all');
                    setSearchQuery('');
                  }}
                >
                  Ver todos
                </DashboardButton>
              }
            />
          ) : (
            <div className="dashboard-resource-grid">
              {filteredWidgets.map((w) => (
                <div
                  key={w._id}
                  className={expanded === w._id ? 'dashboard-resource-grid__item--expanded' : undefined}
                >
                  <WidgetListCard
                    widget={w}
                    isActive={w.active !== false}
                    toggling={togglingId === w._id}
                    expanded={expanded === w._id}
                    copied={copied}
                    origin={origin}
                    buildSnippet={buildMinimalSnippet}
                    onToggleActive={() => void toggleWidgetActive(w)}
                    onToggleCode={() => toggleExpanded(w._id)}
                    onCopyCode={() => copySnippet(w)}
                    onExportHistory={() => setExportModalWidget(w._id)}
                    onDelete={() => setDeleteTarget(w._id)}
                  />
                </div>
              ))}
            </div>
          )}

          {multiAgentEligible && multiAgentStats ? (
            <div className="mt-10">
              <DashboardStatStrip
                title="Multiagente — este mes"
                titleHint="Resumen de enrutamiento en widgets con modo multiagente avanzado (mes en curso)."
                icon={GitBranch}
                stats={[
                  {
                    label: 'Widgets activos',
                    value: multiAgentStats.enabledWidgets ?? 0,
                    hint: 'Widgets tuyos con «multiagente avanzado» activado.',
                  },
                  {
                    label: 'Derivaciones',
                    value: multiAgentStats.totals?.totalHandoffs ?? 0,
                    hint: 'Pases a sub-agente o especialista (triaje).',
                  },
                  {
                    label: 'Paralelo + síntesis',
                    value: multiAgentStats.totals?.totalParallel ?? 0,
                    hint: 'Consultas en modo paralelo con respuesta unificada.',
                  },
                  {
                    label: 'Sesiones con routing',
                    value: multiAgentStats.totals?.sessionsWithRouting ?? 0,
                    hint: 'Conversaciones con al menos una decisión multiagente.',
                  },
                ]}
              />
            </div>
          ) : null}
        </div>
      )}
    </DashboardShell>
  );
}
