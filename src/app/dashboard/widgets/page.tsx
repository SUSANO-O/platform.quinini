'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EncryptedDownloadModal } from '@/components/encrypted-download-modal';
import { Plus, Boxes, Sparkles, GitBranch } from 'lucide-react';
import { useSubscription } from '@/hooks/use-subscription';
import { WidgetListCard, type WidgetListItem } from '@/components/dashboard/widget-list-card';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { DashboardPageHeader } from '@/components/dashboard/dashboard-page-header';
import { DashboardCallout } from '@/components/dashboard/dashboard-callout';
import { DashboardStatStrip } from '@/components/dashboard/dashboard-stat-strip';
import { DashboardEmptyState } from '@/components/dashboard/dashboard-empty-state';
import { DashboardButton, DashboardButtonLink } from '@/components/dashboard/dashboard-button';
import { DashboardFilterMenu } from '@/components/dashboard/dashboard-filter-menu';
import { DashboardGridToolbar } from '@/components/dashboard/dashboard-grid-toolbar';
import { AiLoadingInline } from '@/components/ui/ai-loading-screen';

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
  const { subscription } = useSubscription();
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [multiAgentStats, setMultiAgentStats] = useState<MultiAgentAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [exportModalWidget, setExportModalWidget] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<WidgetFilter>('all');

  useEffect(() => {
    setOrigin(typeof window !== 'undefined' ? window.location.origin : '');
  }, []);

  async function loadWidgets() {
    try {
      const res = await fetch('/api/widgets');
      if (!res.ok) throw new Error();
      const data = await res.json();
      setWidgets(data.widgets || []);
    } catch {
      toast.error('No se pudieron cargar los widgets');
    }
    setLoading(false);
  }

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
      setWidgets((prev) =>
        prev.map((item) => (item._id === w._id ? { ...item, active: nextActive } : item)),
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
      setWidgets((prev) => prev.filter((w) => w._id !== deleteTarget));
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

  useEffect(() => {
    void loadWidgets();
  }, []);

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
    return widgets.filter((w) => {
      const isActive = w.active !== false;
      if (filter === 'active') return isActive;
      if (filter === 'inactive') return !isActive;
      if (filter === 'multi') return Boolean(w.multiAgentEnabled);
      return true;
    });
  }, [widgets, filter]);

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
    <DashboardShell wide>
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
        titleIcon={Boxes}
        title="Mis"
        titleAccent="widgets"
        description="Gestiona todos tus chat widgets — misma línea visual que el resto del panel."
        actions={
          <DashboardButtonLink
            href="/dashboard/widget-builder"
            variant="primary"
            data-tour="widgets-new"
            className="px-5 py-2.5 text-sm"
          >
            <Plus size={16} strokeWidth={2.5} />
            Nuevo widget
          </DashboardButtonLink>
        }
      />

      <DashboardCallout>
        Puedes crear tantos widgets como necesites — cada widget debe tener un nombre único.
      </DashboardCallout>

      {multiAgentEligible && multiAgentStats ? (
        <DashboardStatStrip
          title="Multiagente — este mes"
          icon={GitBranch}
          stats={[
            { label: 'Widgets activos', value: multiAgentStats.enabledWidgets ?? 0 },
            { label: 'Derivaciones', value: multiAgentStats.totals?.totalHandoffs ?? 0 },
            { label: 'Paralelo + síntesis', value: multiAgentStats.totals?.totalParallel ?? 0 },
            { label: 'Sesiones con routing', value: multiAgentStats.totals?.sessionsWithRouting ?? 0 },
          ]}
        />
      ) : null}

      {loading ? (
        <AiLoadingInline label="Cargando widgets…" hint="Recuperando tus chat widgets" style={{ padding: '48px 0' }} />
      ) : widgets.length === 0 ? (
        <DashboardEmptyState
          icon={<Boxes size={28} className="text-[var(--primary)]" strokeWidth={1.75} />}
          title="Aún no tienes widgets"
          description="Crea tu primer chat widget con el Widget Builder."
          action={
            <DashboardButtonLink href="/dashboard/widget-builder" variant="primary" className="px-6 py-2.5">
              <Plus size={16} />
              Crear widget
            </DashboardButtonLink>
          }
        />
      ) : (
        <>
          <DashboardGridToolbar
            title="Mis widgets"
            count={filteredWidgets.length}
            countLabel={filteredWidgets.length === 1 ? 'widget' : 'widgets'}
            filter={
              <DashboardFilterMenu
                value={filter}
                options={WIDGET_FILTER_OPTIONS}
                onChange={setFilter}
              />
            }
          />

          {filteredWidgets.length === 0 ? (
            <DashboardEmptyState
              icon={<Boxes size={28} className="text-[var(--primary)]" strokeWidth={1.75} />}
              title="Sin resultados"
              description="Ningún widget coincide con este filtro. Prueba con «Todos» u otro criterio."
              action={
                <DashboardButton
                  variant="secondary"
                  onClick={() => setFilter('all')}
                >
                  Ver todos
                </DashboardButton>
              }
            />
          ) : (
            <div className="dashboard-resource-grid" data-tour="widgets-list">
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
        </>
      )}
    </DashboardShell>
  );
}
