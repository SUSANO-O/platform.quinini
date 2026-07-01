'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Code2,
  MessageSquare,
  Pause,
  Pencil,
  Play,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { DashboardPageHeader } from '@/components/dashboard/dashboard-page-header';
import { DashboardButton } from '@/components/dashboard/dashboard-button';
import { DashboardPanel } from '@/components/dashboard/dashboard-panel';
import { DashboardStatusBadge } from '@/components/dashboard/dashboard-status-badge';
import { AiLoadingInline } from '@/components/ui/ai-loading-screen';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FlowEmbedModal } from '@/components/flows/flow-embed-modal';
import { flowStatusLabel, parseFlowTags } from '@/lib/flow-admin';
import { BRAND } from '@/lib/brand-colors';
import type { FlowConversationItem, FlowDocument } from '@/lib/flow-editor/types';
import '@/components/flows/flows-admin.css';

type FlowDetailResponse = {
  flow: FlowDocument;
  embedSnippet: string | null;
  recentConversations: FlowConversationItem[];
};

function formatDuration(sec: number) {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

export default function FlowDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === 'string' ? params.id : '';

  const [data, setData] = useState<FlowDetailResponse | null>(null);
  const [error, setError] = useState('');
  const [embedOpen, setEmbedOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toggling, setToggling] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/flows/${id}`, { credentials: 'include' });
    const body = await res.json() as FlowDetailResponse & { error?: string };
    if (!res.ok || !body.flow) throw new Error(body.error || 'Flujo no encontrado');
    setData({
      flow: body.flow,
      embedSnippet: body.embedSnippet ?? null,
      recentConversations: body.recentConversations ?? [],
    });
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        await load();
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Error al cargar');
      }
    })();
    return () => { cancelled = true; };
  }, [id, load]);

  const flow = data?.flow;
  const stats = flow?.stats;

  const toggleStatus = async () => {
    if (!flow) return;
    setToggling(true);
    try {
      const next = flow.status === 'published' ? 'draft' : 'published';
      const res = await fetch(`/api/flows/${flow.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error || 'No se pudo actualizar');
      }
      await load();
      toast.success(next === 'published' ? 'Flujo activado' : 'Flujo desactivado');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al actualizar');
    } finally {
      setToggling(false);
    }
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/flows/${id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error || 'No se pudo eliminar');
      }
      toast.success('Flujo eliminado');
      router.push('/dashboard/flows');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar');
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  if (error) {
    return (
      <DashboardShell>
        <DashboardEmptyFallback message={error} />
      </DashboardShell>
    );
  }

  if (!flow) {
    return (
      <DashboardShell>
        <AiLoadingInline label="Cargando flujo…" />
      </DashboardShell>
    );
  }

  const tags = parseFlowTags(flow.tags);
  const isActive = flow.status === 'published';
  const conversations = data?.recentConversations ?? [];

  const convStatusLabel = (s: FlowConversationItem['status']) => {
    if (s === 'completed') return 'Completada';
    if (s === 'abandoned') return 'Abandonada';
    return 'En curso';
  };

  return (
    <DashboardShell>
      <Link href="/dashboard/flows" className="flows-admin-back">
        <ArrowLeft size={15} aria-hidden />
        Volver a flujos
      </Link>

      <DashboardPageHeader
        badge={flowStatusLabel(flow.status)}
        beta
        title={flow.name}
        description={flow.description || 'Sin descripción'}
        actions={(
          <div className="flows-admin-detail__actions">
            <DashboardButton
              variant="secondary"
              className="px-3 py-2 text-sm"
              onClick={() => setEmbedOpen(true)}
            >
              <Code2 size={15} />
              Obtener código
            </DashboardButton>
            <DashboardButton
              variant="primary"
              className="px-3 py-2 text-sm"
              onClick={() => router.push(`/dashboard/flows/${flow.id}/edit`)}
            >
              <Pencil size={15} />
              Editar flujo
            </DashboardButton>
            <DashboardButton
              variant="secondary"
              className="flows-admin-btn-warn px-3 py-2 text-sm"
              disabled={toggling}
              onClick={() => void toggleStatus()}
            >
              {isActive ? <Pause size={15} /> : <Play size={15} />}
              {isActive ? 'Desactivar' : 'Activar'}
            </DashboardButton>
            <DashboardButton
              variant="secondary"
              className="flows-admin-btn-danger px-3 py-2 text-sm"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 size={15} />
              Eliminar
            </DashboardButton>
          </div>
        )}
      />

      <div className="flex items-center gap-2 mb-5 -mt-3">
        <DashboardStatusBadge active={isActive} />
        <span className="text-xs text-[var(--muted-foreground)]">
          {flow.stepCount} paso{flow.stepCount !== 1 ? 's' : ''} · Actualizado{' '}
          {new Date(flow.updatedAt).toLocaleDateString('es')}
        </span>
      </div>

      <div className="flows-admin-kpis">
        <div className="flows-admin-kpi">
          <MessageSquare size={18} className="flows-admin-kpi__icon" />
          <p className="flows-admin-kpi__label">Conversaciones totales</p>
          <p className="flows-admin-kpi__value">{stats?.totalConversations ?? 0}</p>
          <p className="flows-admin-kpi__sub">
            {stats?.completed ?? 0} completadas · {stats?.abandoned ?? 0} abandonadas
          </p>
        </div>
        <div className="flows-admin-kpi">
          <CheckCircle2 size={18} className="flows-admin-kpi__icon" />
          <p className="flows-admin-kpi__label">Tasa de finalización</p>
          <p className="flows-admin-kpi__value">{stats?.completionRate ?? 0}%</p>
          <p className="flows-admin-kpi__sub flows-admin-kpi__sub--accent">
            Promedio de todas las conversaciones
          </p>
        </div>
        <div className="flows-admin-kpi">
          <Clock size={18} className="flows-admin-kpi__icon" />
          <p className="flows-admin-kpi__label">Duración media</p>
          <p className="flows-admin-kpi__value">{formatDuration(stats?.avgDurationSec ?? 0)}</p>
          <p className="flows-admin-kpi__sub">Duración media de conversación</p>
        </div>
        <div className="flows-admin-kpi">
          <MessageSquare size={18} className="flows-admin-kpi__icon" />
          <p className="flows-admin-kpi__label">Mensajes totales</p>
          <p className="flows-admin-kpi__value">{stats?.totalMessages ?? 0}</p>
          <p className="flows-admin-kpi__sub">
            Media {stats?.avgMessagesPerConversation ?? 0} por conversación
          </p>
        </div>
      </div>

      <div className="flows-admin-detail-grid">
        <DashboardPanel accentColor={BRAND.primary} className="h-full">
          <div className="dashboard-panel__body">
            <div className="flows-admin-panel__header">
              <h2 className="flows-admin-panel__title">Conversaciones recientes</h2>
              {conversations.length > 0 && (
                <span className="text-xs font-semibold text-[var(--muted-foreground)]">
                  {conversations.length} mostradas
                </span>
              )}
            </div>
            {conversations.length === 0 ? (
              <div className="flows-admin-panel__empty">
                Aún no hay conversaciones para este flujo.
              </div>
            ) : (
              <ul className="flows-admin-conv-list">
                {conversations.map((c) => (
                  <li key={c.sessionId} className="flows-admin-conv-item">
                    <div className="flows-admin-conv-item__main">
                      <span className="flows-admin-conv-item__id">
                        {c.visitorId ? `Visitante ${c.visitorId.slice(-6)}` : c.sessionId.slice(-8)}
                      </span>
                      <span
                        className={`flows-admin-status ${
                          c.status === 'completed'
                            ? 'flows-admin-status--active'
                            : c.status === 'abandoned'
                              ? 'flows-admin-status--abandoned'
                              : 'flows-admin-status--draft'
                        }`}
                      >
                        {convStatusLabel(c.status)}
                      </span>
                    </div>
                    <div className="flows-admin-conv-item__meta">
                      <span>{new Date(c.startedAt).toLocaleString('es')}</span>
                      <span>{c.messageCount} msg</span>
                      {c.durationSec != null && c.durationSec > 0 && (
                        <span>{formatDuration(c.durationSec)}</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DashboardPanel>

        <DashboardPanel accentColor={BRAND.tertiary}>
          <div className="dashboard-panel__body">
            <h2 className="flows-admin-panel__title m-0 mb-4">Detalles del flujo</h2>
            <div className="flows-admin-meta">
              <div className="flows-admin-meta__row">
                <span className="flows-admin-meta__label">ID del flujo</span>
                <span className="flows-admin-meta__value">#{flow.id.slice(-6)}</span>
              </div>
              <div className="flows-admin-meta__row">
                <span className="flows-admin-meta__label">Pasos</span>
                <span className="flows-admin-meta__value">{flow.stepCount}</span>
              </div>
              <div className="flows-admin-meta__row">
                <span className="flows-admin-meta__label">Estado</span>
                <span className="flows-admin-meta__value">{flowStatusLabel(flow.status)}</span>
              </div>
              <div className="flows-admin-meta__row">
                <span className="flows-admin-meta__label">Creado</span>
                <span className="flows-admin-meta__value">
                  {new Date(flow.createdAt).toLocaleDateString('es')}
                </span>
              </div>
              <div className="flows-admin-meta__row">
                <span className="flows-admin-meta__label">Actualizado</span>
                <span className="flows-admin-meta__value">
                  {new Date(flow.updatedAt).toLocaleDateString('es')}
                </span>
              </div>
              {tags.length > 0 && (
                <div>
                  <p className="flows-admin-meta__label m-0 mb-2">Etiquetas</p>
                  <div className="flows-admin-tags">
                    {tags.map((tag) => (
                      <span key={tag} className="flows-admin-tag">{tag}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </DashboardPanel>
      </div>

      <FlowEmbedModal
        open={embedOpen}
        snippet={data?.embedSnippet ?? null}
        onClose={() => setEmbedOpen(false)}
      />

      <ConfirmDialog
        open={deleteOpen}
        title="Eliminar flujo"
        description="Esta acción no se puede deshacer. Se eliminará el flujo y su configuración."
        confirmLabel="Eliminar"
        variant="danger"
        loading={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteOpen(false)}
      />
    </DashboardShell>
  );
}

function DashboardEmptyFallback({ message }: { message: string }) {
  return (
    <div className="dashboard-empty">
      <p className="font-semibold m-0">{message}</p>
      <Link href="/dashboard/flows" className="text-sm mt-3 inline-block text-[var(--brand-primary)] font-semibold no-underline">
        ← Volver a flujos
      </Link>
    </div>
  );
}
