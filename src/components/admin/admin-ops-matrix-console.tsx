'use client';

import { useEffect, useRef, useState } from 'react';
import { ADMIN_OPS_CONSOLE_API } from '@/lib/admin-ops-live';
import type { ConsoleEvent, ConsoleEventKind } from '@/lib/admin-ops-live';
import { BRAND, STATE } from '@/lib/brand-colors';

const KIND_COLOR: Record<ConsoleEventKind, string> = {
  turn: BRAND.primaryLight,
  orquesta: '#5eead4',
  fase: '#7dd3c7',
  tools: '#f0c48a',
  memoria: BRAND.tertiary,
  rag: '#86b8c4',
  tokens: '#a5b4fc',
  prompt: '#c4b5fd',
  sesion: '#94a3b8',
  error: STATE.error,
};

const MAX_LINES = 400;

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-CO', {
    timeZone: 'America/Bogota',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function AdminOpsMatrixConsole() {
  const [lines, setLines] = useState<ConsoleEvent[]>([]);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState('');
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const seen = useRef(new Set<string>());
  const cursor = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();

    const pull = async (initial: boolean) => {
      if (document.hidden) return;
      const qs = cursor.current && !initial ? `?after=${encodeURIComponent(cursor.current)}` : '';
      try {
        const res = await fetch(`${ADMIN_OPS_CONSOLE_API}${qs}`, {
          signal: ctrl.signal,
          credentials: 'include',
        });
        if (!res.ok) throw new Error(res.status === 401 ? 'Solo admin.' : 'Consola no disponible.');
        const payload = await res.json() as { events?: ConsoleEvent[]; cursor?: string | null };
        if (cancelled) return;
        setError('');
        if (payload.cursor) cursor.current = payload.cursor;
        const incoming = (payload.events || []).filter((e) => {
          if (seen.current.has(e.id)) return false;
          seen.current.add(e.id);
          return true;
        });
        if (!incoming.length) return;
        setLines((prev) => {
          const next = initial && prev.length === 0 ? incoming : [...prev, ...incoming];
          return next.slice(-MAX_LINES);
        });
      } catch (e) {
        if (cancelled || (e instanceof DOMException && e.name === 'AbortError')) return;
        setError(e instanceof Error ? e.message : 'Error');
      }
    };

    void pull(true);
    const id = window.setInterval(() => void pull(false), 1200);
    return () => {
      cancelled = true;
      ctrl.abort();
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!stick.current || paused) return;
    const el = scroller.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [lines, paused]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    stick.current = atBottom;
    setPaused(!atBottom);
  };

  return (
    <section
      aria-label="Consola live de orquestación"
      style={{
        marginBottom: 20,
        border: '1px solid rgba(40,164,184,0.28)',
        borderRadius: 8,
        background: '#07090a',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '8px 12px',
          borderBottom: '1px solid rgba(40,164,184,0.18)',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: 11,
          color: BRAND.primaryLight,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}
      >
        <span>Consola · path / fases / tools / memoria / rag / tokens</span>
        <span style={{ color: paused ? STATE.warning : STATE.success }}>
          {paused ? 'pausa — scrollea al final' : 'cayendo'}
        </span>
      </div>
      <div
        ref={scroller}
        onScroll={onScroll}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        style={{
          height: 'min(72vh, 640px)',
          overflowY: 'auto',
          padding: '10px 12px 16px',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: 11.5,
          lineHeight: 1.45,
          color: '#7dd3c7',
        }}
      >
        {error && <div style={{ color: STATE.error }}>{error}</div>}
        {!error && lines.length === 0 && (
          <div style={{ color: 'rgba(125,211,199,0.45)' }}>
            esperando turnos… habla con un widget y cae aquí
          </div>
        )}
        {lines.map((line) => (
          <div key={line.id} style={{ color: KIND_COLOR[line.kind], whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            <span style={{ opacity: 0.45, marginRight: 8 }}>{clock(line.at)}</span>
            {line.text}
          </div>
        ))}
        <div aria-hidden style={{ color: BRAND.primaryLight }}>█</div>
      </div>
    </section>
  );
}
