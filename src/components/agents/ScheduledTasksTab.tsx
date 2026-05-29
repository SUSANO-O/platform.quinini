'use client';

/**
 * Tab "Tareas Programadas" del builder de agente.
 * Auto-gestiona su data vía /api/agents/[id]/scheduled-tasks (CRUD).
 * El worker `cron-schedule` (Cloud Run) las ejecuta; aquí se crean/editan y se ve el estado.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Clock, Plus, Trash2, Pause, Play, AlertTriangle, CheckCircle2, Loader2, Eye, X, ScrollText, Pencil, Zap } from 'lucide-react';

const TZ = 'America/Bogota';

type ActionType = 'webhook' | 'agent_run' | 'chat_message' | 'email';
type Frequency = 'hourly' | 'daily' | 'weekly' | 'monthly';

interface ScheduledTask {
  _id: string;
  name: string;
  enabled: boolean;
  status: string;
  cron: string;
  timezone: string;
  action: { type: ActionType; config: Record<string, unknown> };
  retryPolicy: { maxRetries: number; backoff: 'fixed' | 'exponential'; retryDelayMinutes: number };
  nextRunAt: string | null;
  nextRetryAt: string | null;
  lastRunAt: string | null;
  lastStatus: string;
  attempts: number;
}

const ACTION_LABELS: Record<ActionType, { label: string; desc: string; emoji: string }> = {
  webhook: { label: 'Llamar webhook', desc: 'POST a un endpoint HTTP (n8n, API, etc.)', emoji: '🔗' },
  agent_run: { label: 'Ejecutar agente', desc: 'Corre el agente con un prompt y guarda la respuesta', emoji: '🤖' },
  chat_message: { label: 'Mensaje al chat', desc: 'Inserta un mensaje en la conversación del widget', emoji: '💬' },
  email: { label: 'Enviar correo', desc: 'Envía un email (próximamente)', emoji: '📧' },
};

const DOW = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/** Misma lógica que el helper del servidor (sin cron-parser para no inflar el bundle). */
function buildCron(freq: Frequency, hour: number, minute: number, dow: number, dom: number): string {
  const m = clamp(minute, 0, 59);
  const h = clamp(hour, 0, 23);
  switch (freq) {
    case 'hourly': return `${m} * * * *`;
    case 'daily': return `${m} ${h} * * *`;
    case 'weekly': return `${m} ${h} * * ${clamp(dow, 0, 6)}`;
    case 'monthly': return `${m} ${h} ${clamp(dom, 1, 31)} * *`;
  }
}
function clamp(n: number, min: number, max: number) {
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.floor(n))) : min;
}
/** Inverso de buildCron: deriva la forma amigable desde una cron expression de 5 campos. */
function parseCron(cron: string): { frequency: Frequency; hour: number; minute: number; dow: number; dom: number } {
  const parts = (cron || '').trim().split(/\s+/);
  const [min = '0', hr = '9', dom = '*', , dowF = '*'] = parts;
  const m = Number(min) || 0;
  const h = Number(hr) || 0;
  if (hr === '*') return { frequency: 'hourly', hour: 9, minute: m, dow: 1, dom: 1 };
  if (dom !== '*') return { frequency: 'monthly', hour: h, minute: m, dow: 1, dom: Number(dom) || 1 };
  if (dowF !== '*') return { frequency: 'weekly', hour: h, minute: m, dow: Number(dowF) || 0, dom: 1 };
  return { frequency: 'daily', hour: h, minute: m, dow: 1, dom: 1 };
}
function describeSchedule(freq: Frequency, hour: number, minute: number, dow: number, dom: number): string {
  const t = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  switch (freq) {
    case 'hourly': return `Cada hora (minuto ${minute})`;
    case 'daily': return `Cada día a las ${t}`;
    case 'weekly': return `Cada ${DOW[dow]} a las ${t}`;
    case 'monthly': return `El día ${dom} de cada mes a las ${t}`;
  }
}
function fmtDate(s: string | null): string {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleString('es-CO', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return s;
  }
}

