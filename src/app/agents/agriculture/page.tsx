import Link from 'next/link';
import { Sprout, Droplets, Sun, TrendingUp, CheckCircle, ArrowRight, Zap, CloudRain, Bug } from 'lucide-react';

const C = '#00c896';
const G = '#059669';

export const metadata = {
  title: 'Smart Agriculture AI — Agente Agrónomo con IA',
  description: 'Monitoreo de cultivos, predicción de riesgos y recomendaciones agronómicas personalizadas con IA.',
};

const FEATURES = [
  { Icon: Droplets,  title: 'Análisis de Suelo y Agua',  desc: 'Evalúa parámetros de riego, pH, nutrientes y condiciones del suelo para maximizar el rendimiento.' },
  { Icon: CloudRain, title: 'Predicción Climática',       desc: 'Integra datos meteorológicos para alertas tempranas de heladas, sequías e inundaciones.' },
  { Icon: Bug,       title: 'Detección de Plagas',        desc: 'Identifica patrones de plagas y enfermedades con recomendaciones de manejo integrado.' },
  { Icon: TrendingUp, title: 'Optimización de Cosecha',  desc: 'Predice rendimientos y recomienda el momento óptimo de cosecha para cada cultivo.' },
];

const USE_CASES = [
  'Grandes productores agrícolas', 'Cooperativas y asociaciones', 'Empresas de agroinsumos',
  'Consultoras agronómicas', 'Programas gubernamentales', 'Seguros agrícolas',
];

export default function AgricultureAgentPage() {
  return (
    <div style={{ background: '#fff', color: '#111827' }}>
      <section style={{ background: `linear-gradient(135deg, ${C}10, ${G}08)`, borderBottom: '1px solid #d1fae5', padding: '80px 24px 60px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#d1fae5', color: G, padding: '6px 16px', borderRadius: 99, fontSize: 13, fontWeight: 600, marginBottom: 24 }}>
            <Sprout size={14} /> Agente Agrónomo con IA
          </div>
          <h1 style={{ fontSize: 'clamp(32px, 5vw, 56px)', fontWeight: 800, color: '#111827', letterSpacing: '-0.03em', marginBottom: 20 }}>
            Agricultura Inteligente<br /><span style={{ color: G }}>con IA Avanzada</span>
          </h1>
          <p style={{ fontSize: 18, color: '#6b7280', maxWidth: 600, margin: '0 auto 36px', lineHeight: 1.7 }}>
            Un asistente agrónomo disponible 24/7 que analiza condiciones del campo, predice riesgos y recomienda acciones para maximizar el rendimiento de tus cultivos.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/register" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '14px 28px', borderRadius: 12, background: G, color: '#fff', fontWeight: 600, textDecoration: 'none', fontSize: 15 }}>
              Comenzar gratis <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      <section style={{ padding: '80px 24px', maxWidth: 1100, margin: '0 auto' }}>
        <h2 style={{ textAlign: 'center', fontSize: 32, fontWeight: 700, color: '#111827', marginBottom: 48 }}>Capacidades del Agente Agrónomo</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 24 }}>
          {FEATURES.map(({ Icon, title, desc }) => (
            <div key={title} style={{ padding: 28, borderRadius: 16, border: '1px solid #d1fae5', background: '#f0fdf4' }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: '#d1fae5', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <Icon size={22} color={G} />
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 8 }}>{title}</h3>
              <p style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.6, margin: 0 }}>{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section style={{ padding: '60px 24px', background: '#f9fafb' }}>
        <div style={{ maxWidth: 700, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontSize: 28, fontWeight: 700, color: '#111827', marginBottom: 36 }}>¿Quién usa Smart Agriculture AI?</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            {USE_CASES.map(uc => (
              <div key={uc} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderRadius: 10, background: '#fff', border: '1px solid #e5e7eb', fontSize: 14, color: '#374151' }}>
                <CheckCircle size={14} color={G} /> {uc}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ padding: '80px 24px', textAlign: 'center', background: G }}>
        <h2 style={{ fontSize: 32, fontWeight: 800, color: '#fff', marginBottom: 16 }}>Lleva tu campo al siguiente nivel con IA</h2>
        <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 16, marginBottom: 32, maxWidth: 500, margin: '0 auto 32px' }}>Comienza con 7 días gratis. Sin tarjeta de crédito.</p>
        <Link href="/register" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '16px 32px', borderRadius: 12, background: '#fff', color: G, fontWeight: 700, textDecoration: 'none', fontSize: 16 }}>
          <Zap size={18} /> Crear agente agrónomo
        </Link>
      </section>
    </div>
  );
}
