'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Copy,
  GitBranch,
  Pause,
  Pencil,
  Play,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { useSubscription } from '@/hooks/use-subscription';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { DashboardPageHeader } from '@/components/dashboard/dashboard-page-header';
import { DashboardButton, DashboardButtonLink } from '@/components/dashboard/dashboard-button';
import { DashboardPlanUsageBar } from '@/components/dashboard/dashboard-plan-usage-bar';
import { DashboardEmptyState } from '@/components/dashboard/dashboard-empty-state';
import { AiLoadingInline } from '@/components/ui/ai-loading-screen';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { flowStatusLabel, parseFlowTags } from '@/lib/flow-admin';
import { canUseConversationFlows } from '@/lib/plan-catalog';
import type { FlowListItem } from '@/lib/flow-editor/types';
import '@/components/flows/flows-admin.css';

function personalWorkspaceId(userId: string) {
  return `personal:${userId}`;
}

type FlowsResponse = {
  flows: FlowListItem[];
  used: number;
  limit: number;
};

async function fetchFlows(workspaceId: string): Promise<FlowsResponse> {
  const res = await fetch(`/api/flows?workspaceId=${encodeURIComponent(workspaceId)}`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('No se pudieron cargar los flujos');
  return res.json() as Promise<FlowsResponse>;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function FlowsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { subscription, loading: subscriptionLoading } = useSubscription();
  const hasAccess = canUseConversationFlows(
    subscription?.plan ?? 'free',
    subscription?.status ?? 'free',
    subscription?.features,
  );
  const plan = subscription?.plan ?? 'free';
  const workspaceId = user?.uid ? personalWorkspaceId(user.uid) : null;
  const [creating, setCreating] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!subscriptionLoading && !hasAccess) {
      router.replace('/dashboard');
    }
  }, [subscriptionLoading, hasAccess, router]);

  const { data, isLoading } = useQuery({
    queryKey: ['flows', workspaceId],
    queryFn: () => fetchFlows(workspaceId!),
    enabled: Boolean(workspaceId) && hasAccess,
  });

  const flows = data?.flows ?? [];
  const used = data?.used ?? 0;
  const limit = data?.limit ?? 0;
  const unlimited = limit < 0;
  const quotaPct = !unlimited && limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  const atLimit = !unlimited && limit > 0 && used >= limit;
  const limitLabel = unlimited ? 'Ilimitados' : String(limit);

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['flows', workspaceId] });
  }, [queryClient, workspaceId]);

  const createFlow = useCallback(async (template?: 'support-ticket' | 'blank') => {
    if (!workspaceId) return;
    if (atLimit) {
      toast.error(`Límite de flujos alcanzado (${used}/${limit}).`);
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/flows', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, template: template ?? 'blank' }),
      });
      const body = await res.json() as { id?: string; error?: string };
      if (!res.ok || !body.id) throw new Error(body.error || 'Error al crear flujo');
      invalidate();
      router.push(`/dashboard/flows/${body.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al crear flujo');
    } finally {
      setCreating(false);
    }
  }, [workspaceId, atLimit, used, limit, invalidate, router]);

  const duplicateFlow = async (id: string) => {
    if (atLimit) {
      toast.error(`Límite de flujos alcanzado (${used}/${limit}).`);
      return;
    }
    setBusyId(id);
    try {
      const res = await fetch(`/api/flows/${id}/duplicate`, {
        method: 'POST',
        credentials: 'include',
      });
      const body = await res.json() as { id?: string; error?: string };
      if (!res.ok || !body.id) throw new Error(body.error || 'No se pudo duplicar');
      invalidate();
      toast.success('Flujo duplicado');
      router.push(`/dashboard/flows/${body.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al duplicar');
    } finally {
      setBusyId(null);
    }
  };

  const toggleStatus = async (flow: FlowListItem) => {
    setBusyId(flow.id);
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
      invalidate();
      toast.success(next === 'published' ? 'Flujo activado' : 'Flujo pausado');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al actualizar');
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/flows/${deleteId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error || 'No se pudo eliminar');
      }
      invalidate();
      toast.success('Flujo eliminado');
      setDeleteId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar');
    } finally {
      setDeleting(false);
    }
  };

  const listLoading = !workspaceId || isLoading;

  if (subscriptionLoading) {
    return (
      <DashboardShell>
        <AiLoadingInline label="Cargando…" />
      </DashboardShell>
    );
  }

  if (!hasAccess) {
    return null;
  }

  return (
    <DashboardShell>
      <DashboardPageHeader
        badge="Flujos"
        badgeIcon={GitBranch}
        beta
        title="Flujos"
        titleAccent="conversacionales"
        description="Diseña, publica y embebe flujos guiados en tu widget."
        compact
        hideIcon
        actions={(
          <div className="flex flex-wrap gap-2">
            {atLimit ? (
              <DashboardButtonLink
                href="/dashboard/settings#settings-billing"
                variant="secondary"
                className="px-4 py-2.5 text-sm"
              >
                <Plus size={16} />
                Límite alcanzado — Ver planes
              </DashboardButtonLink>
            ) : (
              <>
                <DashboardButton
                  variant="secondary"
                  className="flows-admin-btn-ai px-4 py-2.5 text-sm"
                  disabled={creating}
                  onClick={() => void createFlow('support-ticket')}
                >
                  <Sparkles size={16} />
                  Plantilla soporte
                  <span className="flows-admin-btn__badge">BETA</span>
                </DashboardButton>
                <DashboardButton
                  variant="primary"
                  className="px-4 py-2.5 text-sm"
                  disabled={creating}
                  onClick={() => void createFlow('blank')}
                >
                  <Plus size={16} />
                  Crear flujo
                </DashboardButton>
              </>
            )}
          </div>
        )}
      />

      {!unlimited && limit > 0 && (
        <DashboardPlanUsageBar
          label="Flujos usados"
          used={used}
          limitLabel={limitLabel}
          percent={quotaPct}
          atLimit={atLimit}
          plan={plan}
        />
      )}

      {listLoading ? (
        <AiLoadingInline label="Cargando flujos…" />
      ) : flows.length === 0 ? (
        <DashboardEmptyState
          icon={<GitBranch size={28} strokeWidth={1.5} className="text-[var(--brand-primary)]" />}
          title="Aún no tienes flujos"
          description="Crea uno desde cero o usa la plantilla de ticket de soporte para empezar rápido."
          action={(
            <div className="flex flex-wrap justify-center gap-2">
              <DashboardButton
                variant="secondary"
                className="flows-admin-btn-ai px-4 py-2.5 text-sm"
                disabled={creating || atLimit}
                onClick={() => void createFlow('support-ticket')}
              >
                <Sparkles size={16} />
                Plantilla soporte
              </DashboardButton>
              <DashboardButton
                variant="primary"
                className="px-4 py-2.5 text-sm"
                disabled={creating || atLimit}
                onClick={() => void createFlow('blank')}
              >
                <Plus size={16} />
                Crear primer flujo
              </DashboardButton>
            </div>
          )}
        />
      ) : (
        <div className="flows-admin-table-wrap">
          <table className="flows-admin-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Etiquetas</th>
                <th>Estado</th>
                <th>Pasos</th>
                <th>Creado</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {flows.map((flow) => {
                const tags = parseFlowTags(flow.tags);
                const visible = tags.slice(0, 3);
                const hidden = tags.length - visible.length;
                const isBusy = busyId === flow.id;

                return (
                  <tr key={flow.id}>
                    <td>
                      <button
                        type="button"
                        className="flows-admin-table__name"
                        onClick={() => router.push(`/dashboard/flows/${flow.id}`)}
                      >
                        {flow.name}
                      </button>
                      {flow.description ? (
                        <p className="flows-admin-table__desc">{flow.description}</p>
                      ) : null}
                    </td>
                    <td>
                      {tags.length > 0 ? (
                        <div className="flows-admin-tags">
                          {visible.map((tag) => (
                            <span key={tag} className="flows-admin-tag">{tag}</span>
                          ))}
                          {hidden > 0 && (
                            <span className="flows-admin-tag flows-admin-tag--more">+{hidden}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[var(--muted-foreground)] text-xs">—</span>
                      )}
                    </td>
                    <td>
                      <span
                        className={`flows-admin-status ${
                          flow.status === 'published'
                            ? 'flows-admin-status--active'
                            : 'flows-admin-status--draft'
                        }`}
                      >
                        {flowStatusLabel(flow.status)}
                      </span>
                    </td>
                    <td className="font-semibold tabular-nums">{flow.stepCount}</td>
                    <td className="text-[var(--muted-foreground)] text-sm">{formatDate(flow.createdAt)}</td>
                    <td>
                      <div className="flows-admin-row-actions">
                        <DashboardButton
                          variant="icon"
                          title="Duplicar"
                          disabled={isBusy}
                          onClick={() => void duplicateFlow(flow.id)}
                        >
                          <Copy size={15} />
                        </DashboardButton>
                        <DashboardButton
                          variant="icon"
                          title="Editar"
                          onClick={() => router.push(`/dashboard/flows/${flow.id}/edit`)}
                        >
                          <Pencil size={15} />
                        </DashboardButton>
                        <DashboardButton
                          variant="icon"
                          title={flow.status === 'published' ? 'Pausar' : 'Activar'}
                          disabled={isBusy}
                          onClick={() => void toggleStatus(flow)}
                        >
                          {flow.status === 'published' ? <Pause size={15} /> : <Play size={15} />}
                        </DashboardButton>
                        <DashboardButton
                          variant="icon"
                          title="Eliminar"
                          disabled={isBusy}
                          onClick={() => setDeleteId(flow.id)}
                        >
                          <Trash2 size={15} />
                        </DashboardButton>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteId)}
        title="Eliminar flujo"
        description="Esta acción no se puede deshacer. Se eliminará el flujo y su configuración."
        confirmLabel="Eliminar"
        variant="danger"
        loading={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteId(null)}
      />
    </DashboardShell>
  );
}
