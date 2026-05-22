'use client';

import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Scissors, Sliders, Sparkles, X, Check, Loader2, Minus, Plus, RotateCcw } from 'lucide-react';
import { compressCanvasToDataUrl, computeAvatarCropRect } from '@/lib/avatar-export';
import { USER_AVATAR_MAX_DATA_URL_LENGTH } from '@/lib/user-profile';

type Tab = 'crop' | 'filters' | 'ai';

interface AgentContext {
  name?: string;
  purpose?: string;
  industry?: string;
}

interface AvatarEditorProps {
  currentUrl: string;
  agentContext?: AgentContext;
  onResult: (url: string) => void;
  /** Modo controlado: abre/cierra el modal desde fuera */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Oculta el botón "Editar · Retocar · Generar AI" */
  hideTrigger?: boolean;
  /** Pestañas visibles (por defecto: todas) */
  visibleTabs?: Tab[];
  title?: string;
  cropHint?: string;
  applyLabel?: string;
  /** Tamaño del canvas de exportación (px) */
  exportSize?: number;
  maxExportLength?: number;
}

const DEFAULT_EXPORT_SIZE = 200;

type TabDef = { id: Tab; label: string; Icon: typeof Scissors };

const ALL_TAB_DEFS: TabDef[] = [
  { id: 'crop', label: 'Recortar', Icon: Scissors },
  { id: 'filters', label: 'Retocar', Icon: Sliders },
  { id: 'ai', label: 'Generar AI', Icon: Sparkles },
];

function Slider({
  label, value, min, max, unit = '%', onChange,
}: {
  label: string; value: number; min: number; max: number; unit?: string; onChange: (v: number) => void;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontSize: 11, color: 'var(--muted-foreground)', fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 700 }}>{value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={1} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: '#6366f1', cursor: 'pointer' }} />
    </div>
  );
}

