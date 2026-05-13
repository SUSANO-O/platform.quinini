import Link from 'next/link';
import { Lock, Shield, AlertTriangle, Eye, CheckCircle, ArrowRight, Zap, Search, Terminal } from 'lucide-react';

const R = '#e41414';
const D = '#991b1b';

export const metadata = {
  title: 'Cybersecurity AI — Agente de Ciberseguridad con IA',
  description: 'Análisis de vulnerabilidades, detección de amenazas y respuesta a incidentes de ciberseguridad con IA.',
};

const FEATURES = [
  { Icon: Search,       title: 'Análisis de Vulnerabilidades', desc: 'Escanea código, configuraciones e infraestructura para detectar vulnerabilidades antes de que sean explotadas.' },
  { Icon: AlertTriangle, title: 'Detección de Amenazas',       desc: 'Identifica patrones de ataques como phishing, inyección SQL, XSS y más con explicaciones detalladas.' },
  { Icon: Terminal,      title: 'Respuesta a Incidentes',       desc: 'Guía paso a paso para contener, erradicar y recuperarse de incidentes de seguridad.' },
  { Icon: Eye,           title: 'Monitoreo Continuo',           desc: 'Alerta proactiva sobre nuevas CVEs, actualizaciones de seguridad y mejores prácticas del sector.' },
];

const USE_CASES = [
  'Equipos de seguridad (SOC)', 'Desarrolladores de software', 'Auditores de seguridad',
  'Startups y PYMEs', 'Bancos y fintech', 'Gobierno y sector público',
];

export default function CybersecurityAgentPage() {
  return (
    <div style={{ background: '#fff', color: '#111827', fontFamily: 'system-ui, sans-serif' }}>
      <section style={{ background: `linear-gradient(135deg, ${R}10, ${D}05)`, borderBottom: '1px solid #fecaca', padding: '80px 24px 60px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#fecaca', color: D, padding: '6px 16px', borderRadius: 99, fontSize: 13, fontWeight: 600, marginBottom: 24 }}>
            <Lock size={14} /> Agente de Ciberseguridad con IA
          </div>
          <h1 style={{ fontSize: 'clamp(32px, 5vw, 56px)', fontWeight: 800, color: '#111827', letterSpacing: '-0.03em', marginBottom: 20 }}>
            Ciberseguridad Proactiva<br /><span style={{ color: R }}>con IA Especializada</span>
          </h1>
          <p style={{ fontSize: 18, color: '#6b7280', maxWidth: 600, margin: '0 auto 36px', lineHeight: 1.7 }}>
            Un analista de seguridad IA que detecta vulnerabilidades, analiza amenazas y guía a tu equipo en la respuesta a incidentes en tiempo real.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/register" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '14px 28px', borderRadius: 12, background: D, color: '#fff', fontWeight: 600, textDecoration: 'none', fontSize: 15 }}>
              Comenzar gratis <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      <section style={{ padding: '80px 24px', maxWidth: 1100, margin: '0 auto' }}>
        <h2 style={{ textAlign: 'center', fontSize: 32, fontWeight: 700, color: '#111827', marginBottom: 48 }}>Capacidades del Agente de Seguridad</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 24 }}>
          {FEATURES.map(({ Icon, title, desc }) => (
            <div key={title} style={{ padding: 28, borderRadius: 16, border: '1px solid #fecaca', background: '#fff5f5' }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: '#fecaca', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <Icon size={22} color={D} />
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 8 }}>{title}</h3>
              <p style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.6, margin: 0 }}>{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section style={{ padding: '60px 24px', background: '#f9fafb' }}>
        <div style={{ maxWidth: 700, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontSize: 28, fontWeight: 700, color: '#111827', marginBottom: 36 }}>¿Quién usa Cybersecurity AI?</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            {USE_CASES.map(uc => (
              <div key={uc} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderRadius: 10, background: '#fff', border: '1px solid #e5e7eb', fontSize: 14, color: '#374151' }}>
                <CheckCircle size={14} color={D} /> {uc}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ padding: '80px 24px', textAlign: 'center', background: `linear-gradient(135deg, ${D}, ${R})` }}>
        <h2 style={{ fontSize: 32, fontWeight: 800, color: '#fff', marginBottom: 16 }}>Protege tu organización con IA de seguridad</h2>
        <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 16, marginBottom: 32, maxWidth: 500, margin: '0 auto 32px' }}>Comienza con 7 días gratis. Sin tarjeta de crédito.</p>
        <Link href="/register" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '16px 32px', borderRadius: 12, background: '#fff', color: D, fontWeight: 700, textDecoration: 'none', fontSize: 16 }}>
          <Zap size={18} /> Crear agente de seguridad
        </Link>
      </section>
    </div>
  );
}
