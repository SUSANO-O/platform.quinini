'use client';

import { Navbar } from '@/components/shared/navbar';
import { Footer } from '@/components/shared/footer';
import Link from 'next/link';
import { useState } from 'react';
import {
  ArrowRight, CheckCircle2, Code2, Globe, Key, LayoutTemplate,
  MessageSquare, Package, Sparkles, Terminal, Zap, ChevronDown,
  ChevronUp, AlertCircle,
} from 'lucide-react';

/* ──────────────────────────────── data ──────────────────────────────── */

const PLANS = [
  { name: 'Free',       slug: 'free',       widgets: 1,   msgs: 200,   price: '$0',    color: '#64748b' },
  { name: 'Starter',    slug: 'starter',    widgets: 3,   msgs: 500,   price: '$19',   color: '#0d9488' },
  { name: 'Growth',     slug: 'growth',     widgets: 6,   msgs: 2000,  price: '$49',   color: '#6366f1' },
  { name: 'Business',   slug: 'business',   widgets: 12,  msgs: 10000, price: '$129',  color: '#a855f7' },
  { name: 'Enterprise', slug: 'enterprise', widgets: Infinity, msgs: Infinity, price: 'Custom', color: '#f59e0b' },
];

const STEPS = [
  {
    step: '01',
    icon: Key,
    title: 'Regístrate y obtén tu API Key',
    desc: 'Un solo POST crea tu organización y devuelve el orgId y apiKey que necesitas para todo lo demás.',
    code: `curl -X POST https://agentflowhub.com/api/orgs \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Acme Corp",
    "email": "hola@acme.com",
    "plan": "starter"
  }'`,
    response: `{
  "org": {
    "id": "org_a1b2c3d4",
    "apiKey": "afhub_xxxxxxxx...",
    "plan": "starter",
    "maxWidgets": 3
  }
}`,
  },
  {
    step: '02',
    icon: Package,
    title: 'Crea un Widget',
    desc: 'Asocia el widget a tu agente de IA y define los dominios que pueden usarlo.',
    code: `curl -X POST https://agentflowhub.com/api/orgs/org_a1b2c3d4/widgets \\
  -H "X-Api-Key: afhub_xxxxxxxx..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Chat de soporte",
    "agentId": "mi-agente-id",
    "allowedOrigins": "https://acme.com"
  }'`,
    response: `{
  "widget": {
    "id": "wgt_11223344",
    "token": "wt_yyyyyyyyyy...",
    "remaining": 2
  }
}`,
  },
  {
    step: '03',
    icon: LayoutTemplate,
    title: 'Pega el snippet en tu web',
    desc: 'Una sola línea antes del </body>. Cero dependencias, cero configuración extra.',
    code: `<script
  src="https://agentflowhub.com/widget.js"
  data-agent-id="mi-agente-id"
  data-token="wt_yyyyyyyyyy..."
  data-title="Soporte Acme"
  data-color="#6366f1"
  async
></script>`,
    response: null,
  },
];

const ATTRIBUTES = [
  { attr: 'data-agent-id', default: '—',       desc: 'Requerido. ID del agente' },
  { attr: 'data-token',    default: '—',       desc: 'Requerido. Widget token (wt_...)' },
  { attr: 'data-title',    default: 'Asistente', desc: 'Nombre en la cabecera del chat' },
  { attr: 'data-subtitle', default: 'En línea', desc: 'Subtítulo' },
  { attr: 'data-welcome',  default: 'Bienvenido...', desc: 'Mensaje inicial' },
  { attr: 'data-color',    default: '#6366f1', desc: 'Color principal (hex)' },
  { attr: 'data-theme',    default: 'light',   desc: 'light o dark' },
  { attr: 'data-position', default: 'right',   desc: 'right, left, center' },
  { attr: 'data-auto-open',default: 'false',   desc: 'Abrir automáticamente' },
];

