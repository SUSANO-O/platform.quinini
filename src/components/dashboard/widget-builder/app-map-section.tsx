'use client';

/**
 * Sección "Mapa de la app" del editor de widget: vistas de la web donde vive el widget (ruta,
 * nombre, descripción, pestañas). Guarda por su cuenta en /api/widgets/[id]/app-map (no forma
 * parte del PATCH del widget) e importa/exporta CSV o JSON. La pestaña "Descubiertas" lista las
 * páginas que visitan los usuarios reales para añadirlas con un clic.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Plus, Trash2 } from '@/components/ui/icons';
import { WIDGET_BUILDER_UI_ACCENT } from '@/lib/widget-builder';
import type { AppMapEntry, AppMapTab } from '@/lib/widget-app-map';
import { WidgetBuilderHint, WidgetBuilderInput, WidgetBuilderSection } from './ui';

type DiscoveredPage = {
  path: string;
  paramKeys: string[];
  hashes: string[];
  visits: number;
  lastSeenAt: string | null;
  inMap: boolean;
  missingTabs: string[];
};

const btn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', fontSize: 12.5,
  borderRadius: 8, border: '1px solid var(--border)', background: 'var(--background)', cursor: 'pointer',
  color: 'var(--foreground)',
};
const btnPrimary: React.CSSProperties = { ...btn, background: WIDGET_BUILDER_UI_ACCENT, borderColor: WIDGET_BUILDER_UI_ACCENT, color: '#fff' };
const iconBtn: React.CSSProperties = { ...btn, padding: '4px 6px' };
const muted: React.CSSProperties = { fontSize: 12, color: 'var(--muted-foreground)' };

/** Nombre sugerido a partir de la ruta: /views/visorDisp.php → "visorDisp". */
function suggestName(path: string): string {
  const last = path.split('/').filter(Boolean).pop() ?? path;
  return last.replace(/\.[a-z0-9]+$/i, '') || path;
}

