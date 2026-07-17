'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Sparkles,
  Plus,
  RefreshCw,
  Trash2,
  Pencil,
  Loader2,
  RotateCcw,
  Eye,
  EyeOff,
} from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import type { AgentSkillCatalogEntry } from '@/lib/agent-skills-catalog';

type SkillRow = AgentSkillCatalogEntry & { catalogEnabled?: boolean };

type SkillForm = {
  id: string;
  label: string;
  description: string;
  color: string;
  icon: string;
  kind: 'capability' | 'profile';
  category: string;
  tags: string;
  defaultPriority: number;
  catalogEnabled: boolean;
  prompt_extension: string;
  active_tools: string;
  temperature: string;
};

const EMPTY_FORM: SkillForm = {
  id: '',
  label: '',
  description: '',
  color: '#6366f1',
  icon: '✨',
  kind: 'capability',
  category: 'general',
  tags: '',
  defaultPriority: 60,
  catalogEnabled: true,
  prompt_extension: '',
  active_tools: '',
  temperature: '',
};

function formFromSkill(s: SkillRow): SkillForm {
  return {
    id: s.id,
    label: s.label,
    description: s.description,
    color: s.color,
    icon: s.icon,
    kind: s.kind,
    category: s.category || 'general',
    tags: Array.isArray(s.tags) ? s.tags.join(', ') : '',
    defaultPriority: s.defaultPriority,
    catalogEnabled: s.catalogEnabled !== false,
    prompt_extension: s.config.prompt_extension,
    active_tools: s.config.active_tools.join('\n'),
    temperature:
      typeof s.config.llm_settings?.temperature === 'number'
        ? String(s.config.llm_settings.temperature)
        : '',
  };
}

function payloadFromForm(form: SkillForm, isEdit: boolean) {
  const tools = form.active_tools
    .split(/[\n,]/)
    .map((t) => t.trim())
    .filter(Boolean);
  const tags = form.tags
    .split(/[,\n]/)
    .map((t) => t.trim())
    .filter(Boolean);
  const temp = form.temperature.trim() ? Number(form.temperature) : undefined;
  const config: {
    prompt_extension: string;
    active_tools: string[];
    llm_settings?: { temperature?: number };
  } = {
    prompt_extension: form.prompt_extension.trim(),
    active_tools: tools,
  };
  if (typeof temp === 'number' && Number.isFinite(temp)) {
    config.llm_settings = { temperature: Math.max(0, Math.min(2, temp)) };
  }
  return {
    ...(isEdit ? {} : { id: form.id.trim() }),
    label: form.label.trim(),
    description: form.description.trim(),
    color: form.color.trim(),
    icon: form.icon.trim(),
    kind: form.kind,
    category: form.category.trim() || 'general',
    tags,
    defaultPriority: form.defaultPriority,
    catalogEnabled: form.catalogEnabled,
    config,
  };
}

const inp: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  borderRadius: '10px',
  border: '1px solid var(--border)',
  background: 'var(--background)',
  color: 'var(--foreground)',
  fontSize: '13px',
  outline: 'none',
  boxSizing: 'border-box',
};