const ERRORS = [
  { code: '400', body: '—',                      cause: 'Faltan name, email o agentId' },
  { code: '401', body: 'WIDGET_TOKEN_INVALID',   cause: 'Token inválido o expirado' },
  { code: '403', body: 'PLAN_LIMIT',             cause: 'Alcanzaste el límite de widgets del plan' },
  { code: '403', body: 'WIDGET_ORIGIN_FORBIDDEN',cause: 'Dominio no está en allowedOrigins' },
  { code: '403', body: 'WIDGET_AGENT_MISMATCH',  cause: 'El agentId no coincide con el token' },
  { code: '409', body: '—',                      cause: 'Ya existe una org con ese email' },
  { code: '429', body: 'RATE_LIMIT',             cause: 'Demasiadas solicitudes (global)' },
  { code: '429', body: 'PLAN_DAILY_LIMIT',       cause: 'Límite diario de mensajes agotado' },
];

const FEATURES = [
  { icon: Zap,           title: 'Sin dependencias', desc: 'Un script tag es todo lo que necesitas. Sin npm, sin bundlers.' },
  { icon: Globe,         title: 'Multi-origen',     desc: 'Define los dominios autorizados y bloquea el resto automáticamente.' },
  { icon: MessageSquare, title: 'API programática', desc: 'Control total desde JS: open(), close(), onMessageReceived, onOpen.' },
  { icon: Code2,         title: 'Personalizable',   desc: 'Colores, tema, posición, mensaje de bienvenida. Encaja con tu marca.' },
];

/* ──────────────────────────────── components ──────────────────────────────── */

