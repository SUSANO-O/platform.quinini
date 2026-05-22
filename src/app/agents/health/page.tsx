import Link from 'next/link';
import { HeartPulse, Shield, Activity, CheckCircle, ArrowRight, Zap, Brain, Stethoscope } from 'lucide-react';

const R = 'var(--primary)';
const O = 'var(--brand-warm)';

export const metadata = {
  title: 'Health Monitor AI — Agente de Salud con IA',
  description: 'Monitoreo de bienestar, análisis biométrico y recomendaciones personalizadas de salud impulsadas por IA.',
};

const FEATURES = [
  { Icon: Activity,    title: 'Análisis Biométrico', desc: 'Procesa datos de presión arterial, frecuencia cardíaca, glucosa y más para un perfil completo de salud.' },
  { Icon: Brain,       title: 'Recomendaciones IA',  desc: 'Genera planes de bienestar personalizados basados en el historial y objetivos del paciente.' },
  { Icon: Shield,      title: 'Privacidad Total',     desc: 'Los datos de salud nunca abandonan tu infraestructura. Cumplimiento HIPAA y GDPR integrado.' },
  { Icon: Stethoscope, title: 'Escalación Médica',   desc: 'Detecta indicadores de riesgo y escala automáticamente a profesionales de salud cuando es necesario.' },
];

const USE_CASES = [
  'Clínicas y consultorios médicos',
  'Aplicaciones de fitness y bienestar',
  'Seguros de salud y EPS',
  'Programas corporativos de salud',
  'Hospitales y centros de atención',
  'Plataformas de telemedicina',
];

export default function HealthAgentPage() {
  return (
    <div style={{ background: '#fff', color: '#111827', fontFamily: 'system-ui, sans-serif' }}>
      {/* Hero */}
      <section style={{ background: `linear-gradient(135deg, ${R}10, ${O}08)`, borderBottom: '1px solid #fee2e2', padding: '80px 24px 60px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#fee2e2', color: R, padding: '6px 16px', borderRadius: 99, fontSize: 13, fontWeight: 600, marginBottom: 24 }}>
            <HeartPulse size={14} /> Agente de Salud con IA
          </div>
          <h1 style={{ fontSize: 'clamp(32px, 5vw, 56px)', fontWeight: 800, color: '#111827', letterSpacing: '-0.03em', marginBottom: 20 }}>
            Monitoreo de Salud<br /><span style={{ color: R }}>Impulsado por IA</span>
          </h1>
          <p style={{ fontSize: 18, color: '#6b7280', maxWidth: 600, margin: '0 auto 36px', lineHeight: 1.7 }}>
            Un agente inteligente que analiza datos biométricos, detecta patrones de riesgo y genera recomendaciones personalizadas para cada paciente.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/register" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '14px 28px', borderRadius: 12, background: R, color: '#fff', fontWeight: 600, textDecoration: 'none', fontSize: 15 }}>
              Comenzar gratis <ArrowRight size={16} />
            </Link>
            <Link href="#demo" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '14px 28px', borderRadius: 12, background: '#fff', color: '#374151', fontWeight: 600, textDecoration: 'none', border: '1px solid #e5e7eb', fontSize: 15 }}>
              Ver demo
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section style={{ padding: '80px 24px', maxWidth: 1100, margin: '0 auto' }}>
        <h2 style={{ textAlign: 'center', fontSize: 32, fontWeight: 700, color: '#111827', marginBottom: 48 }}>
          Capacidades del Agente
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 24 }}>
          {FEATURES.map(({ Icon, title, desc }) => (
            <div key={title} style={{ padding: 28, borderRadius: 16, border: '1px solid #fee2e2', background: '#fffbfb' }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <Icon size={22} color={R} />
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 8 }}>{title}</h3>
              <p style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.6, margin: 0 }}>{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Use Cases */}
      <section style={{ padding: '60px 24px', background: '#f9fafb' }}>
        <div style={{ maxWidth: 700, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontSize: 28, fontWeight: 700, color: '#111827', marginBottom: 36 }}>¿Quién usa Health Monitor AI?</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            {USE_CASES.map(uc => (
              <div key={uc} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderRadius: 10, background: '#fff', border: '1px solid #e5e7eb', fontSize: 14, color: '#374151' }}>
                <CheckCircle size={14} color={R} /> {uc}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '80px 24px', textAlign: 'center', background: R }}>
        <h2 style={{ fontSize: 32, fontWeight: 800, color: '#fff', marginBottom: 16 }}>
          Transforma la atención en salud con IA
        </h2>
        <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 16, marginBottom: 32, maxWidth: 500, margin: '0 auto 32px' }}>
          Comienza con 7 días gratis. Sin tarjeta de crédito.
        </p>
        <Link href="/register" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '16px 32px', borderRadius: 12, background: '#fff', color: R, fontWeight: 700, textDecoration: 'none', fontSize: 16 }}>
          <Zap size={18} /> Crear agente de salud
        </Link>
      </section>
    </div>
  );
}
