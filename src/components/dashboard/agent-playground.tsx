'use client';

/**
 * Escenario "Probar" del estudio del agente: chat real con el agente (configuración guardada), con el
 * aspecto del widget que lo usa (colores por zona, título, avatar), las herramientas que usó en cada
 * respuesta y la opción de probar como un cliente concreto. Usa POST /api/agents/[id]/playground.
 */

import Link from 'next/link';
import type { CSSProperties } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, RotateCcw, Send } from '@/components/ui/icons';
import { normalizeWidgetSkin, readableOn, type WidgetSkin } from '@/lib/widget-skin';

type Msg = { role: 'user' | 'assistant'; content: string; tools?: string[]; nav?: string; error?: boolean };

const SUGGESTIONS = ['Preséntate en una frase', '¿Qué puedes hacer por mí?', '¿Dónde están mis vehículos?'];

/** Lo que el escenario toma del widget vinculado. */
type WidgetLook = { id: string; name: string; color: string; title: string; subtitle: string; avatar: string; theme: string; skin: WidgetSkin; welcome: string };

/** "mcp:mysql:mysql_query" → "MySQL · consulta"; nombres comunes más legibles. */
export function toolLabel(id: string): string {
  const parts = id.split(':');
  const name = parts[parts.length - 1] || id;
  const source = parts.length > 2 ? parts[1] : '';
  const nice: Record<string, string> = {
    mysql_query: 'consulta', mysql_count: 'conteo', mysql_list_tables: 'tablas',
  };
  const src: Record<string, string> = { mysql: 'MySQL', mongodb: 'MongoDB', postgres: 'PostgreSQL', gmail: 'Gmail', hubspot: 'HubSpot', slack: 'Slack' };
  const label = nice[name] ?? name.replace(/_/g, ' ');
  return source ? `${src[source] ?? source} · ${label}` : label;
}

/** Negritas **x** y saltos de línea; el resto como texto (React escapa el HTML). */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((line, i) => (
        <span key={i} className="pg-line">
          {line.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
            part.startsWith('**') && part.endsWith('**') ? <strong key={j}>{part.slice(2, -2)}</strong> : <span key={j}>{part}</span>,
          )}
        </span>
      ))}
    </>
  );
}

/** Variables CSS del widget (mismas zonas que scripts/widget/skin.js), con valores por defecto del tema. */
function lookVars(look: WidgetLook | null, accent: string): CSSProperties {
  const brand = look?.color || accent;
  const s = look?.skin ?? {};
  const dark = look?.theme === 'dark';
  const headerBg = s.headerBg || brand;
  const userBg = s.userBubbleBg || brand;
  const sendBg = s.sendBg || brand;
  const font = s.fontFamily && s.fontFamily !== 'inherit' ? (s.fontFamily === 'system' ? 'system-ui, sans-serif' : `'${s.fontFamily}', system-ui, sans-serif`) : undefined;
  return {
    ['--pg-brand' as string]: brand,
    ['--pg-header-bg' as string]: headerBg,
    ['--pg-header-text' as string]: s.headerText || readableOn(headerBg),
    ['--pg-chat-bg' as string]: s.chatBg || (dark ? '#14161d' : '#f6f7f9'),
    ['--pg-footer-bg' as string]: s.footerBg || (dark ? '#14161d' : '#ffffff'),
    ['--pg-input-bg' as string]: s.inputBg || (dark ? '#1f222b' : '#ffffff'),
    ['--pg-input-text' as string]: s.inputText || (dark ? '#eef0f5' : '#1f2430'),
    ['--pg-send-bg' as string]: sendBg,
    ['--pg-send-text' as string]: readableOn(sendBg),
    ['--pg-user-bg' as string]: userBg,
    ['--pg-user-text' as string]: s.userBubbleText || readableOn(userBg),
    ['--pg-bot-bg' as string]: s.botBubbleBg || (dark ? '#1f222b' : '#ffffff'),
    ['--pg-bot-text' as string]: s.botBubbleText || (dark ? '#eef0f5' : '#1f2430'),
    ['--pg-muted' as string]: dark ? '#9aa0b1' : '#6b7280',
    ['--pg-line' as string]: dark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)',
    ...(font ? { fontFamily: font } : {}),
  };
}