function CodeBlock({ code, lang = 'bash' }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="relative rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between px-4 py-2" style={{ background: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#ef4444' }} />
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#f59e0b' }} />
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#22c55e' }} />
          <span className="ml-2 text-xs font-mono" style={{ color: 'var(--muted-foreground)' }}>{lang}</span>
        </div>
        <button
          onClick={copy}
          className="text-xs px-2.5 py-1 rounded-lg transition-all font-medium"
          style={{
            background: copied ? 'rgba(13,148,136,0.15)' : 'var(--card)',
            color: copied ? '#0d9488' : 'var(--muted-foreground)',
            border: '1px solid var(--border)',
          }}
        >
          {copied ? 'Copiado!' : 'Copiar'}
        </button>
      </div>
      <pre className="p-4 text-xs leading-relaxed overflow-x-auto" style={{ background: '#0f1729', color: '#e2e8f0' }}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

function PlanCard({ plan, active }: { plan: typeof PLANS[0]; active: boolean }) {
  const isEnterprise = plan.slug === 'enterprise';
  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-3 transition-all"
      style={{
        border: active ? `2px solid ${plan.color}` : '1px solid var(--border)',
        background: active ? `${plan.color}10` : 'var(--card)',
        boxShadow: active ? `0 0 24px ${plan.color}30` : 'none',
      }}
    >
      <div className="flex items-center justify-between">
        <span className="font-bold text-sm">{plan.name}</span>
        <span className="text-xl font-extrabold" style={{ color: plan.color }}>{plan.price}</span>
      </div>
      <div className="flex flex-col gap-1.5 text-xs" style={{ color: 'var(--muted-foreground)' }}>
        <div className="flex items-center gap-1.5">
          <CheckCircle2 size={12} style={{ color: plan.color }} />
          {isEnterprise ? 'Widgets ilimitados' : `${plan.widgets} widget${plan.widgets > 1 ? 's' : ''}`}
        </div>
        <div className="flex items-center gap-1.5">
          <CheckCircle2 size={12} style={{ color: plan.color }} />
          {isEnterprise ? 'Mensajes ilimitados/día' : `${plan.msgs.toLocaleString()} msgs/día`}
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────── page ──────────────────────────────── */

export default function WidgetLandingPage() {
  const [activePlan, setActivePlan] = useState('starter');
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const faqs = [
    {
      q: '¿Puedo usar el widget en cualquier framework?',
      a: 'Sí. Es un script tag estándar — funciona en React, Vue, Angular, WordPress, Webflow, HTML puro, o cualquier sitio web.',
    },
    {
      q: '¿Cómo protejo el widget para que solo funcione en mi dominio?',
      a: 'Al crear el widget defines allowedOrigins. Si alguien intenta usar tu token desde otro dominio, la API devuelve 403 WIDGET_ORIGIN_FORBIDDEN.',
    },
    {
      q: '¿Puedo tener múltiples widgets con diferentes agentes?',
      a: 'Sí, cada widget tiene su propio token y se asocia a un agente distinto. El número de widgets disponibles depende de tu plan.',
    },
    {
      q: '¿Qué pasa si supero el límite diario de mensajes?',
      a: 'El servidor devuelve 429 PLAN_DAILY_LIMIT. El widget muestra un mensaje amigable al usuario. Los límites se resetean cada 24 horas.',
    },
  ];

  return (
    <div style={{ background: 'var(--background)', color: 'var(--foreground)' }}>
      <Navbar />

      {/* ── Hero ── */}
      <section className="relative pt-32 pb-20 overflow-hidden">
        <div className="hero-glow" style={{ background: '#6366f1', top: '-180px', left: '5%' }} />
        <div className="hero-glow" style={{ background: '#0d9488', top: '-80px', right: '10%' }} />
        <div className="hero-glow" style={{ background: '#a855f7', top: '220px', left: '50%' }} />

        <div className="relative max-w-5xl mx-auto px-6 text-center">
          <div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold mb-8"
            style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1', border: '1px solid rgba(99,102,241,0.25)' }}
          >
            <Sparkles size={14} /> Chat Widget SDK — Embed AI en 3 minutos
          </div>

          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight leading-[1.1]">
            Tu agente de IA,
            <br />
            <span className="gradient-text">en cualquier web</span>
          </h1>

          <p className="mt-6 text-lg md:text-xl max-w-2xl mx-auto" style={{ color: 'var(--muted-foreground)' }}>
            Un script tag. Sin dependencias. Sin configuración compleja. Embeds un chat widget
            completamente funcional en tu sitio en menos de 3 minutos.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl text-white font-semibold text-sm transition-all hover:shadow-xl hover:scale-[1.02]"
              style={{ background: 'linear-gradient(135deg, #6366f1, #a855f7)' }}
            >
              Crear cuenta gratis <ArrowRight size={16} />
            </Link>
            <a
              href="#how-it-works"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl font-semibold text-sm transition-all"
              style={{ border: '1px solid var(--border)', color: 'var(--foreground)' }}
            >
              Ver cómo funciona
            </a>
          </div>

          {/* Snippet preview */}
          <div className="mt-16 max-w-2xl mx-auto text-left">
            <CodeBlock
              lang="html · snippet"
              code={`<script
  src="https://agentflowhub.com/widget.js"
  data-agent-id="mi-agente-id"
  data-token="wt_yyyyyyyyyy..."
  data-title="Soporte"
  data-color="#6366f1"
  async
></script>`}
            />
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="py-20 px-6" style={{ background: 'var(--muted)' }}>
        <div className="max-w-6xl mx-auto">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-2xl p-6 transition-all hover:shadow-md"
                style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: 'rgba(99,102,241,0.1)' }}
                >
                  <f.icon size={18} style={{ color: '#6366f1' }} />
                </div>
                <h3 className="text-sm font-bold mb-1">{f.title}</h3>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how-it-works" className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold">3 pasos para estar en vivo</h2>
            <p className="mt-4" style={{ color: 'var(--muted-foreground)' }}>
              Del registro al widget embebido sin fricciones.
            </p>
          </div>

          <div className="space-y-16">
            {STEPS.map((s, i) => (
              <div key={s.step} className="grid md:grid-cols-2 gap-8 items-start">
                {/* Left: description */}
                <div className={i % 2 === 1 ? 'md:order-2' : ''}>
                  <div className="flex items-center gap-4 mb-4">
                    <div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 font-extrabold text-sm"
                      style={{ background: 'linear-gradient(135deg, #6366f1, #a855f7)', color: '#fff' }}
                    >
                      {s.step}
                    </div>
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-widest mb-0.5" style={{ color: '#6366f1' }}>
                        Paso {s.step}
                      </div>
                      <h3 className="text-xl font-bold">{s.title}</h3>
                    </div>
                  </div>
                  <p className="text-sm leading-relaxed mb-6" style={{ color: 'var(--muted-foreground)' }}>{s.desc}</p>

                  {s.response && (
                    <div>
                      <p className="text-xs font-semibold mb-2" style={{ color: 'var(--muted-foreground)' }}>Respuesta</p>
                      <CodeBlock lang="json" code={s.response} />
                    </div>
                  )}
                </div>

                {/* Right: code */}
                <div className={i % 2 === 1 ? 'md:order-1' : ''}>
                  <CodeBlock lang={i === 2 ? 'html' : 'bash'} code={s.code} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── JS API ── */}
      <section className="py-24 px-6" style={{ background: 'var(--muted)' }}>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold">API programática (opcional)</h2>
            <p className="mt-4" style={{ color: 'var(--muted-foreground)' }}>
              Control total desde JavaScript — abre/cierra el chat, escucha eventos, integra con tu UI.
            </p>
          </div>

          <CodeBlock
            lang="javascript"
            code={`<script src="https://agentflowhub.com/widget.js" async></script>
<script>
  window.addEventListener('load', function () {
    const chat = window.AgentFlowhub.init({
      agentId: 'mi-agente-id',
      token:   'wt_yyyyyyyyyy...',
      host:    'https://agentflowhub.com',
      title:   'Soporte Acme',
      color:   '#6366f1',
      theme:   'dark',
      onOpen:  function () { console.log('chat abierto'); },
      onMessageReceived: function (msg) { console.log('respuesta:', msg); },
    });

    // Conectar a tu propio botón de soporte
    document.getElementById('btn-soporte').addEventListener('click', function () {
      chat.open();
    });
  });
</script>`}
          />
        </div>
      </section>

      {/* ── Attributes table ── */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold">Atributos configurables</h2>
            <p className="mt-4" style={{ color: 'var(--muted-foreground)' }}>
              Todos los parámetros del script tag y su equivalente en la API JS.
            </p>
          </div>

          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            <div
              className="grid grid-cols-3 text-xs font-semibold uppercase tracking-wider px-6 py-3"
              style={{ background: 'var(--muted)', color: 'var(--muted-foreground)', borderBottom: '1px solid var(--border)' }}
            >
              <div>Atributo</div>
              <div>Default</div>
              <div>Descripción</div>
            </div>
            {ATTRIBUTES.map((a, i) => (
              <div
                key={a.attr}
                className="grid grid-cols-3 px-6 py-3.5 text-sm"
                style={{
                  borderBottom: i < ATTRIBUTES.length - 1 ? '1px solid var(--border)' : 'none',
                  background: i % 2 === 0 ? 'var(--card)' : 'var(--background)',
                }}
              >
                <code className="text-xs font-mono" style={{ color: '#6366f1' }}>{a.attr}</code>
                <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{a.default}</span>
                <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{a.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Plans ── */}
      <section className="py-24 px-6" style={{ background: 'var(--muted)' }}>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold">Planes disponibles</h2>
            <p className="mt-4" style={{ color: 'var(--muted-foreground)' }}>
              Empieza gratis. Escala cuando lo necesites.
            </p>
          </div>

          <div className="grid sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {PLANS.map((plan) => (
              <button
                key={plan.slug}
                onClick={() => setActivePlan(plan.slug)}
                className="text-left"
              >
                <PlanCard plan={plan} active={activePlan === plan.slug} />
              </button>
            ))}
          </div>

          <div className="mt-8 text-center">
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 text-sm font-semibold"
              style={{ color: '#6366f1' }}
            >
              Ver todos los detalles de precios <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Error codes ── */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold">Códigos de error</h2>
            <p className="mt-4" style={{ color: 'var(--muted-foreground)' }}>
              Respuestas estandarizadas para un manejo de errores predecible.
            </p>
          </div>

          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            <div
              className="grid grid-cols-3 text-xs font-semibold uppercase tracking-wider px-6 py-3"
              style={{ background: 'var(--muted)', color: 'var(--muted-foreground)', borderBottom: '1px solid var(--border)' }}
            >
              <div>HTTP</div>
              <div>code</div>
              <div>Causa</div>
            </div>
            {ERRORS.map((e, i) => (
              <div
                key={i}
                className="grid grid-cols-3 px-6 py-3.5 text-sm items-center"
                style={{
                  borderBottom: i < ERRORS.length - 1 ? '1px solid var(--border)' : 'none',
                  background: i % 2 === 0 ? 'var(--card)' : 'var(--background)',
                }}
              >
                <span
                  className="inline-flex items-center gap-1.5 text-xs font-bold w-fit px-2 py-0.5 rounded-md"
                  style={{
                    background: e.code.startsWith('4') ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
                    color: e.code.startsWith('4') ? '#ef4444' : '#f59e0b',
                  }}
                >
                  <AlertCircle size={10} /> {e.code}
                </span>
                <code className="text-xs font-mono" style={{ color: '#6366f1' }}>{e.body}</code>
                <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{e.cause}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="py-24 px-6" style={{ background: 'var(--muted)' }}>
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold">Preguntas frecuentes</h2>
          </div>

          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <div
                key={i}
                className="rounded-2xl overflow-hidden"
                style={{ border: '1px solid var(--border)', background: 'var(--card)' }}
              >
                <button
                  className="w-full flex items-center justify-between px-6 py-4 text-left"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  <span className="font-semibold text-sm">{faq.q}</span>
                  {openFaq === i
                    ? <ChevronUp size={16} style={{ color: 'var(--muted-foreground)', flexShrink: 0 }} />
                    : <ChevronDown size={16} style={{ color: 'var(--muted-foreground)', flexShrink: 0 }} />
                  }
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-5 text-sm leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Flow summary ── */}
      <section className="py-16 px-6">
        <div className="max-w-3xl mx-auto">
          <div
            className="rounded-2xl p-8"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
          >
            <div className="flex items-center gap-2 mb-5">
              <Terminal size={16} style={{ color: '#6366f1' }} />
              <span className="text-sm font-bold">Flujo completo en 3 líneas</span>
            </div>
            <div className="space-y-3">
              {[
                { n: '1', text: 'POST /api/orgs', sub: '→ obtienes orgId + apiKey' },
                { n: '2', text: 'POST /api/orgs/:id/widgets', sub: '→ obtienes token (wt_...)' },
                { n: '3', text: 'Pega el <script> en tu web', sub: '→ listo ✓' },
              ].map((r) => (
                <div key={r.n} className="flex items-center gap-4">
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-extrabold shrink-0"
                    style={{ background: 'linear-gradient(135deg, #6366f1, #a855f7)', color: '#fff' }}
                  >
                    {r.n}
                  </div>
                  <code className="text-sm font-mono" style={{ color: 'var(--foreground)' }}>{r.text}</code>
                  <span className="text-sm" style={{ color: 'var(--muted-foreground)' }}>{r.sub}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-24 px-6 text-center relative overflow-hidden">
        <div className="hero-glow" style={{ background: '#6366f1', bottom: '-200px', left: '15%' }} />
        <div className="hero-glow" style={{ background: '#a855f7', bottom: '-100px', right: '15%' }} />

        <div className="relative max-w-2xl mx-auto">
          <h2 className="text-3xl md:text-5xl font-extrabold mb-6">
            Empieza hoy —{' '}
            <span className="gradient-text">es gratis</span>
          </h2>
          <p className="text-lg mb-10" style={{ color: 'var(--muted-foreground)' }}>
            Sin tarjeta de crédito. Sin configuración compleja. Tu widget de IA en 3 minutos.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl text-white font-semibold transition-all hover:shadow-xl hover:scale-[1.02]"
              style={{ background: 'linear-gradient(135deg, #6366f1, #a855f7)' }}
            >
              Crear cuenta gratis <ArrowRight size={18} />
            </Link>
            <Link
              href="/docs"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-semibold text-sm transition-all"
              style={{ border: '1px solid var(--border)', color: 'var(--foreground)' }}
            >
              <Code2 size={16} /> Ver documentación completa
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
