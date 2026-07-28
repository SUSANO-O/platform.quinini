/** Canal de origen del consumo — independiente de cómo se cobra. */
export type MeteringChannel =
  | 'widget_production'
  | 'widget_preview'
  | 'cron'
  | 'api'
  | 'whatsapp';

/** Contexto para resolver cuánto descuenta una interacción del cupo. */
export type MeteringContext = {
  channel: MeteringChannel;
  userId?: string;
  plan?: string;
  subscriptionStatus?: string;
  /** Overrides admin / promos activos (`subscription.features`). */
  subscriptionFeatures?: string[];
  widgetId?: string;
  agentId?: string;
  at?: Date;
};

/** Resultado aplicado al contador (`RequestLog.count`, etc.). */
export type MeteringDecision = {
  /** Unidades facturables (puede ser fracción, ej. 0.5). */
  billableUnits: number;
  channel: MeteringChannel;
  /** Trazabilidad: reglas aplicadas en orden. */
  appliedRules: string[];
  /** Multiplicador del límite del plan (promos “+20% cupo”). Default 1. */
  limitMultiplier: number;
};

/** Parche opcional que devuelve cada política. */
export type MeteringPolicyPatch = {
  billableUnits?: number;
  billableUnitsMultiplier?: number;
  limitMultiplier?: number;
};

export type MeteringPolicy = {
  id: string;
  /** Menor número = se evalúa antes (base → ajustes → promos). */
  priority: number;
  apply(ctx: MeteringContext): MeteringPolicyPatch | null;
};
