'use client';

import Link from 'next/link';
import { ChevronLeft, Plug } from 'lucide-react';
import { McpAvailablePanel } from '@/components/mcp/mcp-available-panel';

const hubUiBase = (process.env.NEXT_PUBLIC_AGENTFLOWHUB_URL || 'http://127.0.0.1:9010').replace(/\/$/, '');

export default function DashboardMcpPage() {
  return (
    <div style={{ padding: '32px', maxWidth: '800px' }}>
      <Link
        href="/dashboard"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          color: 'var(--muted-foreground)',
          fontSize: '12px',
          textDecoration: 'none',
          marginBottom: '20px',
        }}
      >
        <ChevronLeft size={14} /> Volver al dashboard
      </Link>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
        <div
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(13,148,136,0.2))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Plug size={22} style={{ color: '#6366f1' }} />
        </div>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, margin: 0, color: 'var(--foreground)' }}>Integraciones MCP disponibles</h1>
          <p style={{ fontSize: '13px', color: 'var(--muted-foreground)', margin: '4px 0 0', lineHeight: 1.5 }}>
            Catálogo servido por <strong>AIBackHub</strong> (<code style={{ fontSize: '12px' }}>BACKEND_URL</code>). Las credenciales se
            asocian por agente al crear una conexión y sincronizar (AgentFlowHub o API del hub).
          </p>
        </div>
      </div>

      <div
        style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: '14px',
          padding: '20px',
          marginTop: '24px',
        }}
      >
        <h2 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 16px' }}>
          Catálogo en tiempo real
        </h2>
        <McpAvailablePanel />
      </div>

      <div
        style={{
          marginTop: '20px',
          padding: '14px 16px',
          borderRadius: '10px',
          background: 'rgba(99,102,241,0.06)',
          border: '1px solid rgba(99,102,241,0.2)',
          fontSize: '12px',
          color: 'var(--foreground)',
          lineHeight: 1.55,
        }}
      >
        <strong>AgentFlowHub — MCP estándar y credenciales</strong>
        <p style={{ margin: '8px 0 0' }}>
          Para conectar un <strong>servidor MCP genérico</strong> (URL + opcional Authorization), abre el hub en{' '}
          <a href={`${hubUiBase}/mcp`} target="_blank" rel="noopener noreferrer" style={{ color: '#6366f1', fontWeight: 700 }}>
            {hubUiBase}/mcp
          </a>
          {' '}→ pestaña <strong>&quot;MCP estándar&quot;</strong>. Tras sincronizar el agente, las mismas conexiones aplican al
          agente enlazado en AIBackHub; en la landing puedes revisar credenciales en la ficha del agente (integraciones) cuando
          el flujo lo permita.
        </p>
      </div>

      <div
        style={{
          marginTop: '20px',
          padding: '14px 16px',
          borderRadius: '10px',
          background: 'rgba(13,148,136,0.06)',
          border: '1px solid rgba(13,148,136,0.2)',
          fontSize: '12px',
          color: 'var(--foreground)',
          lineHeight: 1.55,
        }}
      >
        <strong>¿Cómo conectar Gmail, HubSpot, etc.?</strong>
        <ol style={{ margin: '8px 0 0', paddingLeft: '18px' }}>
          <li>Crea o edita un agente en esta landing y sincronízalo con el catálogo del hub (se crea el agente en AIBackHub).</li>
          <li>En la ficha del agente, pestaña <strong>Integraciones</strong>, verás conexiones MCP y podrás enlazar con AgentFlowHub si lo usas.</li>
          <li>Las herramientas concretas (<code style={{ fontSize: '11px' }}>mcp:gmail:…</code>) se habilitan cuando la conexión queda en sync correcto.</li>
        </ol>
      </div>
    </div>
  );
}