export function AgentPlayground({
  agentId,
  agentName,
  accent,
  onPick,
}: {
  agentId: string;
  agentName: string;
  accent: string;
  /** Lleva al ajuste de la zona pulsada (nombre, herramientas…). */
  onPick?: (zone: string) => void;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [asClient, setAsClient] = useState('');
  const [showAs, setShowAs] = useState(false);
  const [look, setLook] = useState<WidgetLook | null>(null);
  const sessionRef = useRef<string>('');
  const listRef = useRef<HTMLDivElement>(null);

  // Aspecto del widget que usa este agente (el más reciente), para ver lo mismo que el cliente final.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/widgets')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { widgets?: Record<string, unknown>[] } | null) => {
        const w = d?.widgets?.find((x) => String(x.agentId) === agentId);
        if (cancelled || !w) return;
        const str = (v: unknown) => (typeof v === 'string' ? v : '');
        setLook({
          id: String(w._id),
          name: str(w.name),
          color: str(w.color),
          title: str(w.title),
          subtitle: str(w.subtitle),
          avatar: str(w.avatar),
          theme: str(w.theme),
          skin: normalizeWidgetSkin(w.skin),
          welcome: w.welcomeEnabled === false ? '' : str(w.welcome),
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [msgs, busy]);

  const vars = useMemo(() => lookVars(look, accent), [look, accent]);
  const title = look?.title || agentName || 'Tu agente';
  const initial = (title.trim()[0] || 'A').toUpperCase();

  function reset() {
    setMsgs([]);
    sessionRef.current = '';
  }

  /** "cliente=1013…, admin=9…" → { cliente: "1013…", admin: "9…" } */
  function parseIdentity(): Record<string, string> | undefined {
    const out: Record<string, string> = {};
    for (const pair of asClient.split(',')) {
      const [k, ...rest] = pair.split('=');
      const key = k?.trim();
      const val = rest.join('=').trim();
      if (key && val) out[key] = val;
    }
    return Object.keys(out).length ? out : undefined;
  }

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    const history = msgs.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content }));
    setMsgs((m) => [...m, { role: 'user', content: message }]);
    setInput('');
    setBusy(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/playground`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history, sessionId: sessionRef.current || undefined, identity: parseIdentity() }),
      });
      const d = (await res.json().catch(() => ({}))) as { reply?: string; toolsUsed?: string[]; sessionId?: string; error?: string; navOffer?: { path?: string } };
      if (!res.ok || !d.reply) {
        setMsgs((m) => [...m, { role: 'assistant', content: d.error || 'No hubo respuesta.', error: true }]);
      } else {
        if (d.sessionId) sessionRef.current = d.sessionId;
        setMsgs((m) => [...m, { role: 'assistant', content: d.reply!, tools: d.toolsUsed, nav: d.navOffer?.path }]);
      }
    } catch {
      setMsgs((m) => [...m, { role: 'assistant', content: 'Error de red.', error: true }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pg">
      <div className="pg-bar">
        <button type="button" className={`pg-chip${showAs || asClient ? ' is-on' : ''}`} onClick={() => setShowAs((s) => !s)} aria-expanded={showAs}>
          {asClient ? 'Como cliente ✓' : 'Probar como…'}
        </button>
        <span className="pg-bar__look">
          {look ? (
            <>
              Aspecto de <Link href={`/dashboard/widget-builder?edit=${look.id}`}>«{look.name}»</Link>
            </>
          ) : (
            'Sin widget vinculado · colores del agente'
          )}
        </span>
        <button type="button" className="ws-iconbtn" onClick={reset} aria-label="Nueva conversación" title="Nueva conversación">
          <RotateCcw size={15} />
        </button>
      </div>

      {showAs ? (
        <div className="pg-as">
          <label htmlFor="pg-as">Identidad firmada simulada (para datos del cliente)</label>
          <input id="pg-as" value={asClient} onChange={(e) => setAsClient(e.target.value)} placeholder="cliente=1013102323" data-no-dirty />
          <p>Como si el cliente hubiera iniciado sesión en tu web. Solo lo ves tú; vacío = visitante anónimo.</p>
        </div>
      ) : null}

      <div className={`pg-win${look?.theme === 'dark' ? ' is-dark' : ''}`} style={vars}>
        <div className="pg-win__head">
          <button type="button" className="pg-zone pg-win__who" onClick={() => onPick?.('name')} title="Editar nombre del agente">
            {look?.avatar && !look.skin.hideAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={look.avatar} alt="" className="pg-win__avatar" />
            ) : look?.skin.hideAvatar ? null : (
              <span className="pg-win__avatar pg-win__avatar--letter">{initial}</span>
            )}
            <span className="pg-win__title">
              <strong>{title}</strong>
              <span>
                {look?.skin.hideOnlineDot ? null : <i aria-hidden />}
                {look?.subtitle || 'En línea'}
              </span>
            </span>
          </button>
        </div>

        <div className="pg-list" ref={listRef} aria-live="polite">
          {msgs.length === 0 ? (
            <div className="pg-empty">
              {look?.welcome ? (
                <div className="pg-msg pg-msg--assistant">
                  <div className="pg-bubble">
                    <Rich text={look.welcome} />
                  </div>
                </div>
              ) : null}
              <p>Escribe como lo haría un cliente y mira cómo responde.</p>
              <div className="pg-sugs">
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" onClick={() => void send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {msgs.map((m, i) => (
            <div key={i} className={`pg-msg pg-msg--${m.role}${m.error ? ' is-error' : ''}`}>
              <div className="pg-bubble">
                <Rich text={m.content} />
              </div>
              {m.nav ? (
                <div className="pg-nav" title="En el widget se muestran los botones «Sí, llévame / No»">
                  <span>Sí, llévame</span>
                  <span>No</span>
                  <code>{m.nav}</code>
                </div>
              ) : null}
              {m.tools?.length ? (
                <div className="pg-tools" aria-label="Herramientas usadas">
                  {m.tools.map((t, j) => (
                    <button key={`${t}-${j}`} type="button" onClick={() => onPick?.('tools')} title="Ver herramientas del agente">
                      {toolLabel(t)}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
          {busy ? (
            <div className="pg-msg pg-msg--assistant">
              <div className="pg-bubble pg-typing" aria-label="Pensando">
                <i />
                <i />
                <i />
              </div>
            </div>
          ) : null}
        </div>

        <form
          className="pg-input"
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
        >
          <textarea
            value={input}
            rows={1}
            placeholder="Escribe un mensaje…"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            aria-label="Mensaje de prueba"
          />
          <button type="submit" disabled={busy || !input.trim()} aria-label="Enviar">
            {busy ? <Loader2 size={15} className="ws-spin" /> : <Send size={15} />}
          </button>
        </form>
        <p className="pg-win__foot">
          {look?.skin.footerNote ? <span>{look.skin.footerNote} · </span> : null}
          POWERED BY <strong>BOTIVA</strong>
        </p>
      </div>
    </div>
  );
}
