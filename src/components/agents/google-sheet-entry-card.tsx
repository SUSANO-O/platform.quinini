'use client';

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { Loader2, RefreshCw, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import {
  applyTabToUrl,
  extractGid,
  extractSpreadsheetId,
  sanitizeSheetName,
  type SheetEntry,
  type SheetTab,
} from '@/lib/agent-sheets';

type Props = {
  entry: SheetEntry;
  index: number;
  readOnly: boolean;
  inp: CSSProperties;
  onUpdate: (patch: Partial<SheetEntry>) => void;
  onRemove: () => void;
};

export function GoogleSheetEntryCard({
  entry,
  index,
  readOnly,
  inp,
  onUpdate,
  onRemove,
}: Props) {
  const [tabs, setTabs] = useState<SheetTab[]>([]);
  const [tabsLoading, setTabsLoading] = useState(false);
  const [tabsError, setTabsError] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const spreadsheetId = extractSpreadsheetId(entry.url);
  const selectedGid = entry.tabGid || extractGid(entry.url) || '';

  const loadTabs = useCallback(async () => {
    if (!spreadsheetId) {
      setTabsError('Pega primero la URL del archivo Google Sheets.');
      setTabs([]);
      return;
    }
    setTabsLoading(true);
    setTabsError('');
    try {
      const res = await fetch(`/api/sheets/tabs?url=${encodeURIComponent(entry.url)}`, {
        credentials: 'include',
      });
      const data = await res.json() as { tabs?: SheetTab[]; error?: string };
      if (!res.ok) {
        setTabs([]);
        setTabsError(typeof data.error === 'string' ? data.error : 'No se pudieron cargar las pestañas.');
        return;
      }
      const list = Array.isArray(data.tabs) ? data.tabs : [];
      setTabs(list);
      if (list.length === 0) {
        setTabsError('No se encontraron pestañas. ¿El archivo es público?');
      }
    } catch {
      setTabsError('Error de red al cargar pestañas.');
      setTabs([]);
    } finally {
      setTabsLoading(false);
    }
  }, [spreadsheetId, entry.url]);

  useEffect(() => {
    if (!spreadsheetId || readOnly) return;
    const t = setTimeout(() => { void loadTabs(); }, 400);
    return () => clearTimeout(t);
  }, [spreadsheetId, readOnly, loadTabs]);

  function handleUrlChange(url: string) {
    const id = extractSpreadsheetId(url);
    const gid = extractGid(url);
    onUpdate({
      url,
      ...(id ? {} : { tabGid: undefined, tabTitle: undefined }),
      ...(gid ? { tabGid: gid } : {}),
    });
  }

  function handleTabSelect(gid: string) {
    const tab = tabs.find((t) => t.gid === gid);
    if (!tab) return;
    const nextUrl = applyTabToUrl(entry.url, tab);
    const patch: Partial<SheetEntry> = {
      url: nextUrl,
      tabGid: tab.gid,
      tabTitle: tab.title,
    };
    if (!entry.name || /^sheet_\d+$/.test(entry.name)) {
      patch.name = sanitizeSheetName(tab.title);
    }
    if (!entry.range?.trim()) {
      patch.range = `${tab.title}!A:Z`;
    }
    onUpdate(patch);
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, background: 'var(--muted)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted-foreground)' }}>
          MATRIZ #{index + 1}
          {entry.tabTitle ? (
            <span style={{ marginLeft: 8, color: 'var(--foreground)', fontWeight: 600 }}>
              · {entry.tabTitle}
            </span>
          ) : null}
        </span>
        {!readOnly ? (
          <button
            type="button"
            onClick={onRemove}
            title="Eliminar esta matriz"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '5px 10px',
              borderRadius: 7,
              border: '1px solid rgba(239,68,68,0.35)',
              background: 'rgba(239,68,68,0.06)',
              color: '#ef4444',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Trash2 size={11} />
          </button>
        ) : null}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 4 }}>
            URL del archivo Google Sheets <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <p style={{ fontSize: 10, color: 'var(--muted-foreground)', margin: '0 0 6px', lineHeight: 1.45 }}>
            Pega el enlace del <strong>archivo</strong> (no importa en qué pestaña estés). Debe ser público: «Cualquiera con el enlace puede ver».
          </p>
          <input
            className="landing-input"
            style={inp}
            type="text"
            value={entry.url}
            onChange={(e) => handleUrlChange(e.target.value)}
            placeholder="https://docs.google.com/spreadsheets/d/.../edit"
            disabled={readOnly}
          />
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <label style={{ fontSize: 11, fontWeight: 600 }}>
              Pestaña (hoja dentro del archivo) <span style={{ color: '#ef4444' }}>*</span>
            </label>
            {!readOnly ? (
              <button
                type="button"
                onClick={() => void loadTabs()}
                disabled={tabsLoading || !spreadsheetId}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 10,
                  fontWeight: 600,
                  color: 'var(--primary)',
                  background: 'none',
                  border: 'none',
                  cursor: tabsLoading || !spreadsheetId ? 'not-allowed' : 'pointer',
                  opacity: tabsLoading || !spreadsheetId ? 0.5 : 1,
                }}
              >
                {tabsLoading ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                {tabsLoading ? 'Cargando…' : 'Actualizar lista'}
              </button>
            ) : null}
          </div>
          {tabsError ? (
            <p style={{ fontSize: 10, color: '#d97706', margin: '0 0 6px' }}>{tabsError}</p>
          ) : null}
          <select
            className="landing-input"
            style={{ ...inp, cursor: readOnly ? 'default' : 'pointer' }}
            value={selectedGid}
            onChange={(e) => handleTabSelect(e.target.value)}
            disabled={readOnly || tabs.length === 0}
          >
            <option value="">
              {tabsLoading ? 'Detectando pestañas…' : tabs.length ? '— Elige una pestaña —' : 'Pega la URL para ver pestañas'}
            </option>
            {tabs.map((tab) => (
              <option key={tab.gid} value={tab.gid}>
                {tab.title}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 4 }}>
            ¿Cuándo debe consultar esta matriz? <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <textarea
            className="landing-input"
            style={{ ...inp, minHeight: 56, resize: 'vertical', fontFamily: 'inherit' }}
            value={entry.description}
            onChange={(e) => onUpdate({ description: e.target.value })}
            placeholder="Ej: Cuando el usuario pregunte por inventario, repuestos, stock o precios de productos."
            disabled={readOnly}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 4 }}>
            ¿Qué necesitas de esta matriz? <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <p style={{ fontSize: 10, color: 'var(--muted-foreground)', margin: '0 0 6px', lineHeight: 1.45 }}>
            Sé específico: columnas clave, filtros y qué debe devolver el agente. En hojas grandes el agente usa{' '}
            <strong>búsqueda por término</strong> (no lee millones de filas).
          </p>
          <textarea
            className="landing-input"
            style={{ ...inp, minHeight: 72, resize: 'vertical', fontFamily: 'inherit' }}
            value={entry.matrixNeed ?? ''}
            onChange={(e) => onUpdate({ matrixNeed: e.target.value })}
            placeholder={'Ej: Columnas SKU, nombre, stock y precio. Buscar por nombre de repuesto y responder disponibilidad y precio. Si no hay stock, sugerir alternativas de la misma categoría.'}
            disabled={readOnly}
          />
        </div>

        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            alignSelf: 'flex-start',
            fontSize: 10,
            fontWeight: 600,
            color: 'var(--muted-foreground)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          {showAdvanced ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          Opciones avanzadas
        </button>

        {showAdvanced ? (
          <>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 4 }}>
                Nombre interno de la herramienta
                <span style={{ marginLeft: 6, color: 'var(--muted-foreground)', fontWeight: 400 }}>
                  (snake_case — se autogenera al elegir pestaña)
                </span>
              </label>
              <input
                className="landing-input"
                style={inp}
                type="text"
                value={entry.name}
                onChange={(e) => onUpdate({ name: e.target.value })}
                placeholder="inventario_repuestos"
                disabled={readOnly}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 4 }}>
                Rango de celdas (opcional)
              </label>
              <input
                className="landing-input"
                style={inp}
                type="text"
                value={entry.range ?? ''}
                onChange={(e) => onUpdate({ range: e.target.value })}
                placeholder="Inventario!A1:F500"
                disabled={readOnly}
              />
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
