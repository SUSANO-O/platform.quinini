'use client';

/**
 * /crear — Onboarding tipo BetterMe: un quiz anónimo que, al final, arma un agente listo para usar
 * (no para configurar). La generación es determinista (sin IA = sin coste). Al terminar, el usuario
 * puede activarlo creando su cuenta, o hablar directo por WhatsApp. Flujo nuevo, en paralelo al
 * dashboard: no toca nada existente.
 */

import { useMemo, useState, useCallback, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import {
  QUIZ_STEPS,
  QUIZ_SECTIONS,
  type QuizAnswers,
  type QuizStep,
} from '@/lib/onboarding/quiz-config';
import { buildAgentFromQuiz, toCreateAgentPayload } from '@/lib/onboarding/quiz-to-agent';
import { buildContactWhatsAppUrl } from '@/lib/sales-whatsapp';

const STORAGE_KEY = 'botiva_onboarding_v1';

type Phase = 'quiz' | 'building' | 'reveal';

export default function CrearPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" style={{ background: '#080F1C' }} />}>
      <CrearInner />
    </Suspense>
  );
}

function CrearInner() {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<QuizAnswers>({});
  const [phase, setPhase] = useState<Phase>('quiz');
  const searchParams = useSearchParams();

  // Al volver del login (?resume=1) retomamos el reveal con las respuestas guardadas.
  useEffect(() => {
    if (searchParams.get('resume') !== '1') return;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        setAnswers(JSON.parse(raw) as QuizAnswers);
        setPhase('reveal');
      }
    } catch {
      /* sessionStorage no disponible — se reinicia el quiz */
    }
  }, [searchParams]);

  const step = QUIZ_STEPS[index];
  const totalQuestions = useMemo(
    () => QUIZ_STEPS.filter((s) => s.kind !== 'interstitial').length,
    [],
  );
  const answeredCount = useMemo(
    () => QUIZ_STEPS.slice(0, index).filter((s) => s.kind !== 'interstitial').length,
    [index],
  );

  const goNext = useCallback(() => {
    setIndex((i) => {
      const next = i + 1;
      if (next >= QUIZ_STEPS.length) {
        setPhase('building');
        return i;
      }
      return next;
    });
  }, []);

  const goBack = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  const setAnswer = useCallback((id: string, value: unknown) => {
    setAnswers((a) => ({ ...a, [id]: value }));
  }, []);

  const finishBuilding = useCallback(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(answers));
    } catch {
      /* sessionStorage puede fallar en modo privado — el reveal funciona igual */
    }
    // Registra el lead (fire-and-forget; no bloquea el reveal).
    try {
      const gen = buildAgentFromQuiz(answers);
      void fetch('/api/leads', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          businessName: answers.businessName ?? '',
          businessType: answers.businessType ?? '',
          goal: answers.goal ?? '',
          tone: answers.tone ?? '',
          language: answers.language ?? '',
          collectFields: answers.collectFields ?? [],
          website: answers.website ?? '',
          whatsapp: answers.whatsapp ?? '',
          agentName: gen.name,
          answers,
        }),
      }).catch(() => {});
    } catch {
      /* si falla el registro, el reveal sigue funcionando */
    }
    setPhase('reveal');
  }, [answers]);

  return (
    <div
      className="min-h-screen w-full text-white"
      style={{ background: 'radial-gradient(1200px 600px at 50% -10%, #0c1a2e 0%, #080F1C 55%)' }}
    >
      {phase === 'quiz' && (
        <QuizView
          step={step}
          index={index}
          answers={answers}
          answeredCount={answeredCount}
          totalQuestions={totalQuestions}
          onBack={goBack}
          onNext={goNext}
          setAnswer={setAnswer}
        />
      )}
      {phase === 'building' && <BuildingView onDone={finishBuilding} />}
      {phase === 'reveal' && <RevealView answers={answers} />}
    </div>
  );
}

/* ─────────────────────────── Header + progreso ─────────────────────────── */

function Header({
  onBack,
  showBack,
  sectionLabel,
  progress,
}: {
  onBack: () => void;
  showBack: boolean;
  sectionLabel: string;
  progress: number;
}) {
  return (
    <header className="sticky top-0 z-10" style={{ background: 'rgba(8,15,28,0.85)', backdropFilter: 'blur(8px)' }}>
      <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-4">
        {showBack ? (
          <button
            onClick={onBack}
            aria-label="Atrás"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/25 text-white/80 transition hover:bg-white/10"
          >
            ←
          </button>
        ) : (
          <div className="h-9 w-9" />
        )}
        <span className="text-lg font-bold tracking-tight">BotIvA</span>
        <span className="flex-1 text-center text-sm text-white/60">{sectionLabel}</span>
        <div className="h-9 w-9" />
      </div>
      <div className="h-[3px] w-full bg-white/10">
        <div
          className="h-full transition-all duration-500"
          style={{ width: `${Math.round(progress * 100)}%`, background: '#2DD4BF' }}
        />
      </div>
    </header>
  );
}

