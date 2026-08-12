'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Bot,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Sparkles,
  ExternalLink,
} from '@/components/ui/icons';

type AssistItem = {
  context: 'marketing' | 'app';
  hubId: string;
  name: string;
  description: string;
  agent: {
    id: string;
    name: string;
    agentHubId: string | null;
    isPlatform: boolean;
    userId: string;
    status: string;
    syncStatus?: string;
  } | null;
  widget: {
    id: string;
    name: string;
    hasToken: boolean;
    active: boolean;
    userId: string;
  } | null;
  ready: boolean;
};

type AssistMongoStatus = {
  mathAisAgentId: string | null;
  hubAgentId: string | null;
  mongoToolsEnabled: boolean;
  connection: {
    id: string;
    label: string;
    syncStatus: string;
    lastSyncError: string | null;
    hasUri: boolean;
    allowedDatabases: string;
  } | null;
};

export default function LandingAssistAdminPage() {
  const [items, setItems] = useState<AssistItem[]>([]);
  const [adminUserId, setAdminUserId] = useState<string | null>(null);
  const [mongoStatus, setMongoStatus] = useState<AssistMongoStatus | null>(null);
  const [mongoUri, setMongoUri] = useState('');
  const [mongoDb, setMongoDb] = useState('agentflowhub_landing');
  const [mongoSaving, setMongoSaving] = useState(false);
  const [mongoMsg, setMongoMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const loadMongo = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/landing-assist/mongo-mcp', { credentials: 'include' });
      const data = await res.json();
      if (res.ok && data.status) setMongoStatus(data.status as AssistMongoStatus);
    } catch {
      /* silencioso */
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/landing-assist', { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al cargar');
      setItems(Array.isArray(data.items) ? data.items : []);
      setAdminUserId(typeof data.adminUserId === 'string' ? data.adminUserId : null);
      await loadMongo();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, [loadMongo]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveMongoMcp() {
    setMongoSaving(true);
    setMongoMsg(null);
    setError(null);
    try {
      const res = await fetch('/api/admin/landing-assist/mongo-mcp', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionUri: mongoUri.trim(),
          allowedDatabases: mongoDb.trim() || 'agentfarm',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || 'Error al conectar Mongo');
      setMongoMsg(data.message || 'MongoDB conectado.');
      if (data.status) setMongoStatus(data.status as AssistMongoStatus);
      setMongoUri('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error Mongo MCP');
    } finally {
      setMongoSaving(false);
    }
  }

  async function ensure() {
    setSaving(true);
    setError(null);
    setOkMsg(null);
    try {
      const res = await fetch('/api/admin/landing-assist', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ syncHub: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo crear');
      setOkMsg(data.message || 'Agentes listos en el perfil admin.');
      setItems(Array.isArray(data.items) ? data.items : []);
      setAdminUserId(typeof data.adminUserId === 'string' ? data.adminUserId : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 880, margin: '0 auto', padding: '28px 20px 48px' }}>
      <div style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <Sparkles size={20} style={{ color: '#006B7D' }} />
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>
            Agentes de la landing
          </h1>
        </div>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--muted-foreground)', lineHeight: 1.5 }}>
          Dos asistentes para esta misma plataforma, ambos en el <strong>perfil administrador</strong>:
          uno de <strong>aterrizaje</strong> (marketing) y uno de <strong>usuario</strong> (dashboard).
        </p>
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          marginBottom: 20,
          alignItems: 'center',
        }}
      >
        <button
          type="button"
          onClick={() => void ensure()}
          disabled={saving}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 16px',
            borderRadius: 10,
            border: 'none',
            background: '#006B7D',
            color: '#fff',
            fontWeight: 700,
            fontSize: 13,
            cursor: saving ? 'wait' : 'pointer',
            opacity: saving ? 0.75 : 1,
          }}
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Bot size={15} />}
          {saving ? 'Creando…' : 'Crear / asegurar los 2 agentes'}
        </button>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || saving}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 14px',
            borderRadius: 10,
            border: '1px solid var(--border)',
            background: 'var(--card)',
            color: 'var(--foreground)',
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          <RefreshCw size={14} />
          Actualizar
        </button>
        <Link
          href="/dashboard/agents"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 13,
            color: '#006B7D',
            fontWeight: 600,
            textDecoration: 'none',
            marginLeft: 'auto',
          }}
        >
          Ver en Mi dashboard <ExternalLink size={13} />
        </Link>
      </div>

      {adminUserId && (
        <p style={{ fontSize: 12, color: 'var(--muted-foreground)', marginBottom: 14 }}>
          Dueño admin: <code style={{ fontSize: 11 }}>{adminUserId}</code>
        </p>
      )}

      {error && (
        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'flex-start',
            padding: '12px 14px',
            borderRadius: 10,
            background: 'rgba(239,68,68,0.08)',
            color: '#b91c1c',
            fontSize: 13,
            marginBottom: 14,
          }}
        >
          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          {error}
        </div>
      )}

      {okMsg && (
        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'flex-start',
            padding: '12px 14px',
            borderRadius: 10,
            background: 'rgba(34,197,94,0.1)',
            color: '#15803d',
            fontSize: 13,
            marginBottom: 14,
          }}
        >
          <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          {okMsg}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--muted-foreground)' }}>
          <Loader2 size={18} className="animate-spin" />
          Cargando…
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          {items.map((item) => (
            <article
              key={item.context}
              style={{
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: 14,
                padding: '16px 18px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{item.name}</h2>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 800,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        padding: '3px 7px',
                        borderRadius: 999,
                        background:
                          item.context === 'marketing'
                            ? 'rgba(0,107,125,0.12)'
                            : 'rgba(99,102,241,0.12)',
                        color: item.context === 'marketing' ? '#006B7D' : '#6366f1',
                      }}
                    >
                      {item.context === 'marketing' ? 'Aterrizaje' : 'Usuario'}
                    </span>
                    {item.ready ? (
                      <span style={{ fontSize: 11, color: '#15803d', fontWeight: 700 }}>Listo</span>
                    ) : (
                      <span style={{ fontSize: 11, color: '#b45309', fontWeight: 700 }}>Pendiente</span>
                    )}
                  </div>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--muted-foreground)' }}>
                    {item.description}
                  </p>
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 12,
                  marginTop: 14,
                  fontSize: 12,
                }}
              >
                <div
                  style={{
                    padding: 12,
                    borderRadius: 10,
                    background: 'var(--muted)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Agente (admin)</div>
                  {item.agent ? (
                    <>
                      <div>ID: <code>{item.agent.id}</code></div>
                      <div>Hub: <code>{item.agent.agentHubId || '—'}</code></div>
                      <div style={{ marginTop: 8 }}>
                        <Link href={`/dashboard/agents/${item.agent.id}`} style={{ color: '#006B7D' }}>
                          Abrir ficha →
                        </Link>
                      </div>
                    </>
                  ) : (
                    <div style={{ color: '#b45309' }}>Aún no creado</div>
                  )}
                </div>
                <div
                  style={{
                    padding: 12,
                    borderRadius: 10,
                    background: 'var(--muted)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Widget (admin)</div>
                  {item.widget ? (
                    <>
                      <div>ID: <code>{item.widget.id}</code></div>
                      <div>Token wt_*: {item.widget.hasToken ? 'sí' : 'no'}</div>
                      <div>Activo: {item.widget.active ? 'sí' : 'no'}</div>
                      <div style={{ marginTop: 8 }}>
                        <Link
                          href={`/dashboard/widget-preview?id=${item.widget.id}`}
                          style={{ color: '#006B7D' }}
                        >
                          Preview →
                        </Link>
                      </div>
                    </>
                  ) : (
                    <div style={{ color: '#b45309' }}>Aún no creado</div>
                  )}
                </div>
              </div>

              <p style={{ margin: '12px 0 0', fontSize: 11, color: 'var(--muted-foreground)' }}>
                Slug hub esperado: <code>{item.hubId}</code>
                {item.context === 'marketing'
                  ? ' · Se usa en rutas de marketing (/ , /pricing, …)'
                  : ' · Se usa en /dashboard (no en /admin)'}
              </p>
            </article>
          ))}
        </div>
      )}

      <section
        style={{
          marginTop: 28,
          padding: '18px 20px',
          borderRadius: 14,
          border: '1px solid var(--border)',
          background: 'var(--card)',
        }}
      >
        <h2 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 800 }}>
          Math-ais · MCP MongoDB (contexto del cliente)
        </h2>
        <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--muted-foreground)', lineHeight: 1.5 }}>
          Conexión de <strong>solo lectura</strong> sobre la base <code>agentflowhub_landing</code>{' '}
          (usuarios, agentes, widgets). <strong>No uses agentfarm</strong> — esa es del motor IA.
        </p>

        {mongoStatus && (
          <div
            style={{
              fontSize: 12,
              padding: '10px 12px',
              borderRadius: 8,
              background: 'var(--muted)',
              marginBottom: 14,
              lineHeight: 1.6,
            }}
          >
            <div>
              Tools Mongo:{' '}
              <strong>{mongoStatus.mongoToolsEnabled ? 'activas' : 'pendientes'}</strong>
            </div>
            {mongoStatus.connection ? (
              <>
                <div>
                  Sync: <code>{mongoStatus.connection.syncStatus}</code>
                  {mongoStatus.connection.allowedDatabases && (
                    <> · DB: <code>{mongoStatus.connection.allowedDatabases}</code></>
                  )}
                </div>
                {mongoStatus.connection.lastSyncError && (
                  <div style={{ color: '#b91c1c' }}>{mongoStatus.connection.lastSyncError}</div>
                )}
              </>
            ) : (
              <div style={{ color: '#b45309' }}>Sin conexión Mongo — pega la URI abajo.</div>
            )}
          </div>
        )}

        {mongoMsg && (
          <p style={{ fontSize: 13, color: '#15803d', marginBottom: 12 }}>{mongoMsg}</p>
        )}

        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
          MongoDB URI (mongodb+srv://…)
        </label>
        <input
          type="password"
          autoComplete="off"
          value={mongoUri}
          onChange={(e) => setMongoUri(e.target.value)}
          placeholder="mongodb+srv://usuario:****@cluster…/agentfarm"
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            fontSize: 13,
            marginBottom: 10,
            boxSizing: 'border-box',
          }}
        />
        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
          Base permitida
        </label>
        <input
          type="text"
          value={mongoDb}
          onChange={(e) => setMongoDb(e.target.value)}
          placeholder="agentflowhub_landing"
          style={{
            width: 200,
            padding: '8px 10px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            fontSize: 13,
            marginBottom: 14,
          }}
        />
        <div>
          <button
            type="button"
            onClick={() => void saveMongoMcp()}
            disabled={mongoSaving || !mongoUri.trim()}
            style={{
              padding: '10px 16px',
              borderRadius: 10,
              border: 'none',
              background: '#006B7D',
              color: '#fff',
              fontWeight: 700,
              fontSize: 13,
              cursor: mongoSaving || !mongoUri.trim() ? 'not-allowed' : 'pointer',
              opacity: mongoSaving || !mongoUri.trim() ? 0.6 : 1,
            }}
          >
            {mongoSaving ? 'Conectando…' : 'Guardar y sincronizar Mongo MCP'}
          </button>
        </div>
      </section>
    </div>
  );
}
