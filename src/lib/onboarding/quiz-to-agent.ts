/**
 * Convierte las respuestas del quiz de onboarding en un agente listo, SIN llamar a ningún LLM
 * (determinista = sin coste y sin latencia en el tramo anónimo). Reúsa `AGENT_TEMPLATES` como base
 * y las personaliza con el negocio, el objetivo, el tono, el idioma y los datos a captar.
 *
 * La salida `toCreateAgentPayload()` encaja con el body de `POST /api/agents`.
 */

import { AGENT_TEMPLATES, type AgentTemplate } from '@/lib/agent-templates';
import type { QuizAnswers } from '@/lib/onboarding/quiz-config';

/** businessType del quiz → id de template base. */
const TEMPLATE_BY_BUSINESS: Record<string, string> = {
  ecommerce: 'ecommerce-assistant',
  services: 'customer-support',
  health: 'customer-support',
  realestate: 'real-estate',
  education: 'educational-tutor',
  other: 'customer-support',
};

const GOAL_LINE: Record<string, string> = {
  sell: 'Tu objetivo principal es ayudar a vender: recomienda productos o servicios y guía al cliente hacia la compra, sin ser insistente.',
  support: 'Tu objetivo principal es resolver dudas con rapidez y claridad, y dejar al cliente satisfecho.',
  appointments: 'Tu objetivo principal es ayudar a agendar citas o reservas: confirma fecha, hora y datos de contacto.',
  leads: 'Tu objetivo principal es captar clientes interesados y derivarlos a WhatsApp con una persona cuando lo pidan o cuando el caso lo amerite.',
};

const TONE_LINE: Record<string, string> = {
  cercano: 'Habla con un tono cercano, amable y en segunda persona (tú).',
  formal: 'Habla con un tono formal y profesional, tratando al cliente de usted.',
  divertido: 'Habla con un tono divertido y relajado, con cercanía, sin perder la claridad.',
};

const LANGUAGE_LINE: Record<string, string> = {
  es: 'Responde siempre en español.',
  en: 'Responde siempre en inglés.',
  bilingual: 'Responde en el mismo idioma en que te escriba el cliente (español o inglés).',
};

const HANDOFF_LINE: Record<string, string> = {
  onrequest: 'Si el cliente pide hablar con una persona, ofrécele continuar por WhatsApp sin resistencia.',
  complex: 'Deriva a una persona (por WhatsApp) en casos complejos, reclamos o cuando no puedas resolver.',
  never: 'Intenta resolver todo tú mismo; solo deriva a una persona si es estrictamente necesario.',
};

const HOURS_LINE: Record<string, string> = {
  '247': 'La atención está disponible 24/7.',
  business: 'El horario de atención es de lunes a viernes, en horario comercial.',
  custom: '',
};

const FIELD_LABEL: Record<string, string> = {
  name: 'nombre',
  phone: 'teléfono',
  email: 'correo electrónico',
};

export type GeneratedAgent = {
  name: string;
  description: string;
  systemPrompt: string;
  model: string;
  strictPurposeOnly: boolean;
  suggestedFaqs: Array<{ question: string; answer: string }>;
  ragSources: Array<{ type: 'url'; name: string; content: string }>;
  /** Solo para la UI del reveal. */
  meta: { color: string; icon: string; whatsapp?: string; businessName: string };
};

function pickTemplate(businessType?: string): AgentTemplate {
  const id = TEMPLATE_BY_BUSINESS[businessType ?? 'other'] ?? 'customer-support';
  return AGENT_TEMPLATES.find((t) => t.id === id) ?? AGENT_TEMPLATES[0];
}

function cleanName(raw?: string): string {
  const n = (raw ?? '').trim().replace(/\s+/g, ' ');
  return n.slice(0, 80);
}

/** Construye el agente a partir de las respuestas. Puro y testeable. */
export function buildAgentFromQuiz(answers: QuizAnswers): GeneratedAgent {
  const template = pickTemplate(answers.businessType);
  const businessName = cleanName(answers.businessName) || 'tu negocio';
  const hasBusinessName = Boolean(cleanName(answers.businessName));

  const fields = Array.isArray(answers.collectFields) ? answers.collectFields : [];
  const realFields = fields.filter((f) => f !== 'none' && FIELD_LABEL[f]);
  const collectLine =
    realFields.length > 0
      ? `Cuando un cliente muestre interés real, pídele de forma natural su ${realFields
          .map((f) => FIELD_LABEL[f])
          .join(', ')
          .replace(/, ([^,]*)$/, ' y $1')}.`
      : '';

  const whatsapp = (answers.whatsapp ?? '').trim();
  const handoffLine =
    HANDOFF_LINE[answers.handoff ?? ''] ??
    (whatsapp || answers.goal === 'leads'
      ? 'Si el cliente quiere hablar con una persona, ofrécele continuar por WhatsApp sin poner resistencia.'
      : '');

  const offer = (answers.mainOffer ?? '').trim();
  const offerLine = offer ? `El negocio ofrece principalmente: ${offer}.` : '';
  const location = (answers.location ?? '').trim();
  const locationLine = location ? `Opera principalmente en: ${location}.` : '';
  const hoursLine = HOURS_LINE[answers.hours ?? ''] ?? '';

  const intro = hasBusinessName
    ? `Eres el asistente virtual de "${businessName}".`
    : template.systemPrompt.split('\n')[0];

  const systemPrompt = [
    intro,
    offerLine,
    locationLine,
    GOAL_LINE[answers.goal ?? ''] ?? GOAL_LINE.support,
    TONE_LINE[answers.tone ?? ''] ?? TONE_LINE.cercano,
    LANGUAGE_LINE[answers.language ?? ''] ?? LANGUAGE_LINE.es,
    hoursLine,
    '',
    'Pautas:',
    '- Si no tienes la información, dilo con honestidad en vez de inventar.',
    '- Sé breve y concreto; evita respuestas largas salvo que te las pidan.',
    collectLine ? `- ${collectLine}` : '',
    handoffLine ? `- ${handoffLine}` : '',
    '',
    'Contexto base del rol:',
    template.systemPrompt,
  ]
    .filter((l) => l !== '')
    .join('\n')
    .slice(0, 8000);

  const name = hasBusinessName ? `Asistente de ${businessName}` : template.name;
  const description = hasBusinessName
    ? `${template.description} Personalizado para ${businessName}.`
    : template.description;

  const website = (answers.website ?? '').trim();
  const ragSources: GeneratedAgent['ragSources'] =
    website && /^https?:\/\//i.test(website)
      ? [{ type: 'url', name: 'Sitio web', content: website.slice(0, 2000) }]
      : [];

  return {
    name,
    description,
    systemPrompt,
    model: template.model,
    strictPurposeOnly: true,
    suggestedFaqs: template.suggestedFaqs,
    ragSources,
    meta: {
      color: template.color,
      icon: template.icon,
      whatsapp: whatsapp || undefined,
      businessName,
    },
  };
}

/** Lo mínimo para `POST /api/agents`. */
export function toCreateAgentPayload(gen: GeneratedAgent) {
  return {
    name: gen.name,
    description: gen.description,
    systemPrompt: gen.systemPrompt,
    model: gen.model,
    strictPurposeOnly: gen.strictPurposeOnly,
    agentFaqs: gen.suggestedFaqs.map((f, i) => ({
      question: f.question,
      answer: f.answer,
      enabled: true,
      priority: 100 + i,
    })),
    ragSources: gen.ragSources,
  };
}