export function WidgetBuilderAppMapSection({ widgetId }: { widgetId: string | null | undefined }) {
  const [view, setView] = useState<'map' | 'discovered'>('map');
  const [map, setMap] = useState<AppMapEntry[]>([]);
  const [discovered, setDiscovered] = useState<DiscoveredPage[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string; errors?: string[] } | null>(null);
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const base = widgetId ? `/api/widgets/${widgetId}/app-map` : '';

  const load = useCallback(async () => {
    if (!base) return;
    setLoading(true);
    try {
      const [m, d] = await Promise.all([
        fetch(base, { cache: 'no-store' }).then((r) => r.json()),
        fetch(`${base}/discovered`, { cache: 'no-store' }).then((r) => r.json()),
      ]);
      setMap(Array.isArray(m.appMap) ? m.appMap : []);
      setDiscovered(Array.isArray(d.pages) ? d.pages : []);
      setDirty(false);
    } catch {
      setMsg({ kind: 'err', text: 'No se pudo cargar el mapa.' });
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => { void load(); }, [load]);

  async function save(body: { appMap: AppMapEntry[] } | { csv: string }) {
    setSaving(true);
    setMsg(null);
    try {
      const r = await fetch(base, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) {
        setMsg({ kind: 'err', text: j.error || 'No se pudo guardar.', errors: j.errors });
        return;
      }
      setMap(j.appMap);
      setDirty(false);
      const errs: string[] = j.errors ?? [];
      setMsg({
        kind: errs.length ? 'err' : 'ok',
        text: errs.length ? `Guardado con ${errs.length} fila(s) descartada(s).` : `Mapa guardado (${j.appMap.length} vistas). El agente lo usa en ≤ 1 min.`,
        errors: errs,
      });
      const d = await fetch(`${base}/discovered`, { cache: 'no-store' }).then((x) => x.json()).catch(() => null);
      if (d?.pages) setDiscovered(d.pages);
    } catch {
      setMsg({ kind: 'err', text: 'No se pudo guardar.' });
    } finally {
      setSaving(false);
    }
  }

  async function onImport(file: File) {
    const text = await file.text();
    if (/\.json$/i.test(file.name) || text.trim().startsWith('[')) {
      try {
        const parsed = JSON.parse(text);
        await save({ appMap: Array.isArray(parsed) ? parsed : parsed.appMap });
      } catch {
        setMsg({ kind: 'err', text: 'El JSON no es válido.' });
      }
    } else {
      await save({ csv: text });
    }
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(map, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'mapa-app.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const edit = (i: number, patch: Partial<AppMapEntry>) => {
    setMap((p) => p.map((e, j) => (j === i ? { ...e, ...patch } : e)));
    setDirty(true);
  };
  const editTab = (i: number, t: number, patch: Partial<AppMapTab>) =>
    edit(i, { tabs: (map[i].tabs ?? []).map((x, k) => (k === t ? { ...x, ...patch } : x)) });

  function addFromDiscovered(p: DiscoveredPage) {
    const idx = map.findIndex((e) => e.path === p.path);
    if (idx >= 0) {
      const tabs = [...(map[idx].tabs ?? []), ...p.missingTabs.map((h) => ({ hash: h, name: h }))];
      edit(idx, { tabs });
      setOpen((o) => ({ ...o, [idx]: true }));
    } else {
      setMap((m) => [...m, { path: p.path, name: suggestName(p.path), tabs: p.hashes.map((h) => ({ hash: h, name: h })) }]);
      setDirty(true);
      setOpen((o) => ({ ...o, [map.length]: true }));
    }
    setDiscovered((d) => d.map((x) => (x.path === p.path ? { ...x, inMap: true, missingTabs: [] } : x)));
    setView('map');
  }

  if (!widgetId) {
    return (
      <WidgetBuilderSection title="Mapa de la app" description="Vistas de tu web para que el agente sepa dónde está el cliente y pueda llevarlo.">
        <p style={muted}>Guarda el widget primero; después podrás configurar su mapa aquí.</p>
      </WidgetBuilderSection>
    );
  }

  const pending = discovered.filter((p) => !p.inMap || p.missingTabs.length).length;

  return (
    <WidgetBuilderSection
      title="Mapa de la app"
      description="Las vistas de tu web: nombre, para qué sirve cada una y sus pestañas (#). El agente las usa para decir dónde está el cliente y llevarlo a otra vista. No hace falta escribirlas en el prompt."
    >
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        <button type="button" style={view === 'map' ? btnPrimary : btn} onClick={() => setView('map')}>
          Mapa ({map.length})
        </button>
        <button type="button" style={view === 'discovered' ? btnPrimary : btn} onClick={() => setView('discovered')}>
          Descubiertas{pending ? ` · ${pending} nuevas` : ''}
        </button>
        <span style={{ flex: 1 }} />
        <button type="button" style={btn} onClick={() => fileRef.current?.click()} disabled={saving}>Importar CSV/JSON</button>
        <a style={btn} href={`${base}?format=csv`}>Exportar CSV</a>
        <button type="button" style={btn} onClick={exportJson}>Exportar JSON</button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.json,text/csv,application/json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void onImport(f);
          }}
        />
      </div>

      {loading ? (
        <p style={muted}><Loader2 size={13} className="animate-spin" /> Cargando…</p>
      ) : view === 'map' ? (
        <div style={{ display: 'grid', gap: 10 }}>
          {!map.length ? (
            <WidgetBuilderHint>
              Sin vistas todavía. Añádelas a mano, importa un CSV (columnas <code>path, name, description, tab_hash,
              tab_name, tab_description</code>) o revisa “Descubiertas”.
            </WidgetBuilderHint>
          ) : null}
          {map.map((e, i) => (
            <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10, display: 'grid', gap: 6 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) auto', gap: 6 }}>
                <WidgetBuilderInput value={e.path} placeholder="/views/pagina.php" onChange={(ev) => edit(i, { path: ev.target.value })} />
                <WidgetBuilderInput value={e.name} placeholder="Nombre de la vista" onChange={(ev) => edit(i, { name: ev.target.value })} />
                <button type="button" style={iconBtn} aria-label="Quitar vista" onClick={() => { setMap((p) => p.filter((_, j) => j !== i)); setDirty(true); }}>
                  <Trash2 size={13} />
                </button>
              </div>
              <WidgetBuilderInput value={e.description ?? ''} placeholder="Para qué sirve (lo que el agente dirá al llegar)" onChange={(ev) => edit(i, { description: ev.target.value })} />
              <button type="button" style={{ ...btn, justifySelf: 'start', border: 'none', padding: 0, background: 'none' }} onClick={() => setOpen((o) => ({ ...o, [i]: !o[i] }))}>
                {open[i] ? '▾' : '▸'} Pestañas ({e.tabs?.length ?? 0})
              </button>
              {open[i] ? (
                <div style={{ display: 'grid', gap: 6, paddingLeft: 12 }}>
                  {(e.tabs ?? []).map((t, k) => (
                    <div key={k} style={{ display: 'grid', gridTemplateColumns: '120px minmax(0,1fr) minmax(0,2fr) auto', gap: 6 }}>
                      <WidgetBuilderInput value={t.hash} placeholder="#ancla" onChange={(ev) => editTab(i, k, { hash: ev.target.value.replace(/^#/, '') })} />
                      <WidgetBuilderInput value={t.name} placeholder="Nombre" onChange={(ev) => editTab(i, k, { name: ev.target.value })} />
                      <WidgetBuilderInput value={t.description ?? ''} placeholder="Qué muestra" onChange={(ev) => editTab(i, k, { description: ev.target.value })} />
                      <button type="button" style={iconBtn} aria-label="Quitar pestaña" onClick={() => edit(i, { tabs: (e.tabs ?? []).filter((_, x) => x !== k) })}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                  <button type="button" style={{ ...btn, justifySelf: 'start' }} onClick={() => edit(i, { tabs: [...(e.tabs ?? []), { hash: '', name: '' }] })}>
                    <Plus size={13} /> Pestaña
                  </button>
                </div>
              ) : null}
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button type="button" style={btn} onClick={() => { setMap((m) => [...m, { path: '', name: '' }]); setDirty(true); }}>
              <Plus size={13} /> Vista
            </button>
            <span style={{ flex: 1 }} />
            {dirty ? <span style={muted}>Cambios sin guardar</span> : null}
            <button type="button" style={btnPrimary} disabled={saving || !dirty} onClick={() => void save({ appMap: map })}>
              {saving ? <Loader2 size={13} className="animate-spin" /> : null} Guardar mapa
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 6 }}>
          <WidgetBuilderHint>
            Páginas que visitan tus usuarios con el widget cargado. Solo se guarda la ruta, el nombre de los parámetros y
            la pestaña (#) — nunca valores ni datos personales.
          </WidgetBuilderHint>
          {!discovered.length ? <p style={muted}>Aún no hay visitas registradas.</p> : null}
          {discovered.map((p) => (
            <div key={p.path} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 8, alignItems: 'center', borderBottom: '1px solid var(--border)', padding: '6px 0' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontFamily: 'var(--font-mono, monospace)', overflowWrap: 'anywhere' }}>{p.path}</div>
                <div style={muted}>
                  {p.visits} visitas
                  {p.paramKeys.length ? ` · parámetros: ${p.paramKeys.join(', ')}` : ''}
                  {p.hashes.length ? ` · pestañas: ${p.hashes.map((h) => `#${h}`).join(' ')}` : ''}
                </div>
              </div>
              {!p.inMap ? (
                <button type="button" style={btnPrimary} onClick={() => addFromDiscovered(p)}><Plus size={13} /> Añadir</button>
              ) : p.missingTabs.length ? (
                <button type="button" style={btn} onClick={() => addFromDiscovered(p)}><Plus size={13} /> {p.missingTabs.length} pestañas</button>
              ) : (
                <span style={muted}>En el mapa</span>
              )}
            </div>
          ))}
        </div>
      )}

      {msg ? (
        <div style={{ marginTop: 10, fontSize: 12.5, color: msg.kind === 'ok' ? 'var(--success, #15803d)' : 'var(--destructive, #b91c1c)' }}>
          {msg.text}
          {msg.errors?.length ? (
            <ul style={{ margin: '4px 0 0 16px' }}>{msg.errors.slice(0, 10).map((e) => <li key={e}>{e}</li>)}</ul>
          ) : null}
        </div>
      ) : null}
    </WidgetBuilderSection>
  );
}
