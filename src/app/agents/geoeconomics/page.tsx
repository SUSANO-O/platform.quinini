'use client';

import { Navbar } from '@/components/shared/navbar';
import { Footer } from '@/components/shared/footer';
import Link from 'next/link';
import {
  Globe, TrendingUp, Shield, BarChart3, ArrowRight, Zap,
  Scale, Landmark, Ship, AlertTriangle, LineChart, Target
} from 'lucide-react';
import { useEffect } from 'react';

const CAPABILITIES = [
  {
    icon: BarChart3,
    title: 'Indicadores Macroeconómicos',
    desc: 'PIB, inflación, desempleo, deuda, balanza comercial, inversión extranjera directa. Análisis en tiempo real de la salud económica de cualquier país.',
  },
  {
    icon: Ship,
    title: 'Comercio Bilateral',
    desc: 'Evaluación de relaciones comerciales entre países. Dependencias, oportunidades, riesgos y recomendaciones estratégicas.',
  },
  {
    icon: AlertTriangle,
    title: 'Riesgo Geopolítico',
    desc: 'Conflictos, sanciones, cadenas de suministro, estabilidad institucional. Índice de riesgo y estrategias de mitigación.',
  },
  {
    icon: Scale,
    title: 'Sanciones & Regulación',
    desc: 'Impacto de sanciones internacionales, guerras comerciales, compliance y regulación transfronteriza.',
  },
  {
    icon: Target,
    title: 'Estrategia de Inversión',
    desc: 'Perspectivas de inversión por región, análisis de riesgo-retorno, diversificación geográfica y oportunidades emergentes.',
  },
  {
    icon: LineChart,
    title: 'Tendencias Globales',
    desc: 'Desglobalización, nearshoring, transición energética, monedas digitales, y su impacto en la economía mundial.',
  },
];

const USE_CASES = [
  {
    title: 'Análisis país: Argentina',
    input: '{ "analysisType": "country", "country": "Argentina", "gdpGrowth": -1.6, "inflation": 211, "unemployment": 6.2, "debtToGdp": 89 }',
    result: 'Inflación crítica (211%), recesión activa. Riesgo alto. Recomendación: reestructuración de deuda y estabilización monetaria.',
  },
  {
    title: 'Relación bilateral: EEUU - China',
    input: '{ "analysisType": "bilateral", "country": "EEUU", "countryB": "China", "tradeVolume": 690000, "geopoliticalTension": "high" }',
    result: 'Dependencia crítica en semiconductores. Tensión alta reduce cooperación. Diversificación urgente de cadenas de suministro.',
  },
  {
    title: 'Riesgo regional: Medio Oriente',
    input: '{ "analysisType": "regional", "region": "Medio Oriente", "activeConflicts": true, "supplyChainCritical": true }',
    result: 'Riesgo extremo por conflictos activos. Cadenas de suministro energético amenazadas. Seguros de riesgo político recomendados.',
  },
];

