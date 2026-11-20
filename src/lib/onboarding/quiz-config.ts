/**
 * Definición del quiz de onboarding tipo "app lista para usar" (inspirado en BetterMe).
 *
 * Es data pura: una lista de pasos. El quiz anónimo (`/crear`) recorre estos pasos y guarda las
 * respuestas en el cliente; al final `quiz-to-agent.ts` (determinista, sin IA = sin coste) las
 * convierte en un agente listo. No hay dependencias de servidor aquí a propósito.
 */

export type QuizSection = 'negocio' | 'agente' | 'contacto';

/** Un paso de pregunta. `single` auto-avanza al elegir; `multi`/`text` usan botón Continuar. */
export type QuizStep =
  | {
      kind: 'single';
      id: string;
      section: QuizSection;
      title: string;
      subtitle?: string;
      options: Array<{ value: string; label: string; hint?: string }>;
    }
  | {
      kind: 'multi';
      id: string;
      section: QuizSection;
      title: string;
      subtitle?: string;
      options: Array<{ value: string; label: string }>;
    }
  | {
      kind: 'text';
      id: string;
      section: QuizSection;
      title: string;
      subtitle?: string;
      placeholder?: string;
      inputType?: 'text' | 'url' | 'tel';
      optional?: boolean;
    }
  /** Pantalla intersticial de prueba social entre preguntas (no guarda respuesta). */
  | {
      kind: 'interstitial';
      id: string;
      section: QuizSection;
      title: string;
      body: string;
      cta?: string;
    };

export const QUIZ_SECTIONS: Array<{ id: QuizSection; label: string }> = [
  { id: 'negocio', label: 'Tu negocio' },
  { id: 'agente', label: 'Tu agente' },
  { id: 'contacto', label: 'Contacto' },
];

export const QUIZ_STEPS: QuizStep[] = [
  {
    kind: 'single',
    id: 'businessType',
    section: 'negocio',
    title: '¿Qué tipo de negocio tienes?',
    subtitle: 'Elige el que más se parezca',
    options: [
      { value: 'ecommerce', label: 'Tienda online / productos' },
      { value: 'services', label: 'Servicios profesionales' },
      { value: 'health', label: 'Salud / clínica / bienestar' },
      { value: 'realestate', label: 'Inmobiliaria' },
      { value: 'education', label: 'Educación / formación' },
      { value: 'other', label: 'Otro' },
    ],
  },
  {
    kind: 'text',
    id: 'mainOffer',
    section: 'negocio',
    title: '¿Qué vendes u ofreces principalmente?',
    subtitle: 'En pocas palabras — así tu agente sabe de qué habla',
    placeholder: 'Ej. zapatos y accesorios de cuero',
    inputType: 'text',
  },
  {
    kind: 'text',
    id: 'location',
    section: 'negocio',
    title: '¿En qué ciudad o zona operas?',
    subtitle: 'Opcional — útil si atiendes una zona',
    placeholder: 'Ej. Bogotá y alrededores',
    inputType: 'text',
    optional: true,
  },
  {
    kind: 'interstitial',
    id: 'proof1',
    section: 'negocio',
    title: 'Vas por buen camino',
    body: 'Negocios como el tuyo atienden a sus clientes 24/7 con un agente de BotIvA, sin contratar a nadie más.',
    cta: 'Continuar',
  },
  {
    kind: 'single',
    id: 'goal',
    section: 'agente',
    title: '¿Para qué quieres tu agente?',
    subtitle: 'Su objetivo principal',
    options: [
      { value: 'sell', label: 'Vender y recomendar', hint: 'Orientado a conversión' },
      { value: 'support', label: 'Resolver dudas y soporte' },
      { value: 'appointments', label: 'Agendar citas / reservas' },
      { value: 'leads', label: 'Captar clientes a WhatsApp' },
    ],
  },
  {
    kind: 'single',
    id: 'tone',
    section: 'agente',
    title: '¿Con qué tono quieres que hable?',
    options: [
      { value: 'cercano', label: 'Cercano y amable' },
      { value: 'formal', label: 'Formal y profesional' },
      { value: 'divertido', label: 'Divertido y relajado' },
    ],
  },
  {
    kind: 'single',
    id: 'handoff',
    section: 'agente',
    title: '¿Cuándo debe pasar a una persona?',
    subtitle: 'Cuándo deja de responder el agente y entra un humano',
    options: [
      { value: 'onrequest', label: 'Solo cuando el cliente lo pida' },
      { value: 'complex', label: 'En casos complejos o quejas' },
      { value: 'never', label: 'Que intente resolver todo él' },
    ],
  },
  {
    kind: 'text',
    id: 'businessName',
    section: 'agente',
    title: '¿Cómo se llama tu negocio?',
    subtitle: 'Lo usaremos para personalizar a tu agente',
    placeholder: 'Ej. Zapatería Luna',
    inputType: 'text',
  },
  {
    kind: 'text',
    id: 'website',
    section: 'agente',
    title: '¿Cuál es la URL de tu página web?',
    subtitle: 'Pégala aquí y leeremos tu web para que tu agente aprenda solo de tu negocio (opcional)',
    placeholder: 'https://tunegocio.com',
    inputType: 'url',
    optional: true,
  },
  {
    kind: 'interstitial',
    id: 'proof2',
    section: 'agente',
    title: 'Ya casi está',
    body: 'Estamos armando un agente a la medida de tu negocio. Solo faltan los datos de contacto.',
    cta: 'Continuar',
  },
  {
    kind: 'multi',
    id: 'collectFields',
    section: 'contacto',
    title: '¿Qué datos debe pedir a un cliente interesado?',
    subtitle: 'Elige todos los que apliquen',
    options: [
      { value: 'name', label: 'Nombre' },
      { value: 'phone', label: 'Teléfono' },
      { value: 'email', label: 'Correo' },
      { value: 'none', label: 'Ninguno por ahora' },
    ],
  },
  {
    kind: 'single',
    id: 'hours',
    section: 'contacto',
    title: '¿Cuál es tu horario de atención?',
    options: [
      { value: '247', label: 'Siempre (24/7)' },
      { value: 'business', label: 'Horario comercial (L-V)' },
      { value: 'custom', label: 'Otro / lo indico después' },
    ],
  },
  {
    kind: 'single',
    id: 'language',
    section: 'contacto',
    title: '¿En qué idioma atiende?',
    options: [
      { value: 'es', label: 'Español' },
      { value: 'en', label: 'Inglés' },
      { value: 'bilingual', label: 'Español e inglés' },
    ],
  },
  {
    kind: 'text',
    id: 'whatsapp',
    section: 'contacto',
    title: '¿A qué WhatsApp llegan tus clientes?',
    subtitle: 'Aquí derivaremos a quien quiera hablar con una persona',
    placeholder: '+57 300 000 0000',
    inputType: 'tel',
    optional: true,
  },
];

/** Las respuestas del quiz, tal como las guarda el cliente. */
export type QuizAnswers = {
  businessType?: string;
  mainOffer?: string;
  location?: string;
  goal?: string;
  tone?: string;
  handoff?: string;
  businessName?: string;
  website?: string;
  collectFields?: string[];
  hours?: string;
  language?: string;
  whatsapp?: string;
};

/** Pasos que guardan respuesta (sin intersticiales), para calcular progreso. */
export const QUIZ_QUESTION_STEPS = QUIZ_STEPS.filter((s) => s.kind !== 'interstitial');
