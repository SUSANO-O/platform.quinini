import mongoose, { Schema } from 'mongoose';

// ── USERS ────────────────────────────────────────────────────────────────────

const UserSchema = new Schema({
  email:             { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash:      { type: String, required: true },
  hashVersion:       { type: String, enum: ['v1-sha256', 'v2-bcrypt'], default: 'v1-sha256' },
  displayName:       { type: String, default: null },
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
    default: 'trialing',
  },
  plan: {
    type: String,
    enum: ['free', 'starter', 'growth', 'business', 'enterprise'],
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
  fabHint:      { type: String, default: '' },
  avatar:       { type: String, default: '' },
  position:     { type: String, default: 'bottom-right' },
  theme:        { type: String, enum: ['light', 'dark'], default: 'light' },
  borderRadius: { type: String, default: '16px' },
  autoOpen:     { type: Boolean, default: false },
  /** Teléfono WhatsApp (con código de país); el SDK ofrece “Hablar con una persona”. */
  humanSupportPhone: { type: String, default: '' },
  afhubToken:   { type: String, default: null },
  afhubWidgetId:{ type: String, default: null },
  orgId:        { type: String, default: null },
}, { timestamps: true });

WidgetSchema.index({ userId: 1, createdAt: -1 });

// ── REQUEST LOGS ─────────────────────────────────────────────────────────────
// Aggregated monthly counters: one doc per (userId, widgetId, month)

const RequestLogSchema = new Schema({
  userId:   { type: String, required: true },
  widgetId: { type: String, required: true },
  month:    { type: String, required: true }, // "YYYY-MM"
  count:    { type: Number, default: 0 },
}, { timestamps: true });

RequestLogSchema.index({ userId: 1, month: -1 });
RequestLogSchema.index({ widgetId: 1, month: -1 });
RequestLogSchema.index({ userId: 1, widgetId: 1, month: 1 }, { unique: true });

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
  /** IDs de skills del catálogo (agent-skills.ts). Sincronizado bidireccional con el hub. */
  skills:          { type: [String], default: [] },
  /** Config runtime de skills (prompt/tools/settings), sincronizada con el hub. */
  skillsConfig:    { type: [Schema.Types.Mixed], default: [] },
}, { timestamps: true });

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

// ── EXPORTS (safe for Next.js HMR) ───────────────────────────────────────────

// Delete cached models in dev so schema changes take effect on hot reload
if (process.env.NODE_ENV !== 'production') {
  (['User', 'ClientAgent', 'Subscription', 'PlatformUsage', 'ConversationPack', 'AuditLog'] as const).forEach((name) => {
    if (mongoose.models[name]) delete (mongoose.models as Record<string, unknown>)[name];
  });
}
export const User             = mongoose.models.User             || mongoose.model('User', UserSchema);
export const Subscription     = mongoose.models.Subscription     || mongoose.model('Subscription', SubscriptionSchema);
export const Widget           = mongoose.models.Widget           || mongoose.model('Widget', WidgetSchema);
export const RequestLog       = mongoose.models.RequestLog       || mongoose.model('RequestLog', RequestLogSchema);
export const ClientAgent      = mongoose.models.ClientAgent      || mongoose.model('ClientAgent', ClientAgentSchema);
export const PlatformUsage    = mongoose.models.PlatformUsage    || mongoose.model('PlatformUsage', PlatformUsageSchema);
export const ConversationPack = mongoose.models.ConversationPack || mongoose.model('ConversationPack', ConversationPackSchema);
export const AuditLog         = mongoose.models.AuditLog         || mongoose.model('AuditLog', AuditLogSchema);
