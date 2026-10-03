'use client';

/**
 * Consola "Probar" del estudio del agente: conversación real con el agente (configuración guardada)
 * y, en cada respuesta, su traza: herramientas usadas (llevan a su ajuste), tiempo de respuesta y
 * oferta de navegación. Permite probar como un cliente concreto. Usa POST /api/agents/[id]/playground.
 */

import { useEffect, useRef, useState } from 'react';
import { Loader2, RotateCcw, Send } from '@/components/ui/icons';

type Msg = { role: 'user' | 'assistant'; content: string; tools?: string[]; nav?: string; ms?: number; error?: boolean };

const SUGGESTIONS = ['Preséntate en una frase', '¿Qué puedes hacer por mí?', '¿Qué cosas no puedes hacer?'];

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

function seconds(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export function AgentPlayground({
  agentId,
  agentName,
  onPick,
}: {
  agentId: string;
  agentName: string;
  /** Lleva al ajuste de la zona pulsada (herramientas…). */
  onPick?: (zone: string) => void;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [asClient, setAsClient] = useState('');
  const [showAs, setShowAs] = useState(false);
  const sessionRef = useRef<string>('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [msgs, busy]);

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
    const t0 = performance.now();
    try {
      const res = await fetch(`/api/agents/${agentId}/playground`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history, sessionId: sessionRef.current || undefined, identity: parseIdentity() }),
      });
      const d = (await res.json().catch(() => ({}))) as { reply?: string; toolsUsed?: string[]; sessionId?: string; error?: string; navOffer?: { path?: string } };
      const ms = Math.round(performance.now() - t0);
      if (!res.ok || !d.reply) {
        setMsgs((m) => [...m, { role: 'assistant', content: d.error || 'No hubo respuesta.', error: true, ms }]);
      } else {
        if (d.sessionId) sessionRef.current = d.sessionId;
        setMsgs((m) => [...m, { role: 'assistant', content: d.reply!, tools: d.toolsUsed, nav: d.navOffer?.path, ms }]);
      }
    } catch {
      setMsgs((m) => [...m, { role: 'assistant', content: 'Error de red.', error: true }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pg">
      <div className="pg-head">
        <div>
          <strong>Probar agente</strong>
          <span>Con la configuración guardada</span>
        </div>
        <div className="pg-head__actions">
          <button type="button" className={`pg-chip${showAs || asClient ? ' is-on' : ''}`} onClick={() => setShowAs((s) => !s)} aria-expanded={showAs}>
            {asClient ? 'Como cliente ✓' : 'Probar como…'}
          </button>
          <button type="button" className="ws-iconbtn" onClick={reset} aria-label="Nueva conversación" title="Nueva conversación">
            <RotateCcw size={15} />
          </button>
        </div>
      </div>

      {showAs ? (
        <div className="pg-as">
          <label htmlFor="pg-as">Identidad firmada simulada (para datos del cliente)</label>
          <input id="pg-as" value={asClient} onChange={(e) => setAsClient(e.target.value)} placeholder="cliente=1013102323" data-no-dirty />
          <p>Como si el cliente hubiera iniciado sesión en tu web. Solo lo ves tú; vacío = visitante anónimo.</p>
        </div>
      ) : null}

      <div className="pg-list" ref={listRef} aria-live="polite">
        {msgs.length === 0 ? (
          <div className="pg-empty">
            <span className="pg-empty__orb" aria-hidden />
            <p>Habla con {agentName || 'tu agente'} y mira qué responde, qué herramientas usa y cuánto tarda.</p>
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
            {m.role === 'assistant' && (m.tools?.length || m.nav || m.ms) ? (
              <div className="pg-trace" aria-label="Traza de la respuesta">
                {m.tools?.map((t, j) => (
                  <button key={`${t}-${j}`} type="button" className="pg-trace__tool" onClick={() => onPick?.('tools')} title="Ver herramientas del agente">
                    {toolLabel(t)}
                  </button>
                ))}
                {m.nav ? (
                  <span className="pg-trace__nav" title="En el widget se muestran los botones «Sí, llévame / No»">
                    → {m.nav}
                  </span>
                ) : null}
                {m.ms ? <span className="pg-trace__ms">{seconds(m.ms)}</span> : null}
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
          data-no-dirty
        />
        <button type="submit" disabled={busy || !input.trim()} aria-label="Enviar">
          {busy ? <Loader2 size={15} className="ws-spin" /> : <Send size={15} />}
        </button>
      </form>
    </div>
  );
}
