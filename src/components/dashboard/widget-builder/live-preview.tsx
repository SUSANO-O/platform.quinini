'use client';

/**
 * Vista previa REAL del widget en el editor: un iframe que carga el mismo widget.js que se publica,
 * en modo `preview` (sin servidor, sin guardar nada, conversación de ejemplo). Cada cambio de la
 * configuración se reenvía por postMessage y el widget se vuelve a montar al instante.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { WidgetConfig, WidgetShortcut } from '@/lib/widget-builder';

export type PreviewDevice = 'desktop' | 'mobile';
export type PreviewBackdrop = 'site' | 'light' | 'dark';

const DEMO_MESSAGES = [
  { role: 'user', content: '¿Dónde está mi vehículo ahora?' },
  {
    role: 'model',
    content: 'Tu moto **ABC12D** está en Chapinero, Bogotá, detenida. Último reporte hace 3 minutos.\n\n¿Quieres que te lleve al mapa?',
  },
];

/** Página de mentira detrás del widget: da contexto sin distraer. */
function siteMock(backdrop: PreviewBackdrop): string {
  if (backdrop === 'dark') return '<div class="mock mock--dark"></div>';
  if (backdrop === 'light') return '<div class="mock mock--light"></div>';
  return `<div class="mock">
    <header><span class="logo"></span><nav><i></i><i></i><i></i><i></i></nav></header>
    <section class="hero"><h1></h1><p></p><p class="short"></p><span class="cta"></span></section>
    <section class="cards"><div></div><div></div><div></div></section>
  </div>`;
}

function srcDoc(origin: string, backdrop: PreviewBackdrop): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  html,body{margin:0;height:100%;font-family:system-ui,sans-serif;overflow:hidden}
  .mock{min-height:100%;background:#f7f8fa;padding:0 0 40px}
  .mock--light{background:#f4f5f7}.mock--dark{background:#0f1115}
  .mock header{display:flex;align-items:center;justify-content:space-between;padding:18px 32px;background:#fff;border-bottom:1px solid #eceef2}
  .mock .logo{width:96px;height:18px;border-radius:6px;background:#dfe3ea}
  .mock nav{display:flex;gap:18px}.mock nav i{width:54px;height:10px;border-radius:5px;background:#e6e9ee}
  .mock .hero{padding:56px 32px 28px;max-width:560px}
  .mock h1{height:26px;width:78%;border-radius:8px;background:#e1e5eb;margin:0 0 18px}
  .mock p{height:12px;width:92%;border-radius:6px;background:#e9ecf1;margin:0 0 10px}.mock p.short{width:64%}
  .mock .cta{display:inline-block;margin-top:14px;width:132px;height:36px;border-radius:10px;background:#e1e5eb}
  .mock .cards{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;padding:12px 32px}
  .mock .cards div{height:120px;border-radius:14px;background:#fff;border:1px solid #eceef2}
</style></head><body>${siteMock(backdrop)}
<script src="${origin}/widget.js?preview=1"></script>
<script>
  var inst = null;
  function mount(cfg) {
    try { if (inst && inst.destroy) inst.destroy(); } catch (e) {}
    inst = window.AgentFlowhub && window.AgentFlowhub.init ? window.AgentFlowhub.init(cfg) : null;
  }
  window.addEventListener('message', function (ev) {
    if (ev.origin !== ${JSON.stringify(origin)}) return;
    var d = ev.data || {};
    if (d.type === 'afhub-preview-config') mount(d.cfg);
  });
  parent.postMessage({ type: 'afhub-preview-ready' }, ${JSON.stringify(origin)});
</script></body></html>`;
}

export function WidgetLivePreview({
  cfg,
  shortcuts,
  device,
  backdrop,
  open,
}: {
  cfg: WidgetConfig;
  shortcuts: WidgetShortcut[];
  device: PreviewDevice;
  backdrop: PreviewBackdrop;
  open: boolean;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const doc = useMemo(() => (origin ? srcDoc(origin, backdrop) : ''), [origin, backdrop]);

  useEffect(() => {
    setReady(false);
    const onMsg = (ev: MessageEvent) => {
      if (ev.source === frame.current?.contentWindow && ev.data?.type === 'afhub-preview-ready') setReady(true);
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [doc]);

  // Reenviar la configuración (con un respiro para no remontar en cada tecla).
  useEffect(() => {
    if (!ready || !frame.current?.contentWindow) return;
    const t = setTimeout(() => {
      frame.current?.contentWindow?.postMessage(
        {
          type: 'afhub-preview-config',
          cfg: {
            ...cfg,
            shortcuts,
            preview: true,
            previewMessages: DEMO_MESSAGES,
            agentId: cfg.agentId || 'preview',
            token: '',
            host: origin,
            autoOpen: open,
            trackEvents: false,
            // pushContent empuja la página falsa: se ve el efecto real en escritorio.
          },
        },
        origin,
      );
    }, 120);
    return () => clearTimeout(t);
  }, [ready, cfg, shortcuts, open, origin]);

  return (
    <div className={`ws-device ws-device--${device}`}>
      {device === 'mobile' ? <span className="ws-device__notch" aria-hidden /> : null}
      <iframe
        ref={frame}
        title="Vista previa del widget"
        className="ws-device__frame"
        srcDoc={doc}
        sandbox="allow-scripts allow-same-origin"
      />
    </div>
  );
}