export default function AdminSkillsPage() {
  const [skills, setSkills] = useState<SkillRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'profile' | 'capability'>('all');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SkillForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [reseedOpen, setReseedOpen] = useState(false);
  const [reseeding, setReseeding] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SkillRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/skills');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al cargar');
      setSkills(Array.isArray(data.catalog) ? data.catalog : []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al cargar skills');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    if (filter === 'all') return skills;
    return skills.filter((s) => s.kind === filter);
  }, [skills, filter]);

  const counts = useMemo(() => ({
    all: skills.length,
    profile: skills.filter((s) => s.kind === 'profile').length,
    capability: skills.filter((s) => s.kind === 'capability').length,
    enabled: skills.filter((s) => s.catalogEnabled !== false).length,
  }), [skills]);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setEditorOpen(true);
  }

  function openEdit(skill: SkillRow) {
    setEditingId(skill.id);
    setForm(formFromSkill(skill));
    setEditorOpen(true);
  }

  async function saveSkill() {
    if (!form.label.trim()) {
      toast.error('El nombre es obligatorio.');
      return;
    }
    if (!editingId && !form.id.trim()) {
      toast.error('El ID es obligatorio.');
      return;
    }
    setSaving(true);
    try {
      const url = editingId ? `/api/admin/skills/${encodeURIComponent(editingId)}` : '/api/admin/skills';
      const method = editingId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadFromForm(form, Boolean(editingId))),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar');
      toast.success(editingId ? 'Skill actualizada' : 'Skill creada');
      setEditorOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  async function toggleVisible(skill: SkillRow) {
    const res = await fetch(`/api/admin/skills/${encodeURIComponent(skill.id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ catalogEnabled: skill.catalogEnabled === false }),
    });
    if (res.ok) {
      setSkills((prev) =>
        prev.map((s) =>
          s.id === skill.id ? { ...s, catalogEnabled: skill.catalogEnabled === false } : s,
        ),
      );
      toast.success(skill.catalogEnabled === false ? 'Visible en agentes' : 'Oculta en agentes');
    } else {
      toast.error('No se pudo actualizar');
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const res = await fetch(`/api/admin/skills/${encodeURIComponent(deleteTarget.id)}`, {
      method: 'DELETE',
    });
    setDeleting(false);
    setDeleteTarget(null);
    if (res.ok) {
      setSkills((prev) => prev.filter((s) => s.id !== deleteTarget.id));
      toast.success('Skill eliminada');
    } else {
      toast.error('Error al eliminar');
    }
  }

  async function reseed() {
    setReseeding(true);
    const res = await fetch('/api/admin/skills/reseed', { method: 'POST' });
    setReseeding(false);
    setReseedOpen(false);
    if (res.ok) {
      toast.success('Catálogo restaurado desde semilla');
      await load();
    } else {
      toast.error('Error al restaurar');
    }
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100, margin: '0 auto' }}>
      <ConfirmDialog
        open={reseedOpen}
        title="Restaurar catálogo por defecto"
        description="Se borrarán todas las skills personalizadas y se cargarán las skills de la semilla (perfiles + capacidades con categorías/tags y tools MCP). Los agentes que ya tenían skills guardadas conservan su config hasta que las editen."
        confirmLabel="Restaurar"
        variant="danger"
        loading={reseeding}
        onConfirm={() => void reseed()}
        onCancel={() => { if (!reseeding) setReseedOpen(false); }}
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Eliminar skill"
        description={
          deleteTarget
            ? `¿Eliminar "${deleteTarget.label}" (${deleteTarget.id})? No se borra de agentes que ya la tengan activa.`
            : ''
        }
        confirmLabel="Eliminar"
        variant="danger"
        loading={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => { if (!deleting) setDeleteTarget(null); }}
      />

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <Sparkles size={22} style={{ color: '#f97316' }} />
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Skills globales</h1>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--muted-foreground)', maxWidth: 560, lineHeight: 1.5 }}>
            Catálogo único para todos los agentes: perfiles de comportamiento y capacidades. Los cambios se reflejan en el editor de agentes al recargar.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => void load()} style={btnGhost}>
            <RefreshCw size={14} /> Actualizar
          </button>
          <button type="button" onClick={() => setReseedOpen(true)} style={btnGhost}>
            <RotateCcw size={14} /> Restaurar semilla
          </button>
          <button type="button" onClick={openCreate} style={btnPrimary}>
            <Plus size={14} /> Nueva skill
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {(['all', 'profile', 'capability'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            style={{
              ...btnGhost,
              fontWeight: filter === f ? 700 : 500,
              background: filter === f ? 'rgba(249,115,22,0.12)' : 'transparent',
              borderColor: filter === f ? 'rgba(249,115,22,0.35)' : 'var(--border)',
              color: filter === f ? '#f97316' : 'var(--foreground)',
            }}
          >
            {f === 'all' ? `Todas (${counts.all})` : f === 'profile' ? `Perfiles (${counts.profile})` : `Capacidades (${counts.capability})`}
          </button>
        ))}
        <span style={{ fontSize: 12, color: 'var(--muted-foreground)', alignSelf: 'center', marginLeft: 8 }}>
          {counts.enabled} visibles en editor de agentes
        </span>
      </div>

      {loading ? (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--muted-foreground)' }}>
          <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 12px' }} />
          Cargando catálogo…
        </div>
      ) : visible.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 12 }}>
          <p style={{ margin: '0 0 12px', color: 'var(--muted-foreground)' }}>Sin skills en esta categoría.</p>
          <button type="button" onClick={openCreate} style={btnPrimary}>Crear primera skill</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {visible.map((skill) => {
            const hidden = skill.catalogEnabled === false;
            return (
              <article
                key={skill.id}
                style={{
                  border: `1px solid ${hidden ? 'var(--border)' : `${skill.color}33`}`,
                  borderRadius: 12,
                  padding: '14px 16px',
                  background: hidden ? 'transparent' : `${skill.color}08`,
                  opacity: hidden ? 0.72 : 1,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 18 }}>{skill.icon}</span>
                      <strong style={{ fontSize: 14, color: skill.color }}>{skill.label}</strong>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                        background: skill.kind === 'profile' ? 'rgba(13,148,136,0.12)' : 'rgba(99,102,241,0.1)',
                        color: skill.kind === 'profile' ? '#0d9488' : '#6366f1',
                      }}>
                        {skill.kind === 'profile' ? 'Perfil' : 'Capacidad'}
                      </span>
                      {skill.category ? (
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                          background: 'rgba(100,116,139,0.12)', color: '#64748b',
                        }}>
                          {skill.category}
                        </span>
                      ) : null}
                      {hidden ? (
                        <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>Oculta</span>
                      ) : null}
                    </div>
                    <p style={{ margin: '0 0 4px', fontSize: 11, color: 'var(--muted-foreground)', fontFamily: 'monospace' }}>{skill.id}</p>
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--muted-foreground)', lineHeight: 1.45 }}>{skill.description}</p>
                    {Array.isArray(skill.tags) && skill.tags.length > 0 ? (
                      <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--muted-foreground)' }}>
                        tags: {skill.tags.join(', ')}
                      </p>
                    ) : null}
                    <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--muted-foreground)' }}>
                      Prioridad {skill.defaultPriority}
                      {skill.config.active_tools.length > 0 ? ` · ${skill.config.active_tools.length} MCP tool(s)` : ' · sin MCP'}
                      {typeof skill.config.llm_settings?.temperature === 'number'
                        ? ` · temp ${skill.config.llm_settings.temperature}`
                        : ''}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button type="button" title={hidden ? 'Mostrar en agentes' : 'Ocultar en agentes'} onClick={() => void toggleVisible(skill)} style={btnIcon}>
                      {hidden ? <Eye size={14} /> : <EyeOff size={14} />}
                    </button>
                    <button type="button" title="Editar" onClick={() => openEdit(skill)} style={btnIcon}>
                      <Pencil size={14} />
                    </button>
                    <button type="button" title="Eliminar" onClick={() => setDeleteTarget(skill)} style={{ ...btnIcon, color: '#ef4444' }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {editorOpen ? (
        <div
          role="dialog"
          aria-modal
          style={{
            position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
          onClick={() => { if (!saving) setEditorOpen(false); }}
        >
          <div
            style={{
              width: '100%', maxWidth: 560, maxHeight: '90vh', overflow: 'auto',
              background: 'var(--card)', borderRadius: 14, border: '1px solid var(--border)',
              padding: 20, boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: '0 0 16px', fontSize: 17, fontWeight: 800 }}>
              {editingId ? `Editar: ${editingId}` : 'Nueva skill'}
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {!editingId ? (
                <label style={lbl}>
                  ID (snake_case)
                  <input className="landing-input" style={inp} value={form.id} onChange={(e) => setForm((f) => ({ ...f, id: e.target.value }))} placeholder="mi_skill_nueva" />
                </label>
              ) : null}
              <label style={lbl}>
                Nombre
                <input className="landing-input" style={inp} value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} />
              </label>
              <label style={lbl}>
                Descripción
                <input className="landing-input" style={inp} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <label style={lbl}>
                  Tipo
                  <select className="landing-input" style={inp} value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as 'profile' | 'capability' }))}>
                    <option value="capability">Capacidad</option>
                    <option value="profile">Perfil</option>
                  </select>
                </label>
                <label style={lbl}>
                  Color
                  <input type="color" style={{ ...inp, padding: 4, height: 38 }} value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} />
                </label>
                <label style={lbl}>
                  Icono
                  <input className="landing-input" style={inp} value={form.icon} onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))} maxLength={4} />
                </label>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <label style={lbl}>
                  Categoría
                  <input className="landing-input" style={inp} value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} placeholder="ventas, soporte…" />
                </label>
                <label style={lbl}>
                  Tags (coma)
                  <input className="landing-input" style={inp} value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} placeholder="crm, rag, bant" />
                </label>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <label style={lbl}>
                  Prioridad
                  <input className="landing-input" style={inp} type="number" min={0} max={1000} value={form.defaultPriority} onChange={(e) => setForm((f) => ({ ...f, defaultPriority: Number(e.target.value) || 60 }))} />
                </label>
                <label style={{ ...lbl, flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 22 }}>
                  <input type="checkbox" checked={form.catalogEnabled} onChange={(e) => setForm((f) => ({ ...f, catalogEnabled: e.target.checked }))} />
                  Visible en editor de agentes
                </label>
              </div>
              <label style={lbl}>
                Extensión de prompt
                <textarea
                  className="landing-input"
                  style={{ ...inp, minHeight: 100, resize: 'vertical', fontFamily: 'inherit' }}
                  value={form.prompt_extension}
                  onChange={(e) => setForm((f) => ({ ...f, prompt_extension: e.target.value }))}
                />
              </label>
              <label style={lbl}>
                Tools MCP a activar (una por línea) — se unen al set del agente
                <textarea
                  className="landing-input"
                  style={{ ...inp, minHeight: 72, resize: 'vertical', fontFamily: 'monospace', fontSize: 11 }}
                  value={form.active_tools}
                  onChange={(e) => setForm((f) => ({ ...f, active_tools: e.target.value }))}
                  placeholder="mcp:webSearch:web_search"
                />
              </label>
              <label style={lbl}>
                Temperatura LLM (opcional, 0–2)
                <input className="landing-input" style={inp} value={form.temperature} onChange={(e) => setForm((f) => ({ ...f, temperature: e.target.value }))} placeholder="0.7" />
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button type="button" disabled={saving} onClick={() => setEditorOpen(false)} style={btnGhost}>Cancelar</button>
              <button type="button" disabled={saving} onClick={() => void saveSkill()} style={btnPrimary}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const lbl: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--muted-foreground)',
};

const btnPrimary: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '8px 14px',
  borderRadius: 10,
  border: 'none',
  background: '#f97316',
  color: '#fff',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
};

const btnGhost: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '8px 12px',
  borderRadius: 10,
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--foreground)',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
};

const btnIcon: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 34,
  height: 34,
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--background)',
  color: 'var(--foreground)',
  cursor: 'pointer',
};
