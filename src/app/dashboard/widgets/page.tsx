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
import { AiLoadingInline } from '@/components/ui/ai-loading-screen';
import { BackgroundRefreshIndicator } from '@/components/dashboard/background-refresh-indicator';
import { dashboardKeys } from '@/lib/dashboard-query-keys';
import { fetchWidgetsList } from '@/lib/dashboard-fetch';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

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

  const overview = useMemo(() => {
    let active = 0;
    let inactive = 0;
    let multi = 0;
    for (const w of widgets) {
      if (w.active !== false) active += 1;
      else inactive += 1;
      if (w.multiAgentEnabled) multi += 1;
    }
    return { total: widgets.length, active, inactive, multi };
  }, [widgets]);

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

  const overviewCards: { key: WidgetFilter; label: string; value: number; hint: string }[] = [
    { key: 'all', label: 'Total', value: overview.total, hint: 'Todos tus widgets' },
    { key: 'active', label: 'Activos', value: overview.active, hint: 'Aceptan mensajes en el embed' },
    { key: 'inactive', label: 'Inactivos', value: overview.inactive, hint: 'Pausados / sin chat' },
    { key: 'multi', label: 'Multiagente', value: overview.multi, hint: 'Con routing avanzado' },
  ];

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
              className="px-4 py-2 text-xs"
            >
              <Plus size={14} strokeWidth={2.5} />
              Nuevo widget
            </DashboardButtonLink>
          </>
        }
      />

      {!loading && widgets.length > 0 ? (
        <Box
          className="dashboard-widgets-overview"
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: 'repeat(2, minmax(0, 1fr))',
              md: 'repeat(4, minmax(0, 1fr))',
            },
            gap: 1,
            mb: 2,
          }}
        >
          {overviewCards.map((card) => {
            const selected = filter === card.key;
            return (
              <Box
                key={card.key}
                component="button"
                type="button"
                onClick={() => setFilter(card.key)}
                title={card.hint}
                sx={{
                  textAlign: 'left',
                  cursor: 'pointer',
                  border: '1px solid',
                  borderColor: selected ? 'primary.main' : 'divider',
                  bgcolor: selected ? 'rgba(var(--brand-primary-rgb), 0.06)' : 'background.paper',
                  borderRadius: '14px',
                  px: 1.5,
                  py: 1.25,
                  boxShadow: 'var(--shadow-surface-sm)',
                  backgroundImage:
                    'radial-gradient(circle, rgba(0,0,0,0.03) 1px, transparent 1px)',
                  backgroundSize: '18px 18px',
                  transition: 'border-color .15s ease, background .15s ease, transform .15s ease',
                  '&:hover': {
                    borderColor: 'primary.main',
                    transform: 'translateY(-1px)',
                  },
                }}
              >
                <Typography sx={{ m: 0, fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'text.secondary' }}>
                  {card.label}
                </Typography>
                <Typography
                  sx={{
                    m: 0,
                    mt: 0.35,
                    fontFamily: '"Outfit", "Plus Jakarta Sans", system-ui, sans-serif',
                    fontSize: '1.35rem',
                    fontWeight: 700,
                    letterSpacing: '-0.03em',
                    lineHeight: 1.1,
                    color: selected ? 'primary.main' : 'text.primary',
                  }}
                >
                  {card.value}
                </Typography>
              </Box>
            );
          })}
        </Box>
      ) : null}

      {multiAgentEligible && multiAgentStats ? (
        <Box sx={{ mb: 2 }}>
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
        </Box>
      ) : null}

      {loading ? (
        <AiLoadingInline label="Cargando widgets…" hint="Recuperando tus chat widgets" style={{ padding: '48px 0' }} />
      ) : widgets.length === 0 ? (
        <DashboardEmptyState
          icon={<Boxes size={26} className="text-[var(--primary)]" strokeWidth={1.75} />}
          title="Aún no tienes widgets"
          description="Diseña tu primer chat widget y publícalo en minutos."
          action={
            <DashboardButtonLink href="/dashboard/widget-builder" variant="primary" className="px-5 py-2 text-xs">
              <Plus size={14} />
              Crear widget
            </DashboardButtonLink>
          }
        />
      ) : (
        <>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            justifyContent="space-between"
            alignItems={{ xs: 'stretch', md: 'center' }}
            spacing={1.25}
            sx={{ mb: 1.25 }}
          >
            <Box>
              <Typography
                component="h2"
                sx={{
                  m: 0,
                  fontFamily: '"Outfit", "Plus Jakarta Sans", system-ui, sans-serif',
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  letterSpacing: '-0.02em',
                }}
              >
                Biblioteca
              </Typography>
              <Typography sx={{ m: 0, mt: 0.2, fontSize: '0.75rem', color: 'text.secondary' }}>
                {filteredWidgets.length} de {overview.total} widget{overview.total === 1 ? '' : 's'}
                {filter !== 'all' ? ` · filtro «${WIDGET_FILTER_OPTIONS.find((o) => o.value === filter)?.label}»` : ''}
              </Typography>
            </Box>
          </Stack>

          <DashboardFilterBar
            searchValue={searchQuery}
            onSearchChange={setSearchQuery}
            searchPlaceholder="Buscar por nombre, agente o tema…"
            searchAriaLabel="Buscar widget por nombre o agente"
            filterValue={filter}
            filterOptions={WIDGET_FILTER_OPTIONS}
            onFilterChange={setFilter}
            filterAriaLabel="Filtrar widgets"
          />

          {filteredWidgets.length === 0 ? (
            <DashboardEmptyState
              icon={<Boxes size={26} className="text-[var(--primary)]" strokeWidth={1.75} />}
              title="Sin resultados"
              description={
                searchQuery.trim()
                  ? `Ningún widget coincide con «${searchQuery.trim()}». Prueba otro término o limpia la búsqueda.`
                  : 'Ningún widget coincide con este filtro. Prueba con «Todos» u otro criterio.'
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
            <div className="dashboard-widgets-grid" data-tour="widgets-list">
              {filteredWidgets.map((w) => (
                <div
                  key={w._id}
                  className={expanded === w._id ? 'dashboard-widgets-grid__item--expanded' : undefined}
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
        </>
      )}
    </DashboardShell>
  );
}
