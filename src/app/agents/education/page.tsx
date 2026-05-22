import Link from 'next/link';
import { GraduationCap, BookOpen, Target, Users, CheckCircle, ArrowRight, Zap, Award, MessageSquare } from 'lucide-react';

const O = 'var(--brand-warm)';
const Y = '#eab308';

export const metadata = {
  title: 'Education AI — Agente Tutor con IA',
  description: 'Tutoría personalizada, explicaciones adaptativas y evaluaciones inteligentes con IA para estudiantes de todos los niveles.',
};

const FEATURES = [
  { Icon: BookOpen,     title: 'Explicaciones Adaptativas', desc: 'Ajusta el nivel de dificultad y el estilo de enseñanza a las necesidades y ritmo de cada estudiante.' },
  { Icon: Target,       title: 'Evaluaciones Inteligentes', desc: 'Genera cuestionarios y ejercicios personalizados para reforzar los puntos débiles de cada alumno.' },
  { Icon: Users,        title: 'Aprendizaje Colaborativo',  desc: 'Facilita sesiones grupales, debates y proyectos colaborativos con moderación inteligente.' },
  { Icon: Award,        title: 'Seguimiento de Progreso',   desc: 'Reportes detallados del progreso del estudiante con métricas de comprensión y áreas de mejora.' },
];

const USE_CASES = [
  'Escuelas y colegios', 'Universidades', 'Plataformas EdTech',
  'Cursos en línea (MOOCs)', 'Clases particulares', 'Programas de certificación',
];

export default function EducationAgentPage() {
  return (
    <div style={{ background: '#fff', color: '#111827', fontFamily: 'system-ui, sans-serif' }}>
      <section style={{ background: `linear-gradient(135deg, ${O}10, ${Y}08)`, borderBottom: '1px solid #fef3c7', padding: '80px 24px 60px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#fef3c7', color: O, padding: '6px 16px', borderRadius: 99, fontSize: 13, fontWeight: 600, marginBottom: 24 }}>
            <GraduationCap size={14} /> Tutor Educativo con IA
          </div>
          <h1 style={{ fontSize: 'clamp(32px, 5vw, 56px)', fontWeight: 800, color: '#111827', letterSpacing: '-0.03em', marginBottom: 20 }}>
            Educación Personalizada<br /><span style={{ color: O }}>para Cada Estudiante</span>
          </h1>
          <p style={{ fontSize: 18, color: '#6b7280', maxWidth: 600, margin: '0 auto 36px', lineHeight: 1.7 }}>
            Un tutor IA que aprende el estilo de cada estudiante, adapta sus explicaciones y genera ejercicios específicos para maximizar el aprendizaje.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/register" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '14px 28px', borderRadius: 12, background: O, color: '#fff', fontWeight: 600, textDecoration: 'none', fontSize: 15 }}>
              Comenzar gratis <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      <section style={{ padding: '80px 24px', maxWidth: 1100, margin: '0 auto' }}>
        <h2 style={{ textAlign: 'center', fontSize: 32, fontWeight: 700, color: '#111827', marginBottom: 48 }}>Capacidades del Tutor IA</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 24 }}>
          {FEATURES.map(({ Icon, title, desc }) => (
            <div key={title} style={{ padding: 28, borderRadius: 16, border: '1px solid #fef3c7', background: '#fffbeb' }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <Icon size={22} color={O} />
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 8 }}>{title}</h3>
              <p style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.6, margin: 0 }}>{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section style={{ padding: '60px 24px', background: '#f9fafb' }}>
        <div style={{ maxWidth: 700, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontSize: 28, fontWeight: 700, color: '#111827', marginBottom: 36 }}>¿Quién usa Education AI?</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            {USE_CASES.map(uc => (
              <div key={uc} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderRadius: 10, background: '#fff', border: '1px solid #e5e7eb', fontSize: 14, color: '#374151' }}>
                <CheckCircle size={14} color={O} /> {uc}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ padding: '80px 24px', textAlign: 'center', background: O }}>
        <h2 style={{ fontSize: 32, fontWeight: 800, color: '#fff', marginBottom: 16 }}>Transforma la educación con IA personalizada</h2>
        <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 16, marginBottom: 32, maxWidth: 500, margin: '0 auto 32px' }}>Comienza con 7 días gratis. Sin tarjeta de crédito.</p>
        <Link href="/register" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '16px 32px', borderRadius: 12, background: '#fff', color: O, fontWeight: 700, textDecoration: 'none', fontSize: 16 }}>
          <Zap size={18} /> Crear tutor IA
        </Link>
      </section>
    </div>
  );
}