export function AvatarEditor({
  currentUrl,
  agentContext,
  onResult,
  open: openProp,
  onOpenChange,
  hideTrigger = false,
  visibleTabs,
  title = 'Editor de avatar',
  cropHint = 'Arrastra para reposicionar',
  applyLabel = 'Aplicar',
  exportSize = DEFAULT_EXPORT_SIZE,
  maxExportLength = USER_AVATAR_MAX_DATA_URL_LENGTH,
}: AvatarEditorProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : internalOpen;

  const setOpen = (next: boolean) => {
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  };

  const allowedTabs: Tab[] = visibleTabs ?? ['crop', 'filters', 'ai'];
  const tabDefs = ALL_TAB_DEFS.filter((t) => allowedTabs.includes(t.id));

  const [mounted, setMounted] = useState(false);
  const [tab, setTab]         = useState<Tab>(allowedTabs[0] ?? 'crop');

  // Crop / pan
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [zoom, setZoom]       = useState(1);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef({ sx: 0, sy: 0, sox: 0, soy: 0 });

  // Img load state (for the <img> element)
  const [imgStatus, setImgStatus] = useState<'loading' | 'ok' | 'error'>('loading');

  // Filters
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast]     = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [hue, setHue]               = useState(0);

  // AI
  const [aiPrompt, setAiPrompt]         = useState('');
  const [generating, setGenerating]     = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState('');
  const [aiError, setAiError]           = useState('');
  const aiRef = useRef<HTMLTextAreaElement>(null);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [busyExport, setBusyExport] = useState(false);
  const [exportError, setExportError] = useState('');

  const activeUrl = generatedUrl || currentUrl;

  useEffect(() => { setMounted(true); }, []);

  useLayoutEffect(() => {
    if (!open) return;
    setOffsetX(0); setOffsetY(0); setZoom(1);
    setImgStatus('loading');
    setNaturalSize(null);
    setBrightness(100); setContrast(100); setSaturation(100); setHue(0);
    setGeneratedUrl(''); setAiError(''); setAiPrompt(''); setExportError('');
    setTab(allowedTabs[0] ?? 'crop');
  }, [open, currentUrl]);

  // Focus AI textarea
  useEffect(() => {
    if (tab === 'ai') setTimeout(() => aiRef.current?.focus(), 50);
  }, [tab]);

  // Drag with pointer capture
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    dragRef.current = { sx: e.clientX, sy: e.clientY, sox: offsetX, soy: offsetY };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setOffsetX(dragRef.current.sox + (e.clientX - dragRef.current.sx));
    setOffsetY(dragRef.current.soy + (e.clientY - dragRef.current.sy));
  };
  const onPointerUp = () => setDragging(false);

  // Export: try canvas (needs CORS), fall back to plain URL
  const applyEdit = async () => {
    if (!activeUrl) { setOpen(false); return; }
    setBusyExport(true);
    setExportError('');
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.crossOrigin = 'anonymous';
        i.onload  = () => resolve(i);
        i.onerror = () => reject(new Error('cors'));
        i.src = activeUrl.startsWith('data:')
          ? activeUrl
          : activeUrl + (activeUrl.includes('?') ? '&' : '?') + '_cb=' + Date.now();
      });

      const canvas = document.createElement('canvas');
      canvas.width = exportSize;
      canvas.height = exportSize;
      const ctx = canvas.getContext('2d')!;

      // Circular clip
      ctx.beginPath();
      ctx.arc(exportSize / 2, exportSize / 2, exportSize / 2, 0, Math.PI * 2);
      ctx.clip();

      // Filters
      ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) hue-rotate(${hue}deg)`;

      // Position + zoom (misma geometría que el preview)
      const offsetScale = exportSize / previewSize;
      const rect = computeAvatarCropRect(
        img.naturalWidth,
        img.naturalHeight,
        exportSize,
        zoom,
        offsetX * offsetScale,
        offsetY * offsetScale,
      );
      ctx.drawImage(img, rect.left, rect.top, rect.width, rect.height);

      onResult(compressCanvasToDataUrl(canvas, maxExportLength));
      setOpen(false);
    } catch (err) {
      if (err instanceof Error && err.message === 'cors') {
        onResult(activeUrl);
        setOpen(false);
      } else {
        setExportError(err instanceof Error ? err.message : 'No se pudo exportar la imagen.');
      }
    } finally {
      setBusyExport(false);
    }
  };

  const generateAi = async () => {
    if (!aiPrompt.trim() || generating) return;
    setGenerating(true); setAiError('');
    try {
      const res  = await fetch('/api/ai/generate-avatar', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ description: aiPrompt.trim(), agentContext: agentContext ?? {} }),
      });
      const json = await res.json() as { url?: string; error?: string };
      if (!res.ok || !json.url) throw new Error(json.error ?? 'No se generó imagen');
      setGeneratedUrl(json.url);
      setOffsetX(0); setOffsetY(0); setZoom(1);
      setImgStatus('loading');
      setTab('crop');
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Error generando avatar');
    } finally {
      setGenerating(false);
    }
  };

  const cssFilter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) hue-rotate(${hue}deg)`;
  const previewSize = DEFAULT_EXPORT_SIZE;
  const previewRect = naturalSize
    ? computeAvatarCropRect(naturalSize.w, naturalSize.h, previewSize, zoom, offsetX, offsetY)
    : null;

  if (!mounted) return null;

  const modal = open ? createPortal(
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.52)', padding: 16 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
    >
      <div
        style={{ width: '100%', maxWidth: 420, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 20, boxShadow: '0 24px 72px rgba(0,0,0,.3)', overflow: 'hidden' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(99,102,241,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Scissors size={13} style={{ color: '#6366f1' }} />
            </div>
            <span style={{ fontSize: 14, fontWeight: 700 }}>{title}</span>
          </div>
          <button type="button" onClick={() => setOpen(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--muted-foreground)', padding: 4, borderRadius: 6 }}>
            <X size={15} />
          </button>
        </div>

        {/* Tabs */}
        {tabDefs.length > 1 ? (
        <div style={{ display: 'flex', background: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
          {tabDefs.map(({ id, label, Icon }) => (
            <button key={id} type="button" onClick={() => setTab(id)}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                padding: '9px 6px', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700,
                background: tab === id ? 'var(--card)' : 'transparent',
                color: tab === id ? '#6366f1' : 'var(--muted-foreground)',
                borderBottom: tab === id ? '2px solid #6366f1' : '2px solid transparent',
                transition: 'all 0.15s',
              }}>
              <Icon size={11} /> {label}
            </button>
          ))}
        </div>
        ) : null}

        {/* Body */}
        <div style={{ padding: 20 }}>
          {exportError ? (
            <p style={{ fontSize: 12, color: '#ef4444', margin: '0 0 12px', lineHeight: 1.45 }}>{exportError}</p>
          ) : null}

          {/* Crop + Filters — shared <img> preview (no canvas, no CORS issue) */}
          {(tab === 'crop' || tab === 'filters') && (
            <>
              {/* Circle preview */}
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
                <div
                  style={{
                    width: previewSize, height: previewSize, borderRadius: '50%',
                    overflow: 'hidden', border: '3px solid var(--border)',
                    background: 'var(--muted)', position: 'relative',
                    cursor: tab === 'crop' ? (dragging ? 'grabbing' : 'grab') : 'default',
                    userSelect: 'none',
                  }}
                  onPointerDown={tab === 'crop' ? onPointerDown : undefined}
                  onPointerMove={tab === 'crop' ? onPointerMove : undefined}
                  onPointerUp={tab === 'crop' ? onPointerUp : undefined}
                >
                  {/* No image yet — guide user to AI tab */}
                  {!activeUrl && (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, textAlign: 'center' }}>
                      <span style={{ fontSize: 28 }}>🖼️</span>
                      <span style={{ fontSize: 11, color: 'var(--muted-foreground)', lineHeight: 1.4 }}>
                        Sin imagen.<br />Genera una con AI o pega una URL.
                      </span>
                    </div>
                  )}
                  {/* Loading spinner — only when there IS a URL but it hasn't loaded yet */}
                  {activeUrl && imgStatus === 'loading' && (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      <Loader2 size={22} style={{ color: 'var(--muted-foreground)', animation: 'spin .8s linear infinite' }} />
                    </div>
                  )}
                  {imgStatus === 'error' && (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 14, textAlign: 'center' }}>
                      <span style={{ fontSize: 20 }}>🖼️</span>
                      <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
                        No se pudo cargar.<br />Pega una URL válida.
                      </span>
                    </div>
                  )}

                  {/* The actual image — CSS transform handles pan/zoom/filter */}
                  {activeUrl && (
                    <img
                      key={activeUrl.startsWith('data:') ? activeUrl.slice(0, 40) : activeUrl}
                      src={activeUrl}
                      alt="Avatar preview"
                      referrerPolicy="no-referrer"
                      onLoad={(e) => {
                        setNaturalSize({
                          w: e.currentTarget.naturalWidth,
                          h: e.currentTarget.naturalHeight,
                        });
                        setImgStatus('ok');
                      }}
                      onError={() => {
                        setNaturalSize(null);
                        setImgStatus('error');
                      }}
                      style={{
                        position: 'absolute',
                        width: previewRect?.width ?? previewSize,
                        height: previewRect?.height ?? previewSize,
                        left: previewRect?.left ?? 0,
                        top: previewRect?.top ?? 0,
                        maxWidth: 'none',
                        maxHeight: 'none',
                        filter: cssFilter,
                        pointerEvents: 'none',
                        userSelect: 'none',
                        opacity: imgStatus === 'ok' ? 1 : 0,
                        transition: 'opacity .2s',
                      }}
                    />
                  )}
                  <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                </div>
              </div>

              {tab === 'crop' && (
                <>
                  <p style={{ fontSize: 11, color: 'var(--muted-foreground)', textAlign: 'center', margin: '0 0 14px' }}>
                    {cropHint}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button type="button" onClick={() => setZoom(z => Math.max(0.5, +(z - 0.1).toFixed(2)))}
                      style={{ border: '1px solid var(--border)', background: 'var(--background)', borderRadius: 6, width: 28, height: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Minus size={12} />
                    </button>
                    <input type="range" min={0.5} max={4} step={0.05} value={zoom}
                      onChange={(e) => setZoom(Number(e.target.value))}
                      style={{ flex: 1, accentColor: '#6366f1' }} />
                    <button type="button" onClick={() => setZoom(z => Math.min(4, +(z + 0.1).toFixed(2)))}
                      style={{ border: '1px solid var(--border)', background: 'var(--background)', borderRadius: 6, width: 28, height: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Plus size={12} />
                    </button>
                    <span style={{ fontSize: 11, fontWeight: 700, minWidth: 38, textAlign: 'right' }}>{Math.round(zoom * 100)}%</span>
                  </div>
                  <button type="button" onClick={() => { setOffsetX(0); setOffsetY(0); setZoom(1); }}
                    style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--muted-foreground)', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}>
                    <RotateCcw size={10} /> Restablecer
                  </button>
                </>
              )}

              {tab === 'filters' && (
                <div style={{ marginTop: 4 }}>
                  <Slider label="Brillo"     value={brightness} min={0} max={200} onChange={setBrightness} />
                  <Slider label="Contraste"  value={contrast}   min={0} max={200} onChange={setContrast} />
                  <Slider label="Saturación" value={saturation} min={0} max={200} onChange={setSaturation} />
                  <Slider label="Tono (hue)" value={hue}        min={0} max={360} unit="°" onChange={setHue} />
                  <button type="button" onClick={() => { setBrightness(100); setContrast(100); setSaturation(100); setHue(0); }}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--muted-foreground)', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}>
                    <RotateCcw size={10} /> Restablecer filtros
                  </button>
                </div>
              )}
            </>
          )}

          {/* AI tab */}
          {tab === 'ai' && (
            <div>
              <p style={{ fontSize: 12, color: 'var(--muted-foreground)', marginBottom: 12, lineHeight: 1.5 }}>
                Describe el avatar. El modelo genera un prompt en inglés optimizado y produce la imagen vía Flux AI.
              </p>
              <textarea
                ref={aiRef}
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && aiPrompt.trim()) void generateAi(); }}
                placeholder="Ej: Profesora de inglés, mujer, sonriente, fondo blanco, estilo profesional..."
                rows={3}
                style={{
                  width: '100%', resize: 'vertical', padding: '10px 12px',
                  border: '1.5px solid var(--border)', borderRadius: 10,
                  background: 'var(--background)', color: 'var(--foreground)',
                  fontSize: 13, lineHeight: 1.5, boxSizing: 'border-box',
                  outline: 'none', fontFamily: 'inherit',
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = '#6366f1'; }}
                onBlur={(e)  => { e.currentTarget.style.borderColor = 'var(--border)'; }}
              />
              {aiError && <p style={{ fontSize: 12, color: '#ef4444', margin: '8px 0 0' }}>{aiError}</p>}
              {generatedUrl && (
                <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)' }}>
                  <img src={generatedUrl} alt="" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border)', flexShrink: 0 }} />
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 700, margin: '0 0 3px', color: '#16a34a' }}>✓ URL generada</p>
                    <button type="button" onClick={() => setTab('crop')}
                      style={{ fontSize: 11, color: '#6366f1', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}>
                      Abrir en editor →
                    </button>
                  </div>
                </div>
              )}
              <p style={{ fontSize: 10, color: 'var(--muted-foreground)', marginTop: 10 }}>⌘ + Enter para generar · La imagen puede tardar ~20s</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, padding: '12px 18px', borderTop: '1px solid var(--border)', background: 'var(--muted)' }}>
          <button type="button" onClick={() => setOpen(false)}
            style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--background)', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
            Cancelar
          </button>
          {tab === 'ai' ? (
            <button type="button" onClick={() => void generateAi()} disabled={!aiPrompt.trim() || generating}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 8, border: 'none',
                background: aiPrompt.trim() && !generating ? '#6366f1' : 'var(--border)',
                color:      aiPrompt.trim() && !generating ? '#fff'    : 'var(--muted-foreground)',
                cursor: aiPrompt.trim() && !generating ? 'pointer' : 'not-allowed',
                fontSize: 13, fontWeight: 600, transition: 'all .15s',
              }}>
              {generating ? <Loader2 size={13} style={{ animation: 'spin .8s linear infinite' }} /> : <Sparkles size={13} />}
              {generating ? 'Generando...' : 'Generar'}
            </button>
          ) : (
            <button type="button" onClick={() => void applyEdit()} disabled={busyExport}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 8, border: 'none', background: busyExport ? 'var(--border)' : '#6366f1', color: '#fff', cursor: busyExport ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600 }}>
              {busyExport ? <Loader2 size={13} style={{ animation: 'spin .8s linear infinite' }} /> : <Check size={13} />}
              {busyExport ? 'Guardando…' : applyLabel}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  ) : null;

  return (
    <>
      {!hideTrigger ? (
      <button
        type="button" onClick={() => setOpen(true)}
        style={{ marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: '#6366f1', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, opacity: 0.85, transition: 'opacity .15s' }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.85'; }}
      >
        <Scissors size={11} /> Editar · Retocar · Generar AI
      </button>
      ) : null}
      {modal}
    </>
  );
}
