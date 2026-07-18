/**
 * Parsing y reglas de ```assist-nav (bloque del modelo).
 * Orquestación del artefacto → `@/lib/assist-agent-navigation`.
 */

export type AssistNavOffer = {
  path: string;
  /** Pregunta corta encima de los botones (opcional; el texto del mensaje ya la incluye). */
  prompt?: string;
  /** Texto si el usuario pulsa «No». */
  onDecline: string;
  /** Mensaje en la burbuja tras redirigir con «Sí». */
  afterNavigate?: string;
};

const NAV_BLOCK_RE = /```assist-nav\s*\n([\s\S]*?)\n```/i;

const ALLOWED_PATH =
  /^(\/(?:es|en))?\/dashboard(?:\/(?:agents(?:\/[a-f0-9]{24})?|widgets(?:\/[a-f0-9]{24})?|widget-builder|widget-preview|inbox|chats|mcp|settings|finance|flows|agents\/new))?\/?$/i;

export function isAllowedAssistNavPath(path: string): boolean {
  const p = path.trim().split('?')[0].replace(/\/$/, '') || '/dashboard';
  return ALLOWED_PATH.test(p) || p === '/dashboard' || /^\/(?:es|en)\/dashboard$/i.test(p);
}

export function normalizeAssistNavPath(path: string): string {
  const p = path.trim().split('?')[0];
  if (!p.startsWith('/')) return `/dashboard/${p.replace(/^\//, '')}`;
  return p.replace(/\/$/, '') || '/dashboard';
}

export function parseAssistNavBlock(raw: string): AssistNavOffer | null {
  const m = NAV_BLOCK_RE.exec(String(raw || ''));
  if (!m?.[1]) return null;
  try {
    const j = JSON.parse(m[1].trim()) as Record<string, unknown>;
    const path = normalizeAssistNavPath(String(j.path || ''));
    const onDecline = String(j.onDecline || j.declineHint || '').trim();
    if (!path || !onDecline || !isAllowedAssistNavPath(path)) return null;
    return {
      path,
      prompt: typeof j.prompt === 'string' ? j.prompt.trim() : undefined,
      onDecline,
      afterNavigate:
        typeof j.afterNavigate === 'string'
          ? j.afterNavigate.trim()
          : typeof j.onAccept === 'string'
            ? j.onAccept.trim()
            : undefined,
    };
  } catch {
    return null;
  }
}

export function stripAssistNavBlock(raw: string): string {
  return String(raw || '')
    .replace(NAV_BLOCK_RE, '')
    .replace(/\s+$/, '')
    .trim();
}

export function extractAssistNavOffer(rawReply: string): {
  reply: string;
  navOffer: AssistNavOffer | null;
} {
  const navOffer = parseAssistNavBlock(rawReply);
  const reply = stripAssistNavBlock(rawReply);
  return { reply, navOffer };
}

export type AssistNavInferContext = {
  userMessage?: string;
  pagePath?: string;
  agentDetailId?: string;
};

type NavIntentOffer = Omit<AssistNavOffer, 'path'> & { path: string };

