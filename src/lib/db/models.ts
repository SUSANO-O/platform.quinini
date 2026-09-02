import mongoose, { Schema } from 'mongoose';

// ── USERS ────────────────────────────────────────────────────────────────────

const UserSchema = new Schema({
  email:             { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash:      { type: String, required: true },
  hashVersion:       { type: String, enum: ['v1-sha256', 'v2-bcrypt'], default: 'v1-sha256' },
  displayName:       { type: String, default: null },
  /** Foto de perfil (URL https o data:image/jpeg;base64,…). */
  avatarUrl:         { type: String, default: null },
  role:              { type: String, enum: ['user', 'admin'], default: 'user' },
  // Email verification
  emailVerified:     { type: Boolean, default: false },
  verifyToken:       { type: String, default: null },
  verifyTokenExpiry: { type: Date,   default: null },
  // Password reset
  resetToken:        { type: String, default: null },
  resetTokenExpiry:  { type: Date,   default: null },
  // Cambio de email (código al correo nuevo)
  pendingEmail:         { type: String, default: null, lowercase: true, trim: true },
  emailChangeCodeHash:  { type: String, default: null },
  emailChangeExpires:   { type: Date,   default: null },
  /** Progreso del camino trial / onboarding en dashboard (etapas, última ruta, reanudación del driver). */
  onboardingJourney: { type: Schema.Types.Mixed, default: null },
  /** Webhook HTTPS del cliente SaaS (eventos salientes RGPD/producto). Firma HMAC opcional. */
  saasWebhookUrl:    { type: String, default: null },
  saasWebhookSecret: { type: String, default: null },
  /** Política opcional por tenant: proveedores permitidos en selector de modelos (vacío = todos). */
  allowedModelProviders: { type: [String], default: [] },
  /** WebPush subscription object (endpoint + keys) para notificaciones push en navegador. */
  pushSubscription:  { type: Schema.Types.Mixed, default: null },
  /** Integración Zendesk/Freshdesk para tickets automáticos al escalar (plan Growth+). */
  escalationTicketIntegration: { type: Schema.Types.Mixed, default: null },
  /** Incoming Webhook URL de Slack para avisos al escalar (plan Team+). */
  escalationSlackWebhookUrl: { type: String, default: null },
  /** Número WhatsApp personal del dueño para recibir alertas de handoff y responder desde WA. */
  escalationWhatsAppPhone: { type: String, default: null },
  /** Último mensaje WA entrante del dueño al número Business (abre ventana 24 h). */
  ownerWaLastInboundAt: { type: Date, default: null },
  // Two-Factor Authentication (TOTP)
  twoFactorEnabled: { type: Boolean, default: false },
  twoFactorSecret:  { type: String, default: null },
  /** Candado admin: exige código extra para entrar al dashboard (landing UI). */
  landingAccessLockEnabled: { type: Boolean, default: false },
  /** Código visible solo en admin (texto plano para soporte). */
  landingAccessCode: { type: String, default: null },
  landingAccessCodeHash: { type: String, default: null },
  /** Se incrementa al cambiar el código; invalida cookies de desbloqueo previas. */
  landingAccessCodeVersion: { type: Number, default: 0 },
  /** Datos de facturación para recibos PDF (nombre fiscal, NIF, dirección). */
  billingProfile: {
    type: {
      companyName: { type: String, default: '' },
      taxId:       { type: String, default: '' },
      address:     { type: String, default: '' },
      city:        { type: String, default: '' },
      state:       { type: String, default: '' },
      zipCode:     { type: String, default: '' },
      country:     { type: String, default: '' },
    },
    default: null,
  },
  createdAt:         { type: Date,   default: Date.now },
}, { timestamps: true });

// Password reset and email verify token lookups — sparse so null docs are excluded
UserSchema.index({ resetToken: 1 }, { sparse: true });
UserSchema.index({ verifyToken: 1 }, { sparse: true });

// ── SUBSCRIPTIONS ────────────────────────────────────────────────────────────

const SubscriptionSchema = new Schema({
  userId:               { type: String, required: true, unique: true },

  // ── LemonSqueezy (activo) ────────────────────────────────────────────────
  lsCustomerId:         { type: String, default: null },
  lsSubscriptionId:     { type: String, default: null },

  // ── Paddle (comentado — conservado para suscriptores legacy) ────────────
  paddleCustomerId:     { type: String, default: null },
  paddleSubscriptionId: { type: String, default: null },

  // ── Stripe (comentado — conservado para referencia / migración de datos) ─
  // stripeCustomerId:     { type: String, default: null },
  // stripeSubscriptionId: { type: String, default: null },

  status:               {
    type: String,
    enum: ['trialing', 'active', 'canceled', 'past_due', 'incomplete'],
    default: 'active',
  },
  plan: {
    type: String,
    enum: ['free', 'solo', 'team', 'plus', 'business', 'enterprise'],
    default: 'free',
  },
  currentPeriodEnd: { type: Number, default: 0 },
  /** Inicio del periodo de facturación actual (epoch segundos) */
  currentPeriodStart: { type: Number, default: 0 },
  /** Creación de la suscripción en el proveedor (epoch segundos) */
  stripeSubscriptionCreated: { type: Number, default: 0 },
  /** Cancelación al final del periodo (sigue activo hasta currentPeriodEnd) */
  cancelAtPeriodEnd: { type: Boolean, default: false },
  trialStartedAt:   { type: Date, default: null },
  trialEndsAt:      { type: Date, default: null },
  /** Mes (“YYYY-MM”) en que se envió la alerta de 80% de cuota. Evita envíos repetidos. */
  quotaWarningSentMonth: { type: String, default: null },
  /** Historial de recordatorios de vencimiento enviados para evitar duplicados (trial/renovacion). */
  reminderHistory: { type: [String], default: [] },
  /** Overrides de features activados manualmente desde admin (ej. 'scheduled_tasks'),
   *  independientes del plan, tras acordar precio. Ver scheduledTasksEnabled(). */
  features: { type: [String], default: [] },
  /** Override del límite de tareas programadas para este cliente (null = usar el del plan).
   *  -1 = ilimitado. Acordado manualmente desde admin. */
  scheduledTaskLimit: { type: Number, default: null },
  /** Facturar almacenamiento de sync Sheets→Mongo ($1/GB). Default: false. */
  sheetSyncBillingEnabled: { type: Boolean, default: false },
  /** Quién controla plan/estado: admin (manual) o billing (webhook LS). Evita sync LS en lectura. */
  planManagedBy: { type: String, enum: ['admin', 'billing'], default: null },
}, { timestamps: true });

SubscriptionSchema.index({ lsCustomerId: 1 });
SubscriptionSchema.index({ paddleCustomerId: 1 }); // legacy
// SubscriptionSchema.index({ stripeCustomerId: 1 }); // Stripe — comentado

// ── WIDGETS ──────────────────────────────────────────────────────────────────

const WidgetSchema = new Schema({
  userId:       { type: String, required: true },
  name:         { type: String, required: true },
  agentId:      { type: String, required: true },
  color:        { type: String, default: '#0d9488' },
  title:        { type: String, default: '' },
  subtitle:     { type: String, default: '' },
  welcome:      { type: String, default: '' },
  /** Si false, no se manda el mensaje de bienvenida al abrir el chat (el texto queda guardado). */
  welcomeEnabled: { type: Boolean, default: true },
  fabHint:      { type: String, default: '' },
  avatar:       { type: String, default: '' },
  /** Tamaño del botón FAB cuando hay avatar (px). Sin avatar se usa el orbe fijo. */
  fabAvatarSize: { type: Number, default: 86 },
  position:     { type: String, default: 'bottom-right' },
  theme:        { type: String, enum: ['light', 'dark'], default: 'light' },
  borderRadius: { type: String, default: '16px' },
  autoOpen:     { type: Boolean, default: false },
  /** Si false, no muestra la X para ocultar el launcher. */
  fabDismissible: { type: Boolean, default: true },
  /** Si false, oculta el botón de lectura en voz alta (speaker) en el header del chat. */
  voiceEnabled: { type: Boolean, default: false },
  /** Si false, oculta el botón adjuntar (📎) en el input del chat. */
  imageUploadEnabled: { type: Boolean, default: true },
  /** Si false, oculta el botón micrófono (STT) en el input del chat. */
  micEnabled: { type: Boolean, default: true },
  /** voice_id de ElevenLabs para leer las respuestas del bot (vacío = usa el default global). */
  voiceId: { type: String, default: '' },
  /** Borde mágico modo AI: off | input | messages | both */
  aiBeamScope: { type: String, enum: ['off', 'input', 'messages', 'both'], default: 'both' },
  aiBeamPalette: { type: String, enum: ['rainbow', 'brand', 'custom'], default: 'rainbow' },
  aiBeamColor: { type: String, default: '' },
  aiBeamBlur: { type: Number, default: 4 },
  aiBeamSpeed: { type: Number, default: 5 },
  aiBeamIntensity: { type: Number, default: 85 },
  /** Halo de scroll sobre mensajes (fade al subir/bajar). */
  scrollHaloEnabled: { type: Boolean, default: true },
  scrollHaloColorMode: { type: String, enum: ['brand', 'custom'], default: 'brand' },
  scrollHaloColor: { type: String, default: '' },
  scrollHaloHeight: { type: Number, default: 28 },
  scrollHaloOpacity: { type: Number, default: 55 },
  scrollHaloBlur: { type: Number, default: 10 },
  scrollHaloTop: { type: Boolean, default: true },
  scrollHaloBottom: { type: Boolean, default: true },
  /** Icono animado a la derecha de la etapa en la tarjeta “pensando”. */
  thinkingIconEnabled: { type: Boolean, default: true },
  thinkingIcon: { type: String, enum: ['rubik', 'spark', 'orb', 'atom', 'pulse'], default: 'rubik' },
  /** Teléfono WhatsApp (con código de país); el SDK ofrece enlace si humanSupportEnabled. */
  humanSupportPhone: { type: String, default: '' },
  /** Si false, no se muestra oferta WhatsApp por palabras clave ni enlaces wa.me. */
  humanSupportEnabled: { type: Boolean, default: true },
  /**
   * Destino externo al escalar desde el widget (Inbox siempre recibe la solicitud).
   * inbox | webhook | slack | both (default both — retrocompat)
   */
  handoffNotifyMode: {
    type: String,
    enum: ['inbox', 'webhook', 'slack', 'both'],
    default: 'both',
  },
  /** Si false, oculta el botón «Hablar con una persona» y rechaza POST /handoff. */
  handoffEnabled: { type: Boolean, default: true },
  afhubToken:   { type: String, default: null },
  afhubWidgetId:{ type: String, default: null },
  orgId:        { type: String, default: null },
  /**
   * Lista de orígenes permitidos (scheme + host, sin trailing slash).
   * Ej: [“https://miempresa.com”, “https://www.miempresa.com”]
   * Si está vacío, se acepta cualquier origen (modo permisivo / dev).
   */
  allowedOrigins: { type: [String], default: [] },
  shortcuts: {
    type: [{
      id:      { type: String, required: true },
      label:   { type: String, required: true },
      message: { type: String, required: true },
      emoji:   { type: String, default: '' },
      enabled: { type: Boolean, default: true },
    }],
    default: [],
  },
  /** IDs de especialistas (filtro opcional del equipo por orquestador). */
  agentIds: { type: [String], default: [] },
  /** Varios agentes top-level en el widget (Business+; requiere multiAgentEnabled). */
  orchestratorAgentIds: { type: [String], default: [] },
  /** Triaje multiagente avanzado: multi-orquestador, paralelo (Business+). Sub-agentes del orquestador se enrutan siempre si existen. */
  multiAgentEnabled: { type: Boolean, default: false },
  multiAgentMode: { type: String, enum: ['triage', 'parallel', 'pipeline'], default: 'triage' },
  /** Pasos y disparador del pipeline (Business+; modo pipeline). */
  pipelineConfig: { type: Schema.Types.Mixed, default: null },
  /** Si false, el embed sigue visible pero /api/widget/chat rechaza peticiones. */
  active: { type: Boolean, default: true },
  /** Minutos sin respuesta del agente antes de ofrecer WhatsApp como fallback. 0 = sin timeout. */
  handoffTimeout: { type: Number, default: 5 },
  // ── Encuesta de satisfacción al final de la conversación ─────────────────────
  feedbackEnabled: { type: Boolean, default: false },
  feedbackTitle:   { type: String, default: '¿Cómo fue tu experiencia?' },
  feedbackThanks:  { type: String, default: '¡Gracias por tu feedback!' },
  /** Minutos de inactividad tras los cuales, al reabrir, la conversación se da por finalizada
   *  y se ofrece la encuesta antes de iniciar otra. 0 = desactivado. */
  conversationIdleTimeout: { type: Number, default: 15 },
  /** Proactividad: mensaje automático (una sola vez) si hubo conversación real y el
   *  visitante queda callado con el chat abierto. Opt-in — desactivado por defecto. */
  idleReengageEnabled: { type: Boolean, default: false },
  idleReengageMinutes: { type: Number, default: 10 },
  idleReengageMessage: { type: String, default: '¿Seguimos por aquí? Si necesitás algo más 🙂' },
  /** Preguntas configurables por el dueño del widget (muy dinámico). */
  feedbackQuestions: {
    type: [{
      id:       { type: String, required: true },
      text:     { type: String, required: true },
      type:     { type: String, enum: ['rating', 'choice', 'text', 'yesno'], default: 'rating' },
      options:  { type: [String], default: [] }, // solo para 'choice'
      required: { type: Boolean, default: false },
      enabled:  { type: Boolean, default: true },
    }],
    default: [],
  },
  // ── Aviso de privacidad / política (footer del chat, siempre visible) ─────────
  /** Muestra el aviso de privacidad en el pie del chat. */
  policyEnabled:   { type: Boolean, default: true },
  /** Texto introductorio opcional del aviso (lo que precede al enlace). Vacío = solo el enlace. */
  policyText:      { type: String, default: '' },
  /** Etiqueta del enlace (p. ej. «Política de Privacidad»). */
  policyLinkLabel: { type: String, default: 'Política de Privacidad' },
  /** URL de la política de privacidad del cliente. Vacío = se muestra como texto sin enlace. */
  policyUrl:       { type: String, default: '' },
}, { timestamps: true });

WidgetSchema.index({ userId: 1, createdAt: -1 });

// ── REQUEST LOGS ─────────────────────────────────────────────────────────────
// Aggregated monthly counters: one doc per (userId, widgetId, month)

const RequestLogSchema = new Schema({
  userId:       { type: String, required: true },
  widgetId:     { type: String, required: true },
  month:        { type: String, required: true }, // "YYYY-MM"
  count:        { type: Number, default: 0 },
  inputTokens:  { type: Number, default: 0 },
  outputTokens: { type: Number, default: 0 },
}, { timestamps: true });

RequestLogSchema.index({ userId: 1, month: -1 });
RequestLogSchema.index({ widgetId: 1, month: -1 });
RequestLogSchema.index({ userId: 1, widgetId: 1, month: 1 }, { unique: true });
RequestLogSchema.index({ month: 1 }); // para filtros solo por rango de fecha

/** Contador diario por pool (widget vs API) — alimenta gráfico del dashboard. */
const ConversationDailyLogSchema = new Schema({
  userId: { type: String, required: true },
  date:   { type: String, required: true }, // YYYY-MM-DD (Colombia)
  pool:   { type: String, enum: ['agents', 'api'], required: true },
  count:  { type: Number, default: 0 },
}, { timestamps: true });

ConversationDailyLogSchema.index({ userId: 1, date: 1, pool: 1 }, { unique: true });
ConversationDailyLogSchema.index({ userId: 1, date: -1 });

// ── CLIENT AGENTS ─────────────────────────────────────────────────────────────
// Agents created by landing users. Cannot be deleted — only disabled.

const ClientAgentSchema = new Schema({
  userId:          { type: String, required: true },
  name:            { type: String, required: true },
  description:     { type: String, default: '' },
  systemPrompt:    { type: String, required: true },
  model:           { type: String, default: 'gemini-2.5-flash' },
  /** Override opcional vs catálogo AIBackHub (widget). */
  inferenceTemperature: { type: Number, required: false },
  inferenceMaxTokens:   { type: Number, required: false },
  type:            { type: String, enum: ['agent', 'sub-agent'], default: 'agent' },
  parentAgentId:   { type: String, default: null }, // only for sub-agents
  status:          { type: String, enum: ['active', 'disabled'], default: 'active' },
  tools: [{
    toolId:  { type: String, required: true },
    config:  { type: Schema.Types.Mixed, default: {} },
  }],
  /** IDs `std:…` / `mcp:…` elegidas en la pestaña Herramientas; se sincronizan a AIBackHub como `enabledToolIds`. */
  enabledMcpToolIds: { type: [String], default: undefined },
  ragEnabled:      { type: Boolean, default: false },
  ragSources: [{
    type:    { type: String, enum: ['url', 'text', 'file'], default: 'text' },
    name:    { type: String, default: '' },
    content: { type: String, default: '' },
    // File-specific metadata (populated when type='file')
    fileId:      { type: String, default: null }, // unique ID for deletion
    fileName:    { type: String, default: null },
    fileMime:    { type: String, default: null },
    fileSize:    { type: Number, default: null }, // bytes
    fileCategory:{ type: String, default: null }, // 'pdf'|'docx'|'text'|'image'
    charCount:   { type: Number, default: 0 },
    warning:     { type: String, default: null },
    uploadedAt:  { type: Date, default: null },
  }],
  subAgentIds:     [{ type: String }], // refs to other ClientAgent._id
  agentHubId:      { type: String, default: null }, // ID in AgentFlowHub backend
  /** Token público del catálogo (AIBackHub); el SDK lo envía como X-Widget-Token (como AgentFlowHub). */
  widgetPublicToken: { type: String, default: null },
  /** Persistencia local del historial de conversación del widget por agente. */
  persistConversationHistory: { type: Boolean, default: true },
  syncStatus:      { type: String, enum: ['pending', 'synced', 'failed'], default: 'pending' },
  /** Creado por admin; visible para todos los usuarios y no cuenta en el cupo de agentes del plan. */
  isPlatform:      { type: Boolean, default: false },
  /** Si true, el motor en AIBackHub refuerza que el agente no responda fuera de rol + tools/RAG/skills. */
  strictPurposeOnly: { type: Boolean, default: true },
  /** Tras cada turno del widget: buscar/crear contacto en HubSpot si hay nombre + email o tel. CO (requiere tools HubSpot). */
  hubspotAutoCaptureContacts: { type: Boolean, default: false },
  /** IDs habilitados (derivado de skillsConfig al guardar; compat legacy). */
  skills:          { type: [String], default: [] },
  /** Fuente de verdad runtime: prompt/tools/settings por skill (catálogo agent-skills-catalog.ts). */
  skillsConfig:    { type: [Schema.Types.Mixed], default: [] },
  /** Reglas operativas editables desde la UI (prioridad, tono, reclamos, respuestas cortas, etc.). */
  behaviorRules:   { type: [Schema.Types.Mixed], default: [] },
  /** Preguntas frecuentes (Q/A) para guiar al modelo. */
  agentFaqs:       { type: [Schema.Types.Mixed], default: [] },
  /** Preguntas repetidas sin FAQ formal (candidatas; el widget incrementa contadores). */
  faqCandidates:   { type: [Schema.Types.Mixed], default: [] },
  /** Nombre de la voz del navegador (SpeechSynthesis) para TTS en el widget. Null = auto. */
  widgetVoiceName: { type: String, default: null },
  /** Modelos de respaldo (máx. 3). Se prueban en orden cuando el modelo principal falla. */
  fallbackModels:  { type: [String], default: [] },
  /** Configuración de Vision (análisis de imágenes). */
  vision: {
    enabled:         { type: Boolean, default: false },
    model:           { type: String, enum: ['gemini-2.5-flash', 'gemini-2.5-pro', 'claude-vision'], default: 'gemini-2.5-flash' },
    ragOnImages:     { type: Boolean, default: true },
    autoExtractText: { type: Boolean, default: true },
    maxImageSize:    { type: Number, default: 20 },
    acceptedFormats: { type: [String], default: ['jpeg', 'png', 'webp'] },
  },
  /**
   * WhatsApp Business (Cloud API) — Fase 2 del chat multiusuario.
   * Credenciales que el CLIENTE conecta (su propia cuenta de Meta). El access
   * token y el app secret se guardan CIFRADOS (secret-crypto). Nunca se
   * devuelven al cliente ni se sincronizan al hub.
   */
  whatsapp: {
    enabled:        { type: Boolean, default: false },
    phoneNumberId:  { type: String, default: '' },   // ID del número (Meta)
    wabaId:         { type: String, default: '' },    // WhatsApp Business Account ID (opcional)
    displayPhone:   { type: String, default: '' },    // número legible para la UI
    accessTokenEnc: { type: String, default: '' },    // token permanente CIFRADO
    appSecretEnc:   { type: String, default: '' },    // app secret CIFRADO (firma webhook, opcional)
    verifyToken:    { type: String, default: '' },    // lo generamos; el cliente lo pega en Meta
    apiVersion:     { type: String, default: 'v21.0' },
    status:         { type: String, enum: ['disconnected', 'pending', 'connected', 'error'], default: 'disconnected' },
    lastError:      { type: String, default: '' },
    connectedAt:    { type: Date, default: null },
    handoffTemplateName: { type: String, default: '' },
    handoffTemplateLang: { type: String, default: '' },
  },
}, { timestamps: true });

// Buscar agente por su Phone Number ID (entrante de WhatsApp → agente).
ClientAgentSchema.index({ 'whatsapp.phoneNumberId': 1 }, { sparse: true });

ClientAgentSchema.index({ userId: 1, type: 1, createdAt: -1 });
ClientAgentSchema.index({ parentAgentId: 1 });
ClientAgentSchema.index({ isPlatform: 1, status: 1 });
// Sync queries: AgentFlowhub/AIBackHub lookup by hub slug
ClientAgentSchema.index({ agentHubId: 1 }, { sparse: true });

// ── PLATFORM AGENT FREE USAGE (por usuario/mes; no descontar de RequestLog hasta superar el umbral) ─

const PlatformUsageSchema = new Schema({
  userId: { type: String, required: true },
  month:   { type: String, required: true },
  /** Mensajes de widget contra agentes isPlatform que aún no “cargan” al RequestLog. */
  platformFreeUsed: { type: Number, default: 0 },
}, { timestamps: true });

PlatformUsageSchema.index({ userId: 1, month: 1 }, { unique: true });

// ── CONVERSATION PACKS (one-time top-ups) ─────────────────────────────────────

const ConversationPackSchema = new Schema({
  userId:          { type: String, required: true },
  packId:          { type: String, required: true },           // 'pack_s' | 'pack_m' | 'pack_l'
  conversations:   { type: Number, required: true },           // total compradas
  used:            { type: Number, default: 0 },               // consumidas
  stripeSessionId: { type: String, default: null },            // checkout session para auditoría
  /** Vencimiento: 90 días desde la compra (los packs no son mensuales). */
  expiresAt:       { type: Date, required: true },
  status:          { type: String, enum: ['active', 'exhausted', 'expired'], default: 'active' },
}, { timestamps: true });

ConversationPackSchema.index({ userId: 1, status: 1, expiresAt: 1 });
ConversationPackSchema.index({ stripeSessionId: 1 }, { unique: true, sparse: true });

// ── AUDIT LOG (acciones cuenta / RGPD) ───────────────────────────────────────

const AuditLogSchema = new Schema({
  userId:   { type: String, required: true, index: true },
  action:   { type: String, required: true },
  resource: { type: String, default: '' },
  meta:     { type: Schema.Types.Mixed, default: {} },
  ip:       { type: String, default: '' },
}, { timestamps: true });

AuditLogSchema.index({ userId: 1, createdAt: -1 });

// ── SECURITY LOG ─────────────────────────────────────────────────────────────
// Eventos de seguridad del flujo de chat: auth failures, rate limits, injection.
// TTL de 90 días — suficiente para forensics sin acumular datos innecesarios.

const SecurityLogSchema = new Schema({
  event:     { type: String, required: true }, // 'rate_limited' | 'origin_not_allowed' | 'token_invalid' | 'quota_exceeded' | 'injection_detected' | 'turn_limit' | 'signature_invalid'
  ip:        { type: String, default: '' },
  origin:    { type: String, default: '' },
  widgetId:  { type: String, default: '' },
  agentId:   { type: String, default: '' },
  userId:    { type: String, default: '' },      // dueño del widget si se resolvió
  code:      { type: String, default: '' },      // código de error devuelto al cliente
  meta:      { type: Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 90 }, // TTL 90d
}, { timestamps: false });

SecurityLogSchema.index({ event: 1, createdAt: -1 });
SecurityLogSchema.index({ ip: 1, createdAt: -1 });
SecurityLogSchema.index({ widgetId: 1, event: 1, createdAt: -1 });

// ── CONVERSATION SESSIONS (analytics enriquecido) ─────────────────────────────
// Cada sesión de chat del widget = una entrada. Permite analytics de duración,
// drop-off, y tasa de resolución.

const ConversationSessionSchema = new Schema({
  widgetId:     { type: String, required: true },
  userId:       { type: String, required: true }, // dueño del widget
  agentId:      { type: String, default: '' },
  sessionId:    { type: String, required: true, unique: true },
  /** Sesión de chat del widget (transcript); distinto de sessionId en entradas ho_* del inbox */
  chatSessionId: { type: String, default: '' },
  /** Visitante estable entre sesiones (memoria episódica cross-session). */
  visitorId:    { type: String, default: '' },
  /** Recordatorio prospectivo: contactar al visitante después de esta fecha. */
  followUpAt:   { type: Date, default: null },
  followUpNote: { type: String, default: '' },
  followUpNotified: { type: Boolean, default: false },
  startedAt:    { type: Date, required: true },
  endedAt:      { type: Date, default: null },
  /** Segundos de duración (null si no terminó) */
  durationSec:  { type: Number, default: null },
  messageCount: { type: Number, default: 0 },
  /** Análisis de sentimiento básico: 'positive' | 'neutral' | 'negative' */
  sentiment:    { type: String, enum: ['positive', 'neutral', 'negative'], default: 'neutral' },
  /** true si el usuario solicitó agente humano */
  escalated:    { type: Boolean, default: false },
  /** Datos del formulario de handoff (nombre, email, teléfono) */
  handoffContact: { type: Schema.Types.Mixed, default: null },
  handoffMessage: { type: String, default: '' },
  handoffAt:      { type: Date, default: null },
  /** Bandeja de entrada: open | resolved */
  inboxStatus:    { type: String, enum: ['open', 'resolved'], default: null },
  /** Última vez que el agente abrió esta conversación en el inbox (para "nuevos sin ver"). */
  agentLastSeenAt:      { type: Date, default: null },
  /** Último mensaje del visitante (handoff o en modo humano); se compara con agentLastSeenAt. */
  lastVisitorMessageAt: { type: Date, default: null },
  /** true si la sesión terminó sin respuesta final del bot (abandonó) */
  dropped:      { type: Boolean, default: false },
  /** true si el usuario respondió positivamente (resolved vía feedback) */
  resolved:     { type: Boolean, default: null },
  /** Hora del día (0-23) para análisis de pico horario */
  hourOfDay:    { type: Number, default: null },
  /** Día de la semana (0=dom, 6=sab) */
  dayOfWeek:    { type: Number, default: null },
  month:        { type: String, default: '' }, // "YYYY-MM"
  /** Contadores Fase 4 — routing multiagente por sesión */
  multiAgentRouted:   { type: Number, default: 0 },
  multiAgentHandoffs: { type: Number, default: 0 },
  multiAgentParallel: { type: Number, default: 0 },
  // ── Live chat con agente humano ──────────────────────────────────────────────
  /** Score de satisfacción (1-5) de la encuesta final, si el visitante respondió. */
  satisfactionScore:  { type: Number, default: null },
  /** true mientras un agente humano está atendiendo (AI en silencio). */
  humanMode:          { type: Boolean, default: false },
  /** Cuándo se activó el modo humano (inicio del handoff efectivo). */
  humanModeAt:        { type: Date, default: null },
  /** Timestamp del último mensaje enviado por el agente humano. */
  lastHumanMessageAt: { type: Date, default: null },
  /** ID del mensaje WA enviado al dueño como alerta de handoff (para rutear su respuesta). */
  handoffWaNotifMsgId: { type: String, default: null },
  /** Error de entrega Meta (webhook status failed), si aplica. */
  handoffWaDeliveryError: { type: String, default: null },
  /** WhatsApp: esperando respuesta a la encuesta tras resolver (antes de nueva conversación). */
  waFeedbackPending: { type: Boolean, default: false },
}, { timestamps: true });

ConversationSessionSchema.index({ widgetId: 1, month: -1 });
ConversationSessionSchema.index({ userId: 1, month: -1 });
ConversationSessionSchema.index({ startedAt: -1 });
ConversationSessionSchema.index({ userId: 1, escalated: 1, inboxStatus: 1, handoffAt: -1 });
ConversationSessionSchema.index({ userId: 1, followUpAt: 1, followUpNotified: 1 });
// Guard de modo humano en /api/widget/chat (consulta por chatSessionId + humanMode).
ConversationSessionSchema.index({ chatSessionId: 1, humanMode: 1 });

// ── WIDGET SESSION CONTEXT (shared memory multi-agente + facts) ───────────────

const WidgetSessionContextSchema = new Schema({
  widgetId:       { type: String, required: true },
  chatSessionId:  { type: String, required: true },
  userId:         { type: String, required: true },
  summary:        { type: String, default: '' },
  facts:          { type: [Schema.Types.Mixed], default: [] },
  lastRoutedAgentName: { type: String, default: '' },
}, { timestamps: true });

WidgetSessionContextSchema.index({ widgetId: 1, chatSessionId: 1, userId: 1 }, { unique: true });
WidgetSessionContextSchema.index({ userId: 1, updatedAt: -1 });

// Estado de trabajo de una conversación (resumen, hechos, OCR de la última
// imagen), no historial: el visitante lo pierde al cerrar la pestaña porque el
// sessionId vive en sessionStorage. Sin caducidad se acumularía para siempre una
// fila por conversación, así que se borra sola a los 7 días del último turno.
// La transcripción visible en el inbox es widgetmessages y no la toca esto.
WidgetSessionContextSchema.index(
  { updatedAt: 1 },
  { expireAfterSeconds: 7 * 24 * 60 * 60, name: 'widgetsessioncontext_ttl' },
);

// ── RAG BULK JOBS ─────────────────────────────────────────────────────────────
// Cola async para ingestión masiva de documentos RAG (ZIP o lotes grandes).

const RagBulkJobSchema = new Schema({
  userId:         { type: String, required: true },
  agentId:        { type: String, required: true },
  plan:           { type: String, default: 'free' },
  status:         { type: String, enum: ['pending', 'processing', 'completed', 'failed'], default: 'pending' },
  totalFiles:     { type: Number, default: 0 },
  processedFiles: { type: Number, default: 0 },
  fileErrors:     [{ file: String, error: String }],
  startedAt:      { type: Date, default: null },
  finishedAt:     { type: Date, default: null },
}, { timestamps: true });

RagBulkJobSchema.index({ userId: 1, agentId: 1, createdAt: -1 });

// ── REGISTRATION CODES ───────────────────────────────────────────────────────
// Códigos de invitación en Mongo (admin). REGISTRATION_CODES en .env actúa como respaldo.

const RegistrationCodeSchema = new Schema({
  code:       { type: String, required: true, unique: true, uppercase: true, trim: true },
  plan:       { type: String, enum: ['free', 'solo', 'team', 'plus', 'business', 'enterprise'], required: true },
  /** Máximo de registros permitidos con este código. 1 = un solo uso. */
  maxUses:    { type: Number, default: 1, min: 1 },
  /** Contador de veces que se ha usado. */
  usedCount:  { type: Number, default: 0 },
  /** Registro de cada uso: quién y cuándo. */
  uses: [{
    userId:   { type: String, required: true },
    email:    { type: String, required: true },
    usedAt:   { type: Date, default: Date.now },
  }],
  /** Si false, el código queda bloqueado aunque no haya agotado maxUses. */
  active:     { type: Boolean, default: true },
  /** Expiración opcional. Si es null, no expira. */
  expiresAt:  { type: Date, default: null },
  /** Admin que lo creó. */
  createdBy:  { type: String, required: true },
  /** Nota libre para identificar al cliente o campaña. */
  note:       { type: String, default: '' },
  /** Días de prueba al registrarse con este código (1–365). */
  trialDays:  { type: Number, default: 7, min: 1, max: 365 },
}, { timestamps: true });

RegistrationCodeSchema.index({ active: 1, createdAt: -1 });

// ── WIDGET MESSAGES ───────────────────────────────────────────────────────────
// Transcripción real de cada intercambio usuario ↔ asistente por widget.
// Se guarda de forma fire-and-forget en el stream route.

const WidgetMessageSchema = new Schema({
  widgetId:  { type: String, required: true },
  userId:    { type: String, required: true }, // dueño del widget
  agentId:   { type: String, default: '' },
  sessionId: { type: String, default: '' },
  role:      { type: String, enum: ['user', 'assistant'], required: true },
  /** 'ai' = respuesta del LLM · 'human' = respuesta del agente humano desde inbox o WhatsApp */
  sentBy:    { type: String, enum: ['ai', 'human'], default: 'ai' },
  content:   { type: String, default: '' }, // puede ir vacío si el mensaje es solo adjunto
  traceId:   { type: String, default: '' },
  /** Mensaje retirado por el agente: se conserva la fila (auditoría) pero el widget lo elimina. */
  deleted:   { type: Boolean, default: false },
  /** Acuses de recibo (solo mensajes sentBy:'human' enviados al visitante). */
  deliveredAt: { type: Date, default: null }, // el widget del cliente lo recibió (poll)
  readAt:      { type: Date, default: null }, // el widget lo mostró abierto (visto)
  attachments: [{
    type:        { type: String, enum: ['image', 'video', 'file'], default: 'image' },
    url:         { type: String, required: true },
    publicId:    { type: String, default: '' },   // Cloudinary public_id (para borrar)
    resourceType:{ type: String, enum: ['image', 'video', 'raw'], default: 'image' },
    name:        { type: String, default: '' },   // nombre original del archivo
    mime:        { type: String, default: '' },
    bytes:       { type: Number, default: 0 },
    width:       { type: Number, default: 0 },
    height:      { type: Number, default: 0 },
    ocrText:     { type: String, default: '' },
  }],
}, { timestamps: true });

WidgetMessageSchema.index({ widgetId: 1, createdAt: -1 });
WidgetMessageSchema.index({ userId: 1, createdAt: -1 });
WidgetMessageSchema.index({ sessionId: 1, createdAt: 1 });

// ── TEAM / ORGANIZATIONS ───────────────────────────────────────────────────────
// Permite que múltiples usuarios compartan el mismo workspace.

const OrganizationSchema = new Schema({
  name:       { type: String, required: true },
  slug:       { type: String, required: true, unique: true },
  ownerId:    { type: String, required: true },
  members: [{
    userId: { type: String, required: true },
    role:   { type: String, enum: ['owner', 'admin', 'viewer'], default: 'viewer' },
    joinedAt: { type: Date, default: Date.now },
  }],
  /** Invitaciones pendientes por email */
  invites: [{
    email:    { type: String, required: true, lowercase: true },
    role:     { type: String, enum: ['admin', 'viewer'], default: 'viewer' },
    token:    { type: String, required: true },
    expiresAt:{ type: Date, required: true },
    invitedBy:{ type: String, required: true },
  }],
}, { timestamps: true });

OrganizationSchema.index({ ownerId: 1 });
OrganizationSchema.index({ 'members.userId': 1 });

// ── CONVERSATION FLOWS (editor visual) ────────────────────────────────────────

const ConversationFlowSchema = new Schema({
  userId:    { type: String, required: true },
  orgId:     { type: String, default: null },
  workspaceId: { type: String, required: true },
  name:      { type: String, default: 'Flujo sin título' },
  status:    { type: String, enum: ['draft', 'published'], default: 'draft' },
  description: { type: String, default: '' },
  tags:      { type: String, default: '' },
  generatesLeads: { type: Boolean, default: false },
  enabledChannels: { type: [String], default: ['widget'] },
  completionMessage: { type: String, default: '' },
  tooltipEnabled: { type: Boolean, default: false },
  tooltipMessage: { type: String, default: '' },
  tooltipDelay: { type: Number, default: 3000 },
  tooltipDuration: { type: Number, default: 5000 },
  nodes:     { type: [Schema.Types.Mixed], default: [] },
  connections: { type: [Schema.Types.Mixed], default: [] },
  embedToken: { type: String, default: null },
}, { timestamps: true });

ConversationFlowSchema.index({ userId: 1, workspaceId: 1, updatedAt: -1 });

const FlowConversationSchema = new Schema({
  flowId:       { type: String, required: true },
  userId:       { type: String, required: true },
  sessionId:    { type: String, required: true, unique: true },
  widgetId:     { type: String, default: '' },
  visitorId:    { type: String, default: '' },
  status:       { type: String, enum: ['active', 'completed', 'abandoned'], default: 'active' },
  startedAt:    { type: Date, required: true },
  endedAt:      { type: Date, default: null },
  durationSec:  { type: Number, default: null },
  messageCount: { type: Number, default: 0 },
  currentNodeId:{ type: String, default: '' },
  answers:      { type: [Schema.Types.Mixed], default: [] },
  month:        { type: String, default: '' },
}, { timestamps: true });

FlowConversationSchema.index({ flowId: 1, startedAt: -1 });
FlowConversationSchema.index({ userId: 1, flowId: 1, startedAt: -1 });

// ── REFERRALS ─────────────────────────────────────────────────────────────────

const ReferralSchema = new Schema({
  referrerId:    { type: String, required: true, unique: true }, // quien refirió
  code:          { type: String, required: true, unique: true },  // link único
  /** IDs de usuarios que usaron este código */
  referredUsers: [{ type: String }],
  /** Conversaciones bonus otorgadas al referidor */
  bonusGranted:  { type: Number, default: 0 },
  /** Conversaciones bonus pendientes de otorgar */
  bonusPending:  { type: Number, default: 0 },
}, { timestamps: true });

// ── A/B PROMPT TEST ───────────────────────────────────────────────────────────

const AbTestSchema = new Schema({
  agentId:   { type: String, required: true },
  userId:    { type: String, required: true },
  name:      { type: String, required: true },
  status:    { type: String, enum: ['running', 'stopped', 'archived'], default: 'running' },
  variants: [{
    id:         { type: String, required: true },
    label:      { type: String, default: '' },
    systemPrompt: { type: String, required: true },
    trafficPct: { type: Number, default: 50 }, // 0-100
    sessions:   { type: Number, default: 0 },
    escalations:{ type: Number, default: 0 },
    positiveResponses: { type: Number, default: 0 },
    avgDurationSec: { type: Number, default: null },
  }],
  startedAt: { type: Date, default: Date.now },
  stoppedAt: { type: Date, default: null },
}, { timestamps: true });

AbTestSchema.index({ agentId: 1, userId: 1 });
AbTestSchema.index({ userId: 1, status: 1 });

// ── MANUAL INVOICES (recibos generados fuera de LemonSqueezy) ─────────────────

const ManualInvoiceLineItemSchema = new Schema({
  concept:     { type: String, required: true },
  amountCents: { type: Number, required: true },
  currency:    { type: String, default: 'EUR' },
  notes:       { type: String, default: '' },
}, { _id: false });

const ManualInvoiceSchema = new Schema({
  userId:        { type: String, required: true, index: true },
  invoiceNumber: { type: String, required: true },
  issuedAt:      { type: Date, required: true },
  concept:       { type: String, required: true },
  lineItems:     { type: [ManualInvoiceLineItemSchema], default: [] },
  amountCents:   { type: Number, required: true },
  currency:      { type: String, default: 'EUR' },
  taxPercent:    { type: Number, default: 0 },
  taxCents:      { type: Number, default: 0 },
  totalCents:    { type: Number, required: true },
  paymentMethod: { type: String, default: '' },
  paymentRef:    { type: String, default: '' },
  notes:         { type: String, default: '' },
  buyer:         { type: Schema.Types.Mixed, default: null },
  issuer:        { type: Schema.Types.Mixed, default: null },
  status:        { type: String, enum: ['issued', 'void'], default: 'issued' },
}, { timestamps: true });

ManualInvoiceSchema.index({ userId: 1, invoiceNumber: 1 }, { unique: true });
ManualInvoiceSchema.index({ userId: 1, issuedAt: -1 });

// ── SCHEDULED TASKS (cron por agente) ─────────────────────────────────────────
// Definición + estado de programación. Las ejecuta el worker `cron-schedule`
// (Cloud Run) leyendo esta colección; el landing solo crea/edita y LEE estado.

const ScheduledTaskSchema = new Schema({
  agentId:   { type: String, required: true }, // ClientAgent._id
  userId:    { type: String, required: true }, // dueño (para límites de plan + scoping)
  widgetId:  { type: String, default: '' },     // destino para chat_message / agent_run
  sessionId: { type: String, default: '' },     // conversación destino (opcional)
  name:      { type: String, required: true },  // para preguntar por nombre en el chat
  enabled:   { type: Boolean, default: true },
  /** Cron expression generada por el wizard (el usuario no la escribe a mano). */
  cron:      { type: String, required: true },
  timezone:  { type: String, default: 'America/Bogota' },
  action: {
    type:   { type: String, enum: ['webhook', 'agent_run', 'chat_message', 'email', 'calendar_reminder', 'ticket_followup', 'lead_followup'], required: true },
    /** Varía según `type`. Mixed: requiere markModified('action.config') al editar anidado. */
    config: { type: Schema.Types.Mixed, default: {} },
    /**
     * Pasos siguientes tras éxito del principal (flow corto).
     * Worker: ejecutar en serie; plantillas pueden usar {{prev.output}}.
     */
    then: {
      type: [
        {
          type: { type: String, enum: ['webhook', 'agent_run', 'chat_message', 'email', 'calendar_reminder', 'ticket_followup', 'lead_followup'] },
          config: { type: Schema.Types.Mixed, default: {} },
        },
      ],
      default: undefined,
    },
  },
  retryPolicy: {
    maxRetries:        { type: Number, default: 3, min: 0, max: 10 },
    backoff:           { type: String, enum: ['fixed', 'exponential'], default: 'fixed' },
    retryDelayMinutes: { type: Number, default: 5, min: 1, max: 1440 },
  },
  // ── Estado de scheduling ────────────────────────────────────────────────────
  status:      { type: String, enum: ['idle', 'running', 'success', 'failed', 'exhausted', 'paused'], default: 'idle' },
  /** Reloj del horario normal (próxima corrida programada). */
  nextRunAt:   { type: Date, default: null },
  /** SEPARADO de nextRunAt: solo existe mientras hay un fallo en curso. */
  nextRetryAt: { type: Date, default: null },
  /** Fallos consecutivos del ciclo actual (se resetea al tener éxito o agotar). */
  attempts:    { type: Number, default: 0 },
  lastRunAt:   { type: Date, default: null },
  lastStatus:  { type: String, default: '' },
  lastError:   { type: String, default: '' },
  /** Marca de lock para detectar corridas colgadas (el worker lo reclama tras timeout). */
  lockedAt:    { type: Date, default: null },
  /** SHA-256 del código de seguridad (opcional). Si existe, el agente debe pedirlo antes de ejecutar. */
  securityCodeHash: { type: String, default: null },
}, { timestamps: true });

ScheduledTaskSchema.index({ enabled: 1, nextRunAt: 1 });
ScheduledTaskSchema.index({ enabled: 1, nextRetryAt: 1 });
ScheduledTaskSchema.index({ agentId: 1, createdAt: -1 });
ScheduledTaskSchema.index({ userId: 1, createdAt: -1 });

// ── TASK EXECUTIONS (historial de corridas; lo lee el agente para "última ejecución") ─

const TaskExecutionSchema = new Schema({
  taskId:        { type: String, required: true },
  agentId:       { type: String, default: '' },
  userId:        { type: String, default: '' },
  runAt:         { type: Date, required: true },
  status:        { type: String, enum: ['success', 'failed'], required: true },
  attempt:       { type: Number, default: 0 },
  durationMs:    { type: Number, default: 0 },
  triggeredBy:   { type: String, enum: ['schedule', 'retry'], default: 'schedule' },
  error:         { type: String, default: '' },
  outputSummary: { type: String, default: '' },
}, { timestamps: true });

TaskExecutionSchema.index({ taskId: 1, runAt: -1 });
TaskExecutionSchema.index({ agentId: 1, runAt: -1 });
// TTL 90 días — historial suficiente sin acumular indefinidamente.
TaskExecutionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

// ── WIDGET FEEDBACK (encuesta de satisfacción por conversación) ───────────────
// Una respuesta por sesión. El dueño ve score agregado + respuestas en el dashboard.

const WidgetFeedbackSchema = new Schema({
  widgetId:  { type: String, required: true },
  userId:    { type: String, required: true }, // dueño del widget
  agentId:   { type: String, default: '' },
  sessionId: { type: String, default: '' },
  visitorId: { type: String, default: '' },
  /** Promedio de las respuestas tipo rating (1-5). null si no hubo rating. */
  score:     { type: Number, default: null },
  answers: [{
    questionId:   { type: String, default: '' },
    questionText: { type: String, default: '' },
    type:         { type: String, enum: ['rating', 'choice', 'text', 'yesno'], default: 'rating' },
    /** number (rating) o string (choice/text/yesno). */
    value:        { type: Schema.Types.Mixed, default: null },
  }],
}, { timestamps: true });

WidgetFeedbackSchema.index({ widgetId: 1, createdAt: -1 });
WidgetFeedbackSchema.index({ sessionId: 1 });
WidgetFeedbackSchema.index({ userId: 1, createdAt: -1 });

// ── EXPORTS (safe for Next.js HMR) ───────────────────────────────────────────

// Delete cached models in dev so schema changes take effect on hot reload
if (process.env.NODE_ENV !== 'production') {
  const modelNames = [
    'User', 'ClientAgent', 'Subscription', 'PlatformUsage', 'ConversationPack',
    'AuditLog', 'SecurityLog', 'ConversationSession', 'WidgetSessionContext', 'RagBulkJob', 'Organization', 'Referral', 'AbTest',
    'ManualInvoice', 'ScheduledTask', 'TaskExecution', 'WidgetFeedback',
  ] as const;
  modelNames.forEach((name) => {
    if (mongoose.models[name]) delete (mongoose.models as Record<string, unknown>)[name];
  });
}
export const User                 = mongoose.models.User                 || mongoose.model('User', UserSchema);
export const Subscription         = mongoose.models.Subscription         || mongoose.model('Subscription', SubscriptionSchema);
export const Widget               = mongoose.models.Widget               || mongoose.model('Widget', WidgetSchema);
export const RequestLog           = mongoose.models.RequestLog           || mongoose.model('RequestLog', RequestLogSchema);
export const ConversationDailyLog = mongoose.models.ConversationDailyLog || mongoose.model('ConversationDailyLog', ConversationDailyLogSchema);
export const ClientAgent          = mongoose.models.ClientAgent          || mongoose.model('ClientAgent', ClientAgentSchema);
export const PlatformUsage        = mongoose.models.PlatformUsage        || mongoose.model('PlatformUsage', PlatformUsageSchema);
export const ConversationPack     = mongoose.models.ConversationPack     || mongoose.model('ConversationPack', ConversationPackSchema);
export const AuditLog             = mongoose.models.AuditLog             || mongoose.model('AuditLog', AuditLogSchema);
export const SecurityLog          = mongoose.models.SecurityLog          || mongoose.model('SecurityLog', SecurityLogSchema);
export const ConversationSession  = mongoose.models.ConversationSession  || mongoose.model('ConversationSession', ConversationSessionSchema);
export const WidgetSessionContext = mongoose.models.WidgetSessionContext || mongoose.model('WidgetSessionContext', WidgetSessionContextSchema);
export const RagBulkJob           = mongoose.models.RagBulkJob           || mongoose.model('RagBulkJob', RagBulkJobSchema);
export const Organization         = mongoose.models.Organization         || mongoose.model('Organization', OrganizationSchema);
export const ConversationFlow     = mongoose.models.ConversationFlow     || mongoose.model('ConversationFlow', ConversationFlowSchema);
export const FlowConversation       = mongoose.models.FlowConversation       || mongoose.model('FlowConversation', FlowConversationSchema);
export const Referral             = mongoose.models.Referral             || mongoose.model('Referral', ReferralSchema);
export const AbTest               = mongoose.models.AbTest               || mongoose.model('AbTest', AbTestSchema);
export const WidgetMessage        = mongoose.models.WidgetMessage        || mongoose.model('WidgetMessage', WidgetMessageSchema);
export const RegistrationCode     = mongoose.models.RegistrationCode     || mongoose.model('RegistrationCode', RegistrationCodeSchema);
export const ManualInvoice        = mongoose.models.ManualInvoice        || mongoose.model('ManualInvoice', ManualInvoiceSchema);
export const ScheduledTask        = mongoose.models.ScheduledTask        || mongoose.model('ScheduledTask', ScheduledTaskSchema);
export const TaskExecution        = mongoose.models.TaskExecution        || mongoose.model('TaskExecution', TaskExecutionSchema);
export const WidgetFeedback       = mongoose.models.WidgetFeedback       || mongoose.model('WidgetFeedback', WidgetFeedbackSchema);

// ── WIDGET SHARES ─────────────────────────────────────────────────────────────
// Acceso compartido público a un widget mediante contraseña generada.

const WidgetShareSchema = new Schema({
  widgetId:      { type: String, required: true },
  userId:        { type: String, required: true },
  shareId:       { type: String, required: true, unique: true },
  passwordHash:  { type: String, required: true },
  label:         { type: String, default: '' },
  active:        { type: Boolean, default: true },
  expiresAt:     { type: Date, required: true },
  durationValue: { type: Number, default: 8 },
  durationUnit:  { type: String, default: 'hours' },
}, { timestamps: true });

WidgetShareSchema.index({ widgetId: 1, userId: 1 });
WidgetShareSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const WidgetShare = mongoose.models.WidgetShare || mongoose.model('WidgetShare', WidgetShareSchema);

// ── INFERENCE METRICS ────────────────────────────────────────────────────────
// Una fila por request LLM. Sirve para medir costo real, distribución de
// tokens entre componentes (system/history/tools/RAG), y decidir dónde
// optimizar primero. NO se usa para reconstruir el chat — para eso está
// widgetmessages. TTL automático 90 días (se borran solas).

const InferenceMetricSchema = new Schema({
  userId:           { type: String, required: true, index: true },
  agentId:          { type: String, required: true, index: true },
  widgetId:         { type: String, default: null, index: true },
  sessionId:        { type: String, default: null },
  traceId:          { type: String, default: null },
  model:            { type: String, default: '' },        // ej. 'vx/gemini-2.5-pro'
  provider:         { type: String, default: '' },        // 'google-ai' | 'anthropic' | 'huggingface' | ...
  // Tokens (si el provider los devuelve)
  inputTokens:      { type: Number, default: null },
  outputTokens:     { type: Number, default: null },
  totalTokens:      { type: Number, default: null },
  // Composición del prompt (chars son cheap proxies cuando no tenemos tokens reales)
  systemChars:      { type: Number, default: 0 },
  toolDefsChars:    { type: Number, default: 0 },
  historyTurns:     { type: Number, default: 0 },
  ragChars:         { type: Number, default: 0 },
  // Tools y resultados
  toolRounds:       { type: Number, default: 0 },
  toolsUsed:        { type: [String], default: [] },
  // Costo (en USD, si el provider/wrapper lo informa)
  costUsd:          { type: Number, default: null },
  // Performance
  latencyMs:        { type: Number, default: 0 },
  // Estado
  ok:               { type: Boolean, default: true },
  errorCode:        { type: String, default: null },
  // Path: 'direct-mcp' | 'stream-proxy' | 'non-stream-proxy' | 'inference-direct'
  path:             { type: String, default: '' },
  createdAt:        { type: Date, default: Date.now, expires: 90 * 24 * 60 * 60 }, // TTL 90 días
}, { timestamps: false });

InferenceMetricSchema.index({ userId: 1, createdAt: -1 });
InferenceMetricSchema.index({ agentId: 1, createdAt: -1 });

export const InferenceMetric = mongoose.models.InferenceMetric || mongoose.model('InferenceMetric', InferenceMetricSchema);

// ── WIDGET CHAT LATENCY (Fase 4) ─────────────────────────────────────────────
// Una fila por request widget con desglose de ms por fase (auth, hub, reveal…).
// TTL 30 días. Complementa InferenceMetric (tokens/costo) con diagnóstico de UX.

const WidgetChatLatencySchema = new Schema({
  traceId:    { type: String, required: true, index: true },
  userId:     { type: String, default: '', index: true },
  agentId:    { type: String, default: '', index: true },
  widgetId:   { type: String, default: null, index: true },
  sessionId:  { type: String, default: null },
  path:       { type: String, default: '' },
  totalMs:    { type: Number, default: 0 },
  phases:     { type: Schema.Types.Mixed, default: {} },
  ok:         { type: Boolean, default: true },
  errorCode:  { type: String, default: null },
  replyLen:   { type: Number, default: null },
  /** Observabilidad F4: fases SSE, tools, tokens, honestidad de status. */
  ssePhases:        { type: [String], default: [] },
  toolsUsed:        { type: [String], default: [] },
  promptChars:      { type: Number, default: null },
  promptTokensEst:  { type: Number, default: null },
  inputTokens:      { type: Number, default: null },
  statusHonest:     { type: Boolean, default: true },
  lyingReason:      { type: String, default: null },
  createdAt:  { type: Date, default: Date.now, expires: 30 * 24 * 60 * 60 },
}, { timestamps: false });

WidgetChatLatencySchema.index({ createdAt: -1 });
WidgetChatLatencySchema.index({ path: 1, createdAt: -1 });

export const WidgetChatLatency =
  mongoose.models.WidgetChatLatency || mongoose.model('WidgetChatLatency', WidgetChatLatencySchema);

// ── SKILL CATALOG (global, admin) ───────────────────────────────────────────

const SkillCatalogSchema = new Schema({
  skillId:          { type: String, required: true, unique: true, trim: true, index: true },
  label:            { type: String, required: true, trim: true },
  description:      { type: String, default: '' },
  color:            { type: String, default: '#94a3b8' },
  icon:             { type: String, default: '✨' },
  kind:             { type: String, enum: ['capability', 'profile'], default: 'capability' },
  category:         { type: String, default: 'general', trim: true, index: true },
  tags:             { type: [String], default: [] },
  defaultPriority:  { type: Number, default: 60 },
  config: {
    prompt_extension: { type: String, default: '' },
    active_tools:     { type: [String], default: [] },
    llm_settings: {
      temperature:     { type: Number, default: null },
      maxOutputTokens: { type: Number, default: null },
    },
  },
  /** Si false, oculta en el editor de agentes (no borra agentes que ya la usan). */
  catalogEnabled:   { type: Boolean, default: true },
  sortOrder:          { type: Number, default: 0 },
  updatedBy:          { type: String, default: null },
}, { timestamps: true });

SkillCatalogSchema.index({ kind: 1, sortOrder: 1 });
SkillCatalogSchema.index({ category: 1, kind: 1 });

export const SkillCatalog = mongoose.models.SkillCatalog || mongoose.model('SkillCatalog', SkillCatalogSchema);

// ── SHEET SNAPSHOTS (sync nocturno Plus) ────────────────────────────────────

const SheetSnapshotSchema = new Schema({
  userId:         { type: String, required: true, index: true },
  agentId:        { type: String, required: true, index: true },
  sheetEntryId:   { type: String, required: true },
  sheetName:      { type: String, default: '' },
  spreadsheetId:  { type: String, default: '' },
  tabGid:         { type: String, default: '' },
  tabTitle:       { type: String, default: '' },
  header:         { type: [String], default: [] },
  rows:           { type: [[String]], default: [] },
  byteSize:       { type: Number, default: 0 },
  rowCount:       { type: Number, default: 0 },
  totalRows:      { type: Number, default: 0 },
  chunkIndex:     { type: Number, default: 0 },
  complete:       { type: Boolean, default: false },
  syncedAt:       { type: Date, default: Date.now },
  syncError:      { type: String, default: null },
}, { timestamps: true });

SheetSnapshotSchema.index({ agentId: 1, sheetEntryId: 1, chunkIndex: 1 }, { unique: true });
SheetSnapshotSchema.index({ userId: 1, syncedAt: -1 });

export const SheetSnapshot =
  mongoose.models.SheetSnapshot || mongoose.model('SheetSnapshot', SheetSnapshotSchema);

const SheetSyncUsageSchema = new Schema({
  userId:           { type: String, required: true },
  month:            { type: String, required: true },
  bytesStored:      { type: Number, default: 0 },
  estimatedUsd:     { type: Number, default: 0 },
  billingEnabled:   { type: Boolean, default: false },
  lastSyncAt:       { type: Date, default: null },
}, { timestamps: true });

SheetSyncUsageSchema.index({ userId: 1, month: 1 }, { unique: true });

export const SheetSyncUsage =
  mongoose.models.SheetSyncUsage || mongoose.model('SheetSyncUsage', SheetSyncUsageSchema);
