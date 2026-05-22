import Link from 'next/link';
import { Wrench, Settings, AlertTriangle, BarChart2, CheckCircle, ArrowRight, Zap, Cpu, ClipboardList } from 'lucide-react';

const Rd = '#bb1b14';
const O = 'var(--brand-warm)';

export const metadata = {
  title: 'Maximo Industrial AI — Agente de Mantenimiento Industrial con IA',
  description: 'Gestión de activos, mantenimiento predictivo y optimización de operaciones industriales con IA integrada a IBM Maximo.',
};

const FEATURES = [
  { Icon: Cpu,          title: 'Mantenimiento Predictivo',  desc: 'Analiza datos de sensores y telemetría para predecir fallas antes de que ocurran, reduciendo paradas no planificadas.' },
  { Icon: ClipboardList, title: 'Gestión de Órdenes de Trabajo', desc: 'Genera, prioriza y asigna automáticamente órdenes de trabajo basadas en criticidad y disponibilidad de recursos.' },
  { Icon: BarChart2,    title: 'KPIs en Tiempo Real',       desc: 'Dashboards de OEE, MTBF, MTTR y disponibilidad de activos con alertas proactivas por umbrales.' },
  { Icon: Settings,     title: 'Integración con Maximo',   desc: 'Conexión directa con IBM Maximo para consultas de activos, historial de mantenimiento y gestión de inventario.' },
];

const USE_CASES = [
  'Plantas manufactureras', 'Empresas de utilities', 'Minería y extracción',
  'Industria petroquímica', 'Aerolíneas y aeropuertos', 'Hospitales y centros de salud',
];

export default function MaximoAgentPage() {
  return (
    <div style={{ background: '#fff', color: '#111827', fontFamily: 'system-ui, sans-serif' }}>
      <section style={{ background: `linear-gradient(135deg, ${Rd}10, ${O}08)`, borderBottom: '1px solid #fecaca', padding: '80px 24px 60px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#fee2e2', color: Rd, padding: '6px 16px', borderRadius: 99, fontSize: 13, fontWeight: 600, marginBottom: 24 }}>
            <Wrench size={14} /> Agente Industrial con IA — Maximo
          </div>
          <h1 style={{ fontSize: 'clamp(32px, 5vw, 56px)', fontWeight: 800, color: '#111827', letterSpacing: '-0.03em', marginBottom: 20 }}>
            Mantenimiento Industrial<br /><span style={{ color: Rd }}>Inteligente con IA</span>
          </h1>
          <p style={{ fontSize: 18, color: '#6b7280', maxWidth: 600, margin: '0 auto 36px', lineHeight: 1.7 }}>
            Un agente IA especializado en gestión de activos industriales que se integra con IBM Maximo para optimizar el mantenimiento, reducir costos y maximizar la disponibilidad de equipos.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/register" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '14px 28px', borderRadius: 12, background: Rd, color: '#fff', fontWeight: 600, textDecoration: 'none', fontSize: 15 }}>
              Comenzar gratis <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      <section style={{ padding: '80px 24px', maxWidth: 1100, margin: '0 auto' }}>
        <h2 style={{ textAlign: 'center', fontSize: 32, fontWeight: 700, color: '#111827', marginBottom: 48 }}>Capacidades del Agente Industrial</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 24 }}>
          {FEATURES.map(({ Icon, title, desc }) => (
            <div key={title} style={{ padding: 28, borderRadius: 16, border: '1px solid #fecaca', background: '#fff5f5' }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <Icon size={22} color={Rd} />
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 8 }}>{title}</h3>
              <p style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.6, margin: 0 }}>{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section style={{ padding: '60px 24px', background: '#f9fafb' }}>
        <div style={{ maxWidth: 700, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontSize: 28, fontWeight: 700, color: '#111827', marginBottom: 36 }}>¿Quién usa Maximo Industrial AI?</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            {USE_CASES.map(uc => (
              <div key={uc} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderRadius: 10, background: '#fff', border: '1px solid #e5e7eb', fontSize: 14, color: '#374151' }}>
                <CheckCircle size={14} color={Rd} /> {uc}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ padding: '80px 24px', textAlign: 'center', background: Rd }}>
        <h2 style={{ fontSize: 32, fontWeight: 800, color: '#fff', marginBottom: 16 }}>Optimiza tus operaciones industriales con IA</h2>
        <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 16, marginBottom: 32, maxWidth: 500, margin: '0 auto 32px' }}>Comienza con 7 días gratis. Sin tarjeta de crédito.</p>
        <Link href="/register" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '16px 32px', borderRadius: 12, background: '#fff', color: Rd, fontWeight: 700, textDecoration: 'none', fontSize: 16 }}>
          <Zap size={18} /> Crear agente industrial
        </Link>
      </section>
    </div>
  );
}