export default function GeoeconomicsLandingPage() {
  useEffect(() => {
    // Load the Widget SDK
    const script = document.createElement('script');
    script.src = `${window.location.protocol}//${window.location.hostname}:9002/widget.js`;
    script.onload = () => {
      if ((window as any).AgentFlowhub) {
        (window as any).AgentFlowhub.init({
          agentId: 'agente-de-geoeconomia',
          token: '',
          host: `${window.location.protocol}//${window.location.hostname}:9002`,
          title: 'Analista Geoeconómico',
          subtitle: 'Pregúntame sobre economía global',
          color: '#0d9488',
          position: 'right',
          theme: 'dark',
          borderRadius: 16,
        });
      }
    };
    document.head.appendChild(script);

    return () => {
      // Cleanup widget on unmount
      const widget = document.getElementById('agentflow-widget-container');
      if (widget) widget.remove();
      script.remove();
    };
  }, []);

  return (
    <div style={{ background: 'var(--background)', color: 'var(--foreground)' }}>
      <Navbar />

      {/* Hero */}
      <section className="relative pt-32 pb-20 overflow-hidden">
        <div className="hero-glow" style={{ background: '#0d9488', top: '-200px', left: '5%' }} />
        <div className="hero-glow" style={{ background: '#1e40af', top: '-100px', right: '10%' }} />
        <div className="hero-glow" style={{ background: '#7c3aed', top: '200px', left: '50%' }} />

        <div className="relative max-w-5xl mx-auto px-6 text-center">
          <div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold mb-8"
            style={{ background: 'rgba(13,148,136,0.1)', color: '#0d9488', border: '1px solid rgba(13,148,136,0.2)' }}
          >
            <Globe size={14} />
            AI-Powered Geoeconomic Analysis
          </div>

          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight leading-[1.1]">
            Inteligencia
            <br />
            <span className="gradient-text">Geoeconómica</span>
          </h1>

          <p className="mt-6 text-lg md:text-xl max-w-2xl mx-auto" style={{ color: 'var(--muted-foreground)' }}>
            Analiza economías, relaciones comerciales y riesgos geopolíticos con IA.
            Datos macro, sanciones, cadenas de suministro — todo en una API.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl text-white font-semibold text-sm transition-all hover:shadow-xl hover:scale-[1.02]"
              style={{ background: 'linear-gradient(135deg, #0d9488, #1e40af)' }}
            >
              <Zap size={16} /> Probar Gratis <ArrowRight size={16} />
            </Link>
            <Link
              href="/playground"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl font-semibold text-sm transition-all"
              style={{ border: '1px solid var(--border)', color: 'var(--foreground)' }}
            >
              <TrendingUp size={16} /> Ver en Playground
            </Link>
          </div>
        </div>
      </section>

      {/* Live Chat CTA */}
      <section className="py-12 px-6 text-center">
        <div className="max-w-2xl mx-auto rounded-2xl p-8" style={{ background: 'rgba(13,148,136,0.05)', border: '1px solid rgba(13,148,136,0.15)' }}>
          <Globe size={32} style={{ color: '#0d9488' }} className="mx-auto mb-3" />
          <h3 className="text-xl font-bold mb-2">Prueba el agente ahora</h3>
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
            Haz click en el widget de chat en la esquina inferior derecha para conversar con el Agente de Geoeconomía en tiempo real.
          </p>
        </div>
      </section>

      {/* Capabilities */}
      <section className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold">
              Análisis <span className="gradient-text">completo</span> de la economía global
            </h2>
            <p className="mt-4 text-lg" style={{ color: 'var(--muted-foreground)' }}>
              Desde indicadores macro hasta riesgo geopolítico, todo con una sola API.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {CAPABILITIES.map((cap) => (
              <div
                key={cap.title}
                className="rounded-2xl p-7 transition-all hover:shadow-lg hover:-translate-y-1"
                style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
              >
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: 'rgba(13,148,136,0.1)' }}
                >
                  <cap.icon size={20} style={{ color: '#0d9488' }} />
                </div>
                <h3 className="text-lg font-bold mb-2">{cap.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>{cap.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* API Example */}
      <section className="py-24 px-6" style={{ background: 'var(--muted)' }}>
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold">Una API, múltiples análisis</h2>
          </div>

          <div className="rounded-2xl overflow-hidden shadow-xl" style={{ border: '1px solid var(--border)' }}>
            <div className="px-5 py-3 flex items-center gap-2" style={{ background: 'var(--card)', borderBottom: '1px solid var(--border)' }}>
              <div className="w-3 h-3 rounded-full" style={{ background: '#ef4444' }} />
              <div className="w-3 h-3 rounded-full" style={{ background: '#f59e0b' }} />
              <div className="w-3 h-3 rounded-full" style={{ background: '#22c55e' }} />
              <span className="ml-2 text-xs font-mono" style={{ color: 'var(--muted-foreground)' }}>curl — geoeconomics agent</span>
            </div>
            <pre className="p-6 text-sm overflow-x-auto" style={{ background: '#0f1729', color: '#e2e8f0' }}>
{`curl -X POST https://api.agentflowhub.com/gateway/agent-farm \\
  -H "Authorization: Bearer afhub_live_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "agent": "geoeconomics",
    "data": {
      "analysisType": "country",
      "country": "Brazil",
      "gdpGrowth": 2.9,
      "inflation": 4.6,
      "unemployment": 7.8,
      "debtToGdp": 74,
      "tradeBalance": 8500,
      "fdi": 65000
    }
  }'`}
            </pre>
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold">Casos de uso</h2>
          </div>

          <div className="space-y-6">
            {USE_CASES.map((uc) => (
              <div
                key={uc.title}
                className="rounded-2xl p-7"
                style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
              >
                <div className="flex items-start gap-4">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(13,148,136,0.1)' }}
                  >
                    <Landmark size={18} style={{ color: '#0d9488' }} />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-bold mb-2">{uc.title}</h3>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs font-semibold uppercase mb-1" style={{ color: 'var(--muted-foreground)' }}>Input</p>
                        <pre className="rounded-lg p-3 text-xs overflow-x-auto" style={{ background: 'var(--muted)' }}>
                          {uc.input}
                        </pre>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase mb-1" style={{ color: 'var(--muted-foreground)' }}>Resultado</p>
                        <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>{uc.result}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Widget SDK embed section */}
      <section className="py-24 px-6" style={{ background: 'var(--muted)' }}>
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">Embede el agente en tu sitio</h2>
          <p className="mb-8" style={{ color: 'var(--muted-foreground)' }}>
            Usa el Widget SDK para agregar el analista geoeconómico a cualquier página web.
          </p>

          <div className="rounded-2xl overflow-hidden text-left" style={{ border: '1px solid var(--border)' }}>
            <div className="px-5 py-3" style={{ background: 'var(--card)', borderBottom: '1px solid var(--border)' }}>
              <span className="text-xs font-mono" style={{ color: 'var(--muted-foreground)' }}>HTML — embed code</span>
            </div>
            <pre className="p-6 text-sm overflow-x-auto" style={{ background: '#0f1729', color: '#e2e8f0' }}>
{`<script src="https://agentflowhub.com/widget.js"></script>
<script>
  AgentFlowhub.init({
    agentId: "agente-de-geoeconomia",
    token: "YOUR_WIDGET_TOKEN",
    host: "https://agentflowhub.com",
    title: "Analista Geoeconómico",
    subtitle: "Pregúntame sobre economía global",
    color: "#0d9488",
    theme: "dark"
  });
</script>`}
            </pre>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6 text-center relative overflow-hidden">
        <div className="hero-glow" style={{ background: '#0d9488', bottom: '-200px', left: '20%' }} />
        <div className="hero-glow" style={{ background: '#1e40af', bottom: '-100px', right: '20%' }} />

        <div className="relative max-w-2xl mx-auto">
          <h2 className="text-3xl md:text-5xl font-extrabold mb-6">
            Empieza a analizar la <span className="gradient-text">economía global</span>
          </h2>
          <p className="text-lg mb-10" style={{ color: 'var(--muted-foreground)' }}>
            500 requests gratis al mes. Sin tarjeta de crédito. Upgrade cuando quieras.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl text-white font-semibold transition-all hover:shadow-xl hover:scale-[1.02]"
              style={{ background: 'linear-gradient(135deg, #0d9488, #1e40af)' }}
            >
              Obtener API Key <ArrowRight size={18} />
            </Link>
            <Link
              href="/docs"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-semibold transition-all"
              style={{ border: '1px solid var(--border)', color: 'var(--foreground)' }}
            >
              Ver Documentación
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