/* ─────────────────────────────── Quiz ──────────────────────────────────── */

function QuizView({
  step,
  index,
  answers,
  answeredCount,
  totalQuestions,
  onBack,
  onNext,
  setAnswer,
}: {
  step: QuizStep;
  index: number;
  answers: QuizAnswers;
  answeredCount: number;
  totalQuestions: number;
  onBack: () => void;
  onNext: () => void;
  setAnswer: (id: string, value: unknown) => void;
}) {
  const sectionLabel = QUIZ_SECTIONS.find((s) => s.id === step.section)?.label ?? '';
  const progress = totalQuestions ? answeredCount / totalQuestions : 0;

  return (
    <>
      <Header onBack={onBack} showBack={index > 0} sectionLabel={sectionLabel} progress={progress} />
      <main className="mx-auto flex max-w-xl flex-col items-center px-4 pt-10 pb-24 sm:pt-16">
        <h1 className="text-center text-3xl font-semibold leading-tight sm:text-4xl">{step.title}</h1>
        {'subtitle' in step && step.subtitle && (
          <p className="mt-3 text-center text-sm uppercase tracking-wide text-white/50">{step.subtitle}</p>
        )}

        <div className="mt-8 w-full">
          {step.kind === 'single' && (
            <SingleChoice step={step} answers={answers} onPick={(v) => { setAnswer(step.id, v); setTimeout(onNext, 500); }} />
          )}
          {step.kind === 'multi' && (
            <MultiChoice step={step} answers={answers} setAnswer={setAnswer} onNext={onNext} />
          )}
          {step.kind === 'text' && (
            <TextInput step={step} answers={answers} setAnswer={setAnswer} onNext={onNext} />
          )}
          {step.kind === 'interstitial' && <Interstitial step={step} answers={answers} onNext={onNext} />}
        </div>
      </main>
    </>
  );
}

function OptionCard({
  label,
  hint,
  selected,
  onClick,
  multi,
}: {
  label: string;
  hint?: string;
  selected: boolean;
  onClick: () => void;
  multi?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-2xl border px-5 py-4 text-left transition"
      style={{
        borderColor: selected ? '#2DD4BF' : 'rgba(255,255,255,0.12)',
        background: selected ? 'rgba(45,212,191,0.12)' : 'rgba(255,255,255,0.04)',
      }}
    >
      <span>
        <span className="block text-base font-medium">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-white/50">{hint}</span>}
      </span>
      <span
        className="ml-3 flex h-5 w-5 flex-shrink-0 items-center justify-center text-xs"
        style={{
          borderRadius: multi ? 6 : 999,
          border: `2px solid ${selected ? '#2DD4BF' : 'rgba(255,255,255,0.3)'}`,
          background: selected ? '#2DD4BF' : 'transparent',
          color: '#080F1C',
        }}
      >
        {selected ? '✓' : ''}
      </span>
    </button>
  );
}

function SingleChoice({
  step,
  answers,
  onPick,
}: {
  step: Extract<QuizStep, { kind: 'single' }>;
  answers: QuizAnswers;
  onPick: (value: string) => void;
}) {
  const current = (answers as Record<string, unknown>)[step.id];
  return (
    <div className="flex flex-col gap-3">
      {step.options.map((o) => (
        <OptionCard
          key={o.value}
          label={o.label}
          hint={o.hint}
          selected={current === o.value}
          onClick={() => onPick(o.value)}
        />
      ))}
    </div>
  );
}

function MultiChoice({
  step,
  answers,
  setAnswer,
  onNext,
}: {
  step: Extract<QuizStep, { kind: 'multi' }>;
  answers: QuizAnswers;
  setAnswer: (id: string, value: unknown) => void;
  onNext: () => void;
}) {
  const selected: string[] = Array.isArray((answers as Record<string, unknown>)[step.id])
    ? ((answers as Record<string, string[]>)[step.id])
    : [];
  const toggle = (v: string) => {
    const has = selected.includes(v);
    const next = v === 'none' ? (has ? [] : ['none']) : [...selected.filter((x) => x !== 'none'), v];
    setAnswer(step.id, has ? selected.filter((x) => x !== v) : next);
  };
  return (
    <div className="flex flex-col gap-3">
      {step.options.map((o) => (
        <OptionCard key={o.value} label={o.label} selected={selected.includes(o.value)} onClick={() => toggle(o.value)} multi />
      ))}
      <ContinueButton onClick={onNext} disabled={selected.length === 0} />
    </div>
  );
}