/** Reglas ordenadas: la primera coincidencia gana (solo sobre el texto indicado). */
function detectNavIntentFromText(
  rawText: string,
  ctx: AssistNavInferContext,
): NavIntentOffer | null {
  const text = String(rawText || '').trim().toLowerCase();
  if (!text) return null;

  const mk = (
    path: string,
    onDecline: string,
    afterNavigate: string,
    prompt?: string,
  ): NavIntentOffer | null => {
    if (!isAllowedAssistNavPath(path)) return null;
    return {
      path: normalizeAssistNavPath(path),
      prompt,
      onDecline,
      afterNavigate,
    };
  };

  if (
    /(\bwidget builder|\bcre(o|ar|a).*widget|\bcomo cre(o|ar).*widget|\bconfigur.*widget|\bembed|\bc[oó]digo embed|\bburbuja)/.test(
      text,
    )
  ) {
    return mk(
      '/dashboard/widget-builder',
      'Ve a Dashboard → Widget builder en el menú lateral para diseñar y copiar el embed.',
      'En Widget builder eliges agente, colores, mensaje de bienvenida y copias el código para tu web.',
      '¿Quieres que te lleve al Widget builder?',
    );
  }

  if (/(\bmis widgets|\bver widgets|\blista de widgets|\bpantalla widgets)/.test(text)) {
    return mk(
      '/dashboard/widgets',
      'Ve a Dashboard → Widgets en el menú lateral.',
      'Aquí gestionas tus widgets desplegados y puedes abrir uno para editarlo.',
      '¿Quieres que te lleve a Widgets?',
    );
  }

  if (
    /(\bcre(o|ar|a)\b.*\bagentes?\b|\bnuevo agente|\bprimer agente|\bcomo cre(o|ar).*\bagentes?\b)/.test(
      text,
    )
  ) {
    return mk(
      '/dashboard/agents/new',
      'Sin problema: en el menú lateral abre Agentes → Nuevo agente. Pon nombre, system prompt, elige modelo y guarda.',
      'Aquí creas un agente nuevo. Completa nombre y para qué sirve (prompt), elige el modelo y pulsa Guardar.',
      '¿Quieres que te lleve a Nuevo agente?',
    );
  }

  const detail = ctx.agentDetailId?.match(/^[a-f0-9]{24}$/i)?.[0];
  if (/(\bmis agentes|\blista de agentes|\bver agentes|\brevisar.*agente)/.test(text)) {
    if (detail && /(\bconfig|\bconfigur|\beditar|\beste agente)/.test(text)) {
      return mk(
        `/dashboard/agents/${detail}`,
        'Ve a Dashboard → Agentes en el menú lateral y pulsa el agente que quieras editar.',
        'Estás en el detalle del agente. Desde aquí puedes ajustar prompt, skills, RAG, integraciones y widget.',
        '¿Quieres que te lleve al detalle de este agente?',
      );
    }
    return mk(
      '/dashboard/agents',
      'Ve a Dashboard → Agentes en el menú lateral para ver y editar tus bots.',
      'Aquí ves todos tus agentes. Pulsa uno para editarlo o usa Nuevo agente para crear otro.',
      '¿Quieres que te lleve a Agentes?',
    );
  }

  if (/(\binbox|\bconversaciones|\bchats|\btareas pendientes|\bpendientes)/.test(text)) {
    return mk(
      '/dashboard/inbox',
      'Ve a Dashboard → Inbox (o Chats) en el menú lateral.',
      'Aquí ves las conversaciones de tus widgets. Abre una para responder o revisar el historial.',
      '¿Quieres que te lleve al Inbox?',
    );
  }

  if (/(\bmcp|\bintegraciones|\bgmail|\bhubspot|\bconectar cuenta)/.test(text)) {
    return mk(
      '/dashboard/mcp',
      'Ve a Dashboard → Integraciones MCP en el menú lateral y conecta la cuenta que necesites.',
      'Conecta aquí Gmail, HubSpot, Calendar u otras integraciones; luego actívalas en tu agente.',
      '¿Quieres que te lleve a Integraciones MCP?',
    );
  }

  if (/(\bajustes|\bconfiguraci[oó]n de cuenta|\bfacturaci[oó]n|\bplan\b)/.test(text)) {
    return mk(
      '/dashboard/settings',
      'Ve a Dashboard → Ajustes en el menú lateral.',
      'En Ajustes puedes revisar tu cuenta, plan y preferencias.',
      '¿Quieres que te lleve a Ajustes?',
    );
  }

  if (detail && /(\brag|\bdocumentos|\bsubir pdf|\bconocimiento)/.test(text)) {
    return mk(
      `/dashboard/agents/${detail}`,
      'Abre el agente en Dashboard → Agentes → [tu agente] → pestaña Almacenamiento/RAG.',
      'En el agente, sección RAG/Almacenamiento: sube PDF, texto o URL para que el bot use ese conocimiento.',
      '¿Quieres que te lleve al agente para configurar RAG?',
    );
  }

  return null;
}

export function normalizeAssistPagePath(path?: string): string {
  const p = String(path || '').split('?')[0].replace(/\/$/, '') || '/dashboard';
  return p.replace(/^\/(es|en)(?=\/)/, '') || p;
}

export function assistNavPathsEqual(a: string, b: string): boolean {
  return normalizeAssistPagePath(a) === normalizeAssistPagePath(b);
}

/** Si ya estás en la pantalla destino, ajusta o suprime la oferta. */
export function applyAssistNavPageContext(
  offer: AssistNavOffer | null,
  ctx: AssistNavInferContext,
): AssistNavOffer | null {
  if (!offer || !ctx.pagePath) return offer;

  const cur = normalizeAssistPagePath(ctx.pagePath);
  const tgt = normalizeAssistPagePath(offer.path);
  const msg = String(ctx.userMessage || '').trim().toLowerCase();

  if (cur !== tgt) return offer;

  if (
    cur === '/dashboard/widgets' &&
    /(\bcre(o|ar|a).*widget|\bcomo cre(o|ar).*widget|\bconfigur.*widget|\bembed|\bnuevo widget)/.test(
      msg,
    )
  ) {
    return {
      path: '/dashboard/widget-builder',
      prompt: '¿Quieres que te lleve al Widget builder para diseñarlo?',
      onDecline:
        'Ya estás en Mis widgets: pulsa **+ Nuevo widget** arriba a la derecha, o **Editar** en una tarjeta existente.',
      afterNavigate:
        'En Widget builder eliges agente, colores, mensaje de bienvenida y copias el código embed.',
    };
  }

  return null;
}

export function stripTrailingNavQuestion(reply: string): string {
  return String(reply || '')
    .replace(/(?:\n\s*)+¿[^\n]+\?\s*$/gi, '')
    .trim();
}