const STATUS_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  idle: { label: 'Programada', color: '#0d9488', bg: 'rgba(13,148,136,0.12)' },
  success: { label: 'OK', color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
  failed: { label: 'Reintentando', color: '#d97706', bg: 'rgba(217,119,6,0.12)' },
  exhausted: { label: 'Falló', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  running: { label: 'Ejecutando', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
  paused: { label: 'Pausada', color: '#6b7280', bg: 'rgba(107,114,128,0.12)' },
};

export default function ScheduledTasksTab({
  agentId,
  plan,
  readOnly,
}: {
  agentId: string;
  plan: string;
  readOnly: boolean;
}) {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showWizard, setShowWizard] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editTask, setEditTask] = useState<ScheduledTask | null>(null);
  const [access, setAccess] = useState<{ hasAccess: boolean; limit: number; plan: string } | null>(null);
  const [runMsg, setRunMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/agents/${agentId}/scheduled-tasks`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al cargar tareas');
      setTasks(data.tasks ?? []);
      setAccess(data.access ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (t: ScheduledTask) => {
    await fetch(`/api/agents/${agentId}/scheduled-tasks/${t._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !t.enabled }),
    });
    void load();
  };

  const remove = async (t: ScheduledTask) => {
    if (!confirm(`¿Eliminar la tarea "${t.name}"?`)) return;
    await fetch(`/api/agents/${agentId}/scheduled-tasks/${t._id}`, { method: 'DELETE' });
    void load();
  };

  const runNow = async (t: ScheduledTask) => {
    setRunMsg('');
    try {
      const res = await fetch(`/api/agents/${agentId}/scheduled-tasks/${t._id}/run`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo encolar.');
      setRunMsg(`⚡ "${t.name}" encolada — se ejecutará en menos de 1 min. Abre 👁 para ver el resultado.`);
      // Refrescar el estado tras unos segundos (cuando el worker la haya corrido).
      setTimeout(() => void load(), 8000);
    } catch (e) {
      setRunMsg(`⚠️ ${(e as Error).message}`);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <p className="font-bold m-0 mb-0.5 flex items-center gap-1.5">
            <Clock size={15} /> Tareas Programadas ({tasks.length})
          </p>
          <p style={{ color: 'var(--muted-foreground)', fontSize: '12px', margin: 0 }}>
            El agente ejecuta estas tareas automáticamente. Zona horaria: {TZ}.
          </p>
        </div>
        {!readOnly && access?.hasAccess && (
          <button
            type="button"
            onClick={() => setShowWizard(true)}
            disabled={access.limit >= 0 && tasks.length >= access.limit}
            title={access.limit >= 0 && tasks.length >= access.limit ? `Límite del plan: ${access.limit} tareas` : ''}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-xs"
            style={{
              background: 'var(--brand-primary, #0d9488)',
              color: '#fff',
              cursor: access.limit >= 0 && tasks.length >= access.limit ? 'not-allowed' : 'pointer',
              opacity: access.limit >= 0 && tasks.length >= access.limit ? 0.5 : 1,
            }}
          >
            <Plus size={13} /> Nueva tarea
            {access.limit >= 0 ? ` (${tasks.length}/${access.limit})` : ''}
          </button>
        )}
      </div>

      {error && (
        <div className="mb-3 text-sm" style={{ color: '#ef4444' }}>
          {error}
        </div>
      )}

      {runMsg && (
        <div
          className="mb-3 text-sm px-3 py-2 rounded-lg"
          style={{ background: 'rgba(13,148,136,0.08)', color: 'var(--foreground)', border: '1px solid var(--border)' }}
        >
          {runMsg}
        </div>
      )}

      {access && !access.hasAccess ? (
        <div
          style={{
            textAlign: 'center',
            padding: '36px 20px',
            border: '1px solid var(--border)',
            borderRadius: '14px',
            background: 'rgba(13,148,136,0.04)',
          }}
        >
          <Clock size={30} style={{ color: 'var(--brand-primary, #0d9488)', margin: '0 auto 12px' }} />
          <p style={{ fontWeight: 700, marginBottom: 6 }}>Tareas Programadas — disponible desde el plan Plus</p>
          <p style={{ color: 'var(--muted-foreground)', fontSize: 13, marginBottom: 16, maxWidth: 420, margin: '0 auto 16px' }}>
            Automatiza a tu agente: reportes, recordatorios, webhooks y correos en el horario que definas.
            Actualiza tu plan para activarlo.
          </p>
          <Link href="/dashboard" className="landing-btn-primary !inline-flex !w-auto no-underline text-sm px-5 py-2 rounded-xl">
            Ver planes →
          </Link>
        </div>
      ) : loading ? (
        <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--muted-foreground)' }}>
          <Loader2 size={15} className="animate-spin" /> Cargando…
        </div>
      ) : tasks.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '36px 20px',
            border: '1px dashed var(--border)',
            borderRadius: '14px',
          }}
        >
          <Clock size={28} style={{ color: 'var(--muted-foreground)', margin: '0 auto 10px' }} />
          <p style={{ fontWeight: 700, marginBottom: 4 }}>Sin tareas programadas</p>
          <p style={{ color: 'var(--muted-foreground)', fontSize: 13 }}>
            Crea una tarea para que el agente actúe en un horario (reportes, recordatorios, webhooks…).
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {tasks.map((t) => (
            <TaskRow
              key={t._id}
              task={t}
              readOnly={readOnly}
              onOpen={() => setDetailId(t._id)}
              onEdit={() => setEditTask(t)}
              onRun={() => runNow(t)}
              onToggle={() => toggle(t)}
              onDelete={() => remove(t)}
            />
          ))}
        </div>
      )}

      {(showWizard || editTask) && (
        <TaskWizard
          agentId={agentId}
          plan={plan}
          task={editTask ?? undefined}
          onClose={() => {
            setShowWizard(false);
            setEditTask(null);
          }}
          onCreated={() => {
            setShowWizard(false);
            setEditTask(null);
            void load();
          }}
        />
      )}

      {detailId && (
        <TaskDetailModal agentId={agentId} taskId={detailId} onClose={() => setDetailId(null)} />
      )}
    </>
  );
}