function TextInput({
  step,
  answers,
  setAnswer,
  onNext,
}: {
  step: Extract<QuizStep, { kind: 'text' }>;
  answers: QuizAnswers;
  setAnswer: (id: string, value: unknown) => void;
  onNext: () => void;
}) {
  const value = String((answers as Record<string, unknown>)[step.id] ?? '');
  const canContinue = step.optional || value.trim().length > 0;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canContinue) onNext();
      }}
      className="flex flex-col gap-4"
    >
      <input
        autoFocus
        type={step.inputType ?? 'text'}
        value={value}
        onChange={(e) => setAnswer(step.id, e.target.value)}
        placeholder={step.placeholder}
        className="w-full rounded-2xl border px-5 py-4 text-base outline-none"
        style={{ borderColor: 'rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.04)' }}
      />
      <ContinueButton onClick={onNext} disabled={!canContinue} label={step.optional && !value.trim() ? 'Omitir' : 'Continuar'} />
    </form>
  );
}

/** Nombre del rubro para personalizar los mensajes intersticiales. */
const BUSINESS_PLURAL: Record<string, string> = {
  ecommerce: 'Las tiendas online',
  services: 'Los negocios de servicios',
  health: 'Las clínicas y negocios de salud',
  realestate: 'Las inmobiliarias',
  education: 'Los negocios de educación',
  other: 'Los negocios como el tuyo',
};

/** Construye el cuerpo del intersticial personalizado según las respuestas. */
function interstitialBody(step: Extract<QuizStep, { kind: 'interstitial' }>, answers: QuizAnswers): string {
  if (step.id === 'proof1') {
    const rubro = BUSINESS_PLURAL[answers.businessType ?? 'other'] ?? BUSINESS_PLURAL.other;
    const offer = (answers.mainOffer ?? '').trim();
    const extra = offer ? ` Tu agente podrá hablar de ${offer.toLowerCase()} con cada cliente.` : '';
    return `${rubro} atienden a sus clientes 24/7 con un agente de BotIvA, sin contratar a nadie más.${extra}`;
  }
  if (step.id === 'proof2') {
    const name = (answers.businessName ?? '').trim();
    return name
      ? `Estamos armando el agente de ${name} a su medida. Solo faltan los datos de contacto.`
      : step.body;
  }
  return step.body;
}

function Interstitial({ step, answers, onNext }: { step: Extract<QuizStep, { kind: 'interstitial' }>; answers: QuizAnswers; onNext: () => void }) {
  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <div
        className="flex h-24 w-24 items-center justify-center rounded-full text-4xl"
        style={{ background: 'rgba(45,212,191,0.12)', border: '1px solid rgba(45,212,191,0.3)' }}
      >
        ✦
      </div>
      <p className="max-w-md text-lg text-white/80">{interstitialBody(step, answers)}</p>
      <ContinueButton onClick={onNext} label={step.cta ?? 'Continuar'} />
    </div>
  );
}

function ContinueButton({
  onClick,
  disabled,
  label = 'Continuar',
}: {
  onClick: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="mt-2 w-full rounded-full px-6 py-4 text-base font-semibold transition disabled:opacity-40"
      style={{ background: '#2DD4BF', color: '#07131f' }}
    >
      {label}
    </button>
  );
}

/* ───────────────────────── Armando / Reveal ────────────────────────────── */