/** Prioridad: mensaje usuario > bloque modelo > texto respuesta > pantalla. */
export function resolveAssistNavOffer(
  rawReply: string,
  ctx: AssistNavInferContext,
): { reply: string; navOffer?: AssistNavOffer } {
  const { reply: strippedReply, navOffer: modelOffer } = extractAssistNavOffer(rawReply);
  const reply = stripTrailingNavQuestion(strippedReply);

  const userIntent = applyAssistNavPageContext(
    detectNavIntentFromText(String(ctx.userMessage || ''), ctx),
    ctx,
  );
  if (userIntent) {
    return {
      reply: syncReplyNavQuestion(reply, userIntent.prompt, true),
      navOffer: { ...userIntent, prompt: undefined },
    };
  }

  if (modelOffer) {
    const adjusted = applyAssistNavPageContext(modelOffer, ctx);
    if (!adjusted) {
      return { reply };
    }
    return {
      reply: syncReplyNavQuestion(reply, adjusted.prompt, true),
      navOffer: { ...adjusted, prompt: undefined },
    };
  }

  const inferred = inferAssistNavOffer(reply, ctx);
  if (!inferred) {
    return { reply };
  }

  return {
    reply: syncReplyNavQuestion(reply, inferred.prompt, true),
    navOffer: { ...inferred, prompt: undefined },
  };
}

/** Si el modelo no incluyó ```assist-nav, inferir oferta. Prioridad: mensaje usuario → respuesta → pantalla. */
export function inferAssistNavOffer(
  reply: string,
  ctx: AssistNavInferContext,
): AssistNavOffer | null {
  const msg = String(ctx.userMessage || '').trim();
  const r = String(reply || '').trim();
  if (!msg && !r) return null;

  const fromUser = applyAssistNavPageContext(detectNavIntentFromText(msg, ctx), ctx);
  if (fromUser) return fromUser;

  const fromReply = applyAssistNavPageContext(detectNavIntentFromText(r, ctx), ctx);
  if (fromReply) return fromReply;

  // Contexto de pantalla solo si el usuario no dijo otra cosa (p. ej. "¿dónde estoy?" en inbox).
  const pageHint = String(ctx.pagePath || '').trim();
  if (pageHint && !msg) {
    if (/\/dashboard\/widget-builder/i.test(pageHint)) {
      return detectNavIntentFromText('widget builder', ctx);
    }
    if (/\/dashboard\/widgets/i.test(pageHint)) {
      return detectNavIntentFromText('mis widgets', ctx);
    }
    if (/\/dashboard\/agents\/new/i.test(pageHint)) {
      return detectNavIntentFromText('nuevo agente', ctx);
    }
    if (/\/dashboard\/inbox/i.test(pageHint)) {
      return detectNavIntentFromText('inbox', ctx);
    }
  }

  return null;
}

export function appendNavQuestionIfMissing(reply: string, prompt?: string): string {
  return syncReplyNavQuestion(reply, prompt, false);
}

/** Alinea la pregunta visible con la oferta inferida (corrige preguntas erróneas del modelo). */
export function syncReplyNavQuestion(
  reply: string,
  prompt?: string,
  forceReplace = true,
): string {
  const q = (prompt || '¿Quieres que te lleve ahí ahora?').trim();
  if (!q) return reply.trim();

  let body = String(reply || '').trim();
  const navQuestionRe = /\n\n¿[^\n]+\?\s*$/i;

  if (navQuestionRe.test(body)) {
    if (!forceReplace) {
      return body;
    }
    body = body.replace(navQuestionRe, '').trim();
  } else if (!forceReplace) {
    const low = body.toLowerCase();
    if (low.includes('quieres que te lleve') || low.includes('¿te llevo')) {
      return body;
    }
  }

  return `${body}\n\n${q}`;
}

/** Instrucciones para el modelo (Math-ais). */
export function assistNavOfferPromptSection(): string {
  return `[NAVEGACIÓN INTERACTIVA — Math-ais dashboard]
Cuando sugieras ir a otra pantalla (revisar config, ver tareas, inbox, widgets, etc.):
1) Pregunta en el texto visible si quieres redirigirle (ej. «¿Quieres que te lleve a Agentes para revisar la configuración?»).
2) Añade AL FINAL un bloque oculto (el usuario no lo ve como código):

\`\`\`assist-nav
{"path":"/dashboard/agents","prompt":"¿Te llevo a Agentes?","onDecline":"Sin problema: en el menú lateral abre Agentes y elige el que quieras editar.","afterNavigate":"Aquí están tus agentes. Pulsa uno para editar prompt, skills, RAG o el widget."}
\`\`\`

Reglas del JSON:
- path: ruta interna permitida (/dashboard, /dashboard/agents, /dashboard/agents/{id}, /dashboard/widgets, /dashboard/widget-builder, /dashboard/inbox, /dashboard/mcp, /dashboard/settings).
- onDecline: instrucciones manuales claras (Dashboard → …) si dice que no.
- afterNavigate: 1–2 frases explicando qué hacer ya en esa pantalla (se muestra tras redirigir).
- No uses URLs externas ni paths fuera de /dashboard.
- Un solo bloque assist-nav por mensaje.`;
}