function TaskRow({
  task,
  readOnly,
  onOpen,
  onEdit,
  onRun,
  onToggle,
  onDelete,
}: {
  task: ScheduledTask;
  readOnly: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onRun: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const badge = STATUS_BADGE[task.enabled ? task.status : 'paused'] ?? STATUS_BADGE.idle;
  const isExhausted = task.status === 'exhausted';
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl"
      style={{
        border: `1px solid ${isExhausted ? 'rgba(239,68,68,0.4)' : 'var(--border)'}`,
        background: 'var(--background)',
      }}
    >
      <div className="min-w-0 cursor-pointer" onClick={onOpen} title="Ver detalle y logs">
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 15 }}>{ACTION_LABELS[task.action.type]?.emoji}</span>
          <p className="font-bold m-0 truncate">{task.name}</p>
          <span
            className="px-2 py-0.5 rounded-full text-[11px] font-bold"
            style={{ color: badge.color, background: badge.bg }}
          >
            {isExhausted ? <AlertTriangle size={10} className="inline mr-0.5" /> : null}
            {badge.label}
          </span>
        </div>
        <p style={{ color: 'var(--muted-foreground)', fontSize: 12, margin: '4px 0 0' }}>
          {ACTION_LABELS[task.action.type]?.label} · Próxima: {fmtDate(task.nextRunAt)} · Última:{' '}
          {task.lastRunAt ? (
            <>
              {task.lastStatus === 'success' ? (
                <CheckCircle2 size={11} className="inline" style={{ color: '#22c55e' }} />
              ) : (
                <AlertTriangle size={11} className="inline" style={{ color: '#ef4444' }} />
              )}{' '}
              {fmtDate(task.lastRunAt)}
            </>
          ) : (
            'nunca'
          )}
        </p>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onOpen}
          title="Ver detalle y logs"
          className="p-2 rounded-lg"
          style={{ border: '1px solid var(--border)', cursor: 'pointer' }}
        >
          <Eye size={14} />
        </button>
        {!readOnly && (
          <>
            <button
              type="button"
              onClick={onRun}
              title="Ejecutar ahora"
              disabled={!task.enabled}
              className="p-2 rounded-lg"
              style={{
                border: '1px solid var(--border)',
                cursor: task.enabled ? 'pointer' : 'not-allowed',
                opacity: task.enabled ? 1 : 0.4,
                color: '#0d9488',
              }}
            >
              <Zap size={14} />
            </button>
            <button
              type="button"
              onClick={onEdit}
              title="Editar"
              className="p-2 rounded-lg"
              style={{ border: '1px solid var(--border)', cursor: 'pointer' }}
            >
              <Pencil size={14} />
            </button>
            <button
              type="button"
              onClick={onToggle}
              title={task.enabled ? 'Pausar' : 'Activar'}
              className="p-2 rounded-lg"
              style={{ border: '1px solid var(--border)', cursor: 'pointer' }}
            >
              {task.enabled ? <Pause size={14} /> : <Play size={14} />}
            </button>
            <button
              type="button"
              onClick={onDelete}
              title="Eliminar"
              className="p-2 rounded-lg"
              style={{ border: '1px solid var(--border)', color: '#ef4444', cursor: 'pointer' }}
            >
              <Trash2 size={14} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Wizard (3 pasos) ──────────────────────────────────────────────────────────

function TaskWizard({
  agentId,
  plan,
  task,
  onClose,
  onCreated,
}: {
  agentId: string;
  plan: string;
  task?: ScheduledTask;
  onClose: () => void;
  onCreated: () => void;
}) {
  const isEdit = Boolean(task);
  const sched = task ? parseCron(task.cron) : null;
  const initCfg: Record<string, string> = {};
  if (task) {
    for (const [k, v] of Object.entries(task.action.config ?? {})) {
      if (v != null && typeof v !== 'object') initCfg[k] = String(v);
    }
  }

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  // Paso 1
  const [actionType, setActionType] = useState<ActionType>(task?.action.type ?? 'webhook');
  // Paso 2
  const [name, setName] = useState(task?.name ?? '');
  const [frequency, setFrequency] = useState<Frequency>(sched?.frequency ?? 'daily');
  const [hour, setHour] = useState(sched?.hour ?? 9);
  const [minute, setMinute] = useState(sched?.minute ?? 0);
  const [dow, setDow] = useState(sched?.dow ?? 1);
  const [dom, setDom] = useState(sched?.dom ?? 1);
  // Paso 3 — config dinámica + reintentos
  const [config, setConfig] = useState<Record<string, string>>(initCfg);
  const [widgetId, setWidgetId] = useState((task as unknown as { widgetId?: string })?.widgetId ?? '');
  const [maxRetries, setMaxRetries] = useState(task?.retryPolicy?.maxRetries ?? 3);
  const [retryDelayMinutes, setRetryDelayMinutes] = useState(task?.retryPolicy?.retryDelayMinutes ?? 5);

  const setCfg = (k: string, v: string) => setConfig((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    setSaving(true);
    setErr('');
    try {
      const cron = buildCron(frequency, hour, minute, dow, dom);
      const body: Record<string, unknown> = {
        name: name.trim(),
        cron,
        timezone: TZ,
        action: { type: actionType, config: buildConfig(actionType, config) },
        retryPolicy: { maxRetries, backoff: task?.retryPolicy?.backoff ?? 'fixed', retryDelayMinutes },
      };
      if (widgetId.trim()) body.widgetId = widgetId.trim();
      const url = isEdit
        ? `/api/agents/${agentId}/scheduled-tasks/${task!._id}`
        : `/api/agents/${agentId}/scheduled-tasks`;
      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Error al ${isEdit ? 'guardar' : 'crear'} la tarea`);
      onCreated();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl p-5"
        style={{ background: 'var(--background)', border: '1px solid var(--border)', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="font-bold text-lg m-0 mb-1">{isEdit ? 'Editar tarea programada' : 'Nueva tarea programada'}</p>
        <p style={{ color: 'var(--muted-foreground)', fontSize: 12, margin: '0 0 16px' }}>Paso {step} de 3</p>

        {step === 1 && (
          <div className="flex flex-col gap-2">
            {(Object.keys(ACTION_LABELS) as ActionType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setActionType(t)}
                className="flex items-center gap-3 p-3 rounded-xl text-left"
                style={{
                  border: `1px solid ${actionType === t ? 'var(--brand-primary, #0d9488)' : 'var(--border)'}`,
                  background: actionType === t ? 'rgba(13,148,136,0.06)' : 'transparent',
                  cursor: 'pointer',
                }}
              >
                <span style={{ fontSize: 20 }}>{ACTION_LABELS[t].emoji}</span>
                <div>
                  <p className="font-bold m-0 text-sm">{ACTION_LABELS[t].label}</p>
                  <p style={{ color: 'var(--muted-foreground)', fontSize: 12, margin: 0 }}>{ACTION_LABELS[t].desc}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-3">
            <Field label="Nombre de la tarea">
              <input
                className="landing-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. Reporte diario de ventas"
              />
            </Field>
            <Field label="Frecuencia">
              <select className="landing-input" value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}>
                <option value="hourly">Cada hora</option>
                <option value="daily">Cada día</option>
                <option value="weekly">Cada semana</option>
                <option value="monthly">Cada mes</option>
              </select>
            </Field>
            {frequency === 'weekly' && (
              <Field label="Día de la semana">
                <select className="landing-input" value={dow} onChange={(e) => setDow(Number(e.target.value))}>
                  {DOW.map((d, i) => (
                    <option key={i} value={i}>{d}</option>
                  ))}
                </select>
              </Field>
            )}
            {frequency === 'monthly' && (
              <Field label="Día del mes">
                <input className="landing-input" type="number" min={1} max={31} value={dom} onChange={(e) => setDom(Number(e.target.value))} />
              </Field>
            )}
            {frequency !== 'hourly' && (
              <div className="flex gap-2">
                <Field label="Hora">
                  <input className="landing-input" type="number" min={0} max={23} value={hour} onChange={(e) => setHour(Number(e.target.value))} />
                </Field>
                <Field label="Minuto">
                  <input className="landing-input" type="number" min={0} max={59} value={minute} onChange={(e) => setMinute(Number(e.target.value))} />
                </Field>
              </div>
            )}
            {frequency === 'hourly' && (
              <Field label="Minuto de cada hora">
                <input className="landing-input" type="number" min={0} max={59} value={minute} onChange={(e) => setMinute(Number(e.target.value))} />
              </Field>
            )}
            <p style={{ color: 'var(--muted-foreground)', fontSize: 12 }}>
              🕒 {describeSchedule(frequency, hour, minute, dow, dom)} ({TZ})
            </p>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-3">
            <ActionConfigFields actionType={actionType} config={config} setCfg={setCfg} />
            {(actionType === 'chat_message' || actionType === 'agent_run') && (
              <Field label="Widget ID (dónde aparece el mensaje)">
                <input className="landing-input" value={widgetId} onChange={(e) => setWidgetId(e.target.value)} placeholder="ID del widget destino" />
              </Field>
            )}
            <div className="flex gap-2">
              <Field label="Reintentos máx.">
                <input className="landing-input" type="number" min={0} max={10} value={maxRetries} onChange={(e) => setMaxRetries(Number(e.target.value))} />
              </Field>
              <Field label="Espera entre reintentos (min)">
                <input className="landing-input" type="number" min={1} max={1440} value={retryDelayMinutes} onChange={(e) => setRetryDelayMinutes(Number(e.target.value))} />
              </Field>
            </div>
          </div>
        )}

        {err && <p style={{ color: '#ef4444', fontSize: 13, marginTop: 12 }}>{err}</p>}

        <div className="flex items-center justify-between gap-2 mt-5">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm" style={{ border: '1px solid var(--border)', cursor: 'pointer' }}>
            Cancelar
          </button>
          <div className="flex gap-2">
            {step > 1 && (
              <button type="button" onClick={() => setStep(step - 1)} className="px-4 py-2 rounded-xl text-sm" style={{ border: '1px solid var(--border)', cursor: 'pointer' }}>
                Atrás
              </button>
            )}
            {step < 3 ? (
              <button
                type="button"
                onClick={() => setStep(step + 1)}
                disabled={step === 2 && !name.trim()}
                className="px-4 py-2 rounded-xl text-sm font-bold"
                style={{ background: 'var(--brand-primary, #0d9488)', color: '#fff', cursor: 'pointer', opacity: step === 2 && !name.trim() ? 0.5 : 1 }}
              >
                Siguiente
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void submit()}
                disabled={saving}
                className="px-4 py-2 rounded-xl text-sm font-bold inline-flex items-center gap-1.5"
                style={{ background: 'var(--brand-primary, #0d9488)', color: '#fff', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}
              >
                {saving && <Loader2 size={13} className="animate-spin" />} {isEdit ? 'Guardar cambios' : 'Crear tarea'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ActionConfigFields({
  actionType,
  config,
  setCfg,
}: {
  actionType: ActionType;
  config: Record<string, string>;
  setCfg: (k: string, v: string) => void;
}) {
  if (actionType === 'webhook') {
    return (
      <>
        <Field label="URL del webhook">
          <input className="landing-input" value={config.url ?? ''} onChange={(e) => setCfg('url', e.target.value)} placeholder="https://mi-api.com/hook" />
        </Field>
        <Field label="Método">
          <select className="landing-input" value={config.method ?? 'POST'} onChange={(e) => setCfg('method', e.target.value)}>
            <option>POST</option>
            <option>GET</option>
            <option>PUT</option>
            <option>PATCH</option>
          </select>
        </Field>
        <Field label="Cuerpo (opcional)">
          <textarea className="landing-input" rows={3} value={config.bodyTemplate ?? ''} onChange={(e) => setCfg('bodyTemplate', e.target.value)} placeholder="Texto o JSON a enviar" />
        </Field>
      </>
    );
  }
  if (actionType === 'agent_run') {
    return (
      <Field label="Prompt para el agente">
        <textarea className="landing-input" rows={4} value={config.prompt ?? ''} onChange={(e) => setCfg('prompt', e.target.value)} placeholder="Ej. Genera el resumen de ventas de hoy" />
      </Field>
    );
  }
  if (actionType === 'chat_message') {
    return (
      <Field label="Mensaje a enviar al chat">
        <textarea className="landing-input" rows={4} value={config.message ?? ''} onChange={(e) => setCfg('message', e.target.value)} placeholder="Ej. ¡Buenos días! Recuerda revisar tus pedidos." />
      </Field>
    );
  }
  // email
  return (
    <>
      <Field label="Para (correo)">
        <input className="landing-input" value={config.to ?? ''} onChange={(e) => setCfg('to', e.target.value)} placeholder="cliente@correo.com" />
      </Field>
      <Field label="Asunto">
        <input className="landing-input" value={config.subject ?? ''} onChange={(e) => setCfg('subject', e.target.value)} placeholder="Asunto del correo" />
      </Field>
      <Field label="Cuerpo">
        <textarea className="landing-input" rows={4} value={config.body ?? ''} onChange={(e) => setCfg('body', e.target.value)} placeholder="Contenido del correo" />
      </Field>
    </>
  );
}

function buildConfig(type: ActionType, c: Record<string, string>): Record<string, unknown> {
  switch (type) {
    case 'webhook':
      return { url: c.url ?? '', method: c.method ?? 'POST', bodyTemplate: c.bodyTemplate ?? '', headers: {} };
    case 'agent_run':
      return { prompt: c.prompt ?? '' };
    case 'chat_message':
      return { message: c.message ?? '' };
    case 'email':
      return { to: c.to ?? '', subject: c.subject ?? '', body: c.body ?? '' };
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 flex-1">
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted-foreground)' }}>{label}</span>
      {children}
    </label>
  );
}

// ── Detalle + logs de ejecuciones ─────────────────────────────────────────────

interface Execution {
  _id: string;
  runAt: string | null;
  status: 'success' | 'failed';
  attempt: number;
  durationMs: number;
  triggeredBy: 'schedule' | 'retry';
  error?: string;
  outputSummary?: string;
}

function TaskDetailModal({
  agentId,
  taskId,
  onClose,
}: {
  agentId: string;
  taskId: string;
  onClose: () => void;
}) {
  const [task, setTask] = useState<ScheduledTask | null>(null);
  const [execs, setExecs] = useState<Execution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/agents/${agentId}/scheduled-tasks/${taskId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al cargar el detalle');
      setTask(data.task);
      setExecs(data.executions ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [agentId, taskId]);

  useEffect(() => {
    void load();
  }, [load]);

  const badge = task ? STATUS_BADGE[task.enabled ? task.status : 'paused'] ?? STATUS_BADGE.idle : STATUS_BADGE.idle;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl p-5"
        style={{ background: 'var(--background)', border: '1px solid var(--border)', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <p className="font-bold text-lg m-0 truncate flex items-center gap-2">
              {task ? ACTION_LABELS[task.action.type]?.emoji : ''} {task?.name ?? 'Tarea'}
            </p>
            {task && (
              <span
                className="inline-block mt-1 px-2 py-0.5 rounded-full text-[11px] font-bold"
                style={{ color: badge.color, background: badge.bg }}
              >
                {badge.label}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => void load()} title="Refrescar" className="p-2 rounded-lg" style={{ border: '1px solid var(--border)', cursor: 'pointer' }}>
              <Loader2 size={14} className={loading ? 'animate-spin' : ''} />
            </button>
            <button type="button" onClick={onClose} className="p-2 rounded-lg" style={{ border: '1px solid var(--border)', cursor: 'pointer' }}>
              <X size={14} />
            </button>
          </div>
        </div>

        {error && <p style={{ color: '#ef4444', fontSize: 13 }}>{error}</p>}

        {task && (
          <>
            <div className="grid grid-cols-2 gap-2 mb-4 text-sm">
              <Info label="Acción" value={ACTION_LABELS[task.action.type]?.label} />
              <Info label="Programación (cron)" value={`${task.cron} · ${task.timezone}`} />
              <Info label="Próxima ejecución" value={fmtDate(task.nextRunAt)} />
              <Info label="Última ejecución" value={task.lastRunAt ? `${fmtDate(task.lastRunAt)} (${task.lastStatus || '—'})` : 'nunca'} />
              <Info label="Reintentos" value={`máx ${task.retryPolicy?.maxRetries ?? 0}, cada ${task.retryPolicy?.retryDelayMinutes ?? 0} min`} />
              {task.nextRetryAt && <Info label="Próximo reintento" value={fmtDate(task.nextRetryAt)} />}
            </div>

            <p className="font-bold m-0 mb-2 flex items-center gap-1.5 text-sm">
              <ScrollText size={14} /> Historial de ejecuciones ({execs.length})
            </p>
            {execs.length === 0 ? (
              <p style={{ color: 'var(--muted-foreground)', fontSize: 13 }}>Aún no se ha ejecutado.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {execs.map((e) => (
                  <div
                    key={e._id}
                    className="flex items-start gap-2 p-2 rounded-lg text-xs"
                    style={{ border: '1px solid var(--border)' }}
                  >
                    {e.status === 'success' ? (
                      <CheckCircle2 size={14} style={{ color: '#22c55e', flexShrink: 0, marginTop: 1 }} />
                    ) : (
                      <AlertTriangle size={14} style={{ color: '#ef4444', flexShrink: 0, marginTop: 1 }} />
                    )}
                    <div className="min-w-0">
                      <span style={{ fontWeight: 600 }}>{fmtDate(e.runAt)}</span>
                      <span style={{ color: 'var(--muted-foreground)' }}>
                        {' '}· {e.triggeredBy === 'retry' ? `reintento #${e.attempt}` : 'programada'} · {e.durationMs}ms
                      </span>
                      {e.status === 'success' && e.outputSummary && (
                        <p style={{ margin: '2px 0 0', color: 'var(--muted-foreground)' }}>{e.outputSummary}</p>
                      )}
                      {e.status === 'failed' && e.error && (
                        <p style={{ margin: '2px 0 0', color: '#ef4444' }}>{e.error}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p style={{ fontSize: 11, color: 'var(--muted-foreground)', margin: 0 }}>{label}</p>
      <p style={{ fontSize: 13, margin: 0, fontWeight: 600 }}>{value ?? '—'}</p>
    </div>
  );
}