function BuildingView({ onDone }: { onDone: () => void }) {
  // Pequeña espera para el "momento" (sin coste: no hay IA).
  useEffect(() => {
    const t = setTimeout(onDone, 2200);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="text-2xl font-semibold">Armando tu agente…</div>
      <div className="h-2 w-64 overflow-hidden rounded-full bg-white/10">
        <div className="h-full animate-pulse rounded-full" style={{ width: '70%', background: '#2DD4BF' }} />
      </div>
      <p className="text-sm text-white/50">Personalizando el tono, el objetivo y las respuestas a tu negocio.</p>
    </div>
  );
}

function RevealView({ answers }: { answers: QuizAnswers }) {
  const gen = useMemo(() => buildAgentFromQuiz(answers), [answers]);
  const { user, loading } = useAuth();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // El botón de WhatsApp SIEMPRE va a ventas de BotIvA (no al número del visitante,
  // que se guarda como lead). Así el lead llega a quien lo puede cerrar.
  const waLink = buildContactWhatsAppUrl(`Hola, armé mi agente "${gen.name}" en BotIvA y quiero activarlo`);

  const activate = useCallback(async () => {
    setCreating(true);
    setCreateError('');
    try {
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(toCreateAgentPayload(gen)),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data?.code === 'EMAIL_NOT_VERIFIED') {
          setCreateError('Verifica tu correo (te enviamos un enlace) y vuelve a intentarlo.');
        } else {
          setCreateError(data?.error ?? 'No se pudo crear el agente. Intenta de nuevo.');
        }
        setCreating(false);
        return;
      }
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        /* no-op */
      }
      const id = data?.agent?._id ?? data?.agent?.id;
      // Si dio un sitio web, lo scrapeamos a su base de conocimiento (en segundo plano).
      const siteUrl = gen.ragSources.find((s) => s.type === 'url')?.content ?? '';
      if (id && siteUrl) {
        void fetch(`/api/agents/${id}/rag/ingest-url`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ url: siteUrl }),
        }).catch(() => {});
      }
      router.push(id ? `/dashboard/agents/${id}` : '/dashboard/agents');
    } catch {
      setCreateError('Error de red. Intenta de nuevo.');
      setCreating(false);
    }
  }, [gen, router]);

  return (
    <div className="mx-auto max-w-xl px-4 pb-24 pt-14 text-center">
      <div
        className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl text-4xl"
        style={{ background: gen.meta.color + '22', border: `1px solid ${gen.meta.color}55` }}
      >
        {gen.meta.icon}
      </div>
      <p className="mt-6 text-sm uppercase tracking-wide text-white/50">Tu agente está listo</p>
      <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">{gen.name}</h1>
      <p className="mx-auto mt-3 max-w-md text-white/70">{gen.description}</p>

      <div
        className="mt-8 rounded-2xl border p-5 text-left"
        style={{ borderColor: 'rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)' }}
      >
        <p className="text-xs uppercase tracking-wide text-white/40">Así se comportará</p>
        <p className="mt-2 whitespace-pre-line text-sm text-white/80">
          {gen.systemPrompt.split('\n').slice(0, 6).join('\n')}
        </p>
        {gen.suggestedFaqs.length > 0 && (
          <div className="mt-4 border-t border-white/10 pt-4">
            <p className="text-xs uppercase tracking-wide text-white/40">Ya sabe responder</p>
            <ul className="mt-2 space-y-1 text-sm text-white/70">
              {gen.suggestedFaqs.slice(0, 3).map((f, i) => (
                <li key={i}>· {f.question}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="mt-8 flex flex-col gap-3">
        {loading ? (
          <div className="py-4 text-sm text-white/50">Cargando…</div>
        ) : user ? (
          <>
            <button
              onClick={activate}
              disabled={creating}
              className="w-full rounded-full px-6 py-4 text-base font-semibold disabled:opacity-50"
              style={{ background: '#2DD4BF', color: '#07131f' }}
            >
              {creating ? 'Activando…' : 'Activar en mi cuenta'}
            </button>
            {waLink && (
              <a
                href={waLink}
                target="_blank"
                rel="noreferrer"
                className="w-full rounded-full border px-6 py-4 text-base font-semibold text-white/90"
                style={{ borderColor: 'rgba(255,255,255,0.2)' }}
              >
                Prefiero hablar por WhatsApp
              </a>
            )}
          </>
        ) : (
          <>
            {waLink && (
              <a
                href={waLink}
                target="_blank"
                rel="noreferrer"
                className="w-full rounded-full px-6 py-4 text-base font-semibold"
                style={{ background: '#2DD4BF', color: '#07131f' }}
              >
                Hablar por WhatsApp
              </a>
            )}
            <Link
              href="/login?from=%2Fcrear%3Fresume%3D1"
              className="w-full rounded-full border px-6 py-4 text-base font-semibold text-white/90"
              style={{ borderColor: 'rgba(255,255,255,0.2)' }}
            >
              Ya tengo cuenta — activarlo
            </Link>
            {!waLink && (
              <p className="text-xs text-white/40">
                Inicia sesión para activar tu agente, o déjanos tu WhatsApp para que te contactemos.
              </p>
            )}
          </>
        )}
        {createError && <p className="text-sm" style={{ color: '#fca5a5' }}>{createError}</p>}
      </div>
    </div>
  );
}
