'use client';

import Link from 'next/link';
import { ChevronLeft, Plug } from '@/components/ui/icons';
import { McpAvailablePanel } from '@/components/mcp/mcp-available-panel';

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
          <h1 style={{ fontSize: '22px', fontWeight: 800, margin: 0, color: 'var(--foreground)' }}>Integraciones disponibles</h1>
          <p style={{ fontSize: '13px', color: 'var(--muted-foreground)', margin: '4px 0 0', lineHeight: 1.5 }}>
            Las credenciales se guardan por agente: conectas una cuenta desde la ficha del agente y solo ese agente la usa.
          </p>
        </div>
      </div>

      <div
        data-tour="mcp-catalog"
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
          background: 'rgba(13,148,136,0.06)',
          border: '1px solid rgba(13,148,136,0.2)',
          fontSize: '12px',
          color: 'var(--foreground)',
          lineHeight: 1.55,
        }}
      >
        <strong>¿Cómo conectar Gmail, HubSpot, etc.?</strong>
        <ol style={{ margin: '8px 0 0', paddingLeft: '18px' }}>
          <li>Crea o edita un agente.</li>
          <li>En la ficha del agente, pestaña <strong>Integraciones</strong>, conecta la cuenta.</li>
          <li>Cuando la conexión quede activa, elige qué herramientas puede usar el agente.</li>
        </ol>
      </div>
    </div>
  );
}
