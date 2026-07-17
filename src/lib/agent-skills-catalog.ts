/**
 * Tipos y helpers puros del catálogo de skills.
 * Los datos viven en Mongo (`skill_catalog`) — ver skill-catalog-service.ts y /admin/skills.
 */

export type SkillLlmSettings = {
  temperature?: number;
  maxOutputTokens?: number;
};

export type SkillRuntimeConfig = {
  prompt_extension: string;
  active_tools: string[];
  llm_settings?: SkillLlmSettings;
};

/** Categorías de negocio para filtrar/agrupar en UI (no afectan runtime). */
export type SkillCategory =
  | 'ventas'
  | 'soporte'
  | 'operaciones'
  | 'finanzas'
  | 'rrhh'
  | 'legal'
  | 'marketing'
  | 'producto'
  | 'conocimiento'
  | 'productividad'
  | 'integraciones'
  | 'analisis'
  | 'desarrollo'
  | 'general';

export const SKILL_CATEGORY_LABELS: Record<SkillCategory, string> = {
  ventas: 'Ventas',
  soporte: 'Soporte',
  operaciones: 'Operaciones',
  finanzas: 'Finanzas',
  rrhh: 'RRHH',
  legal: 'Legal y compliance',
  marketing: 'Marketing',
  producto: 'Producto',
  conocimiento: 'Conocimiento',
  productividad: 'Productividad',
  integraciones: 'Integraciones',
  analisis: 'Análisis',
  desarrollo: 'Desarrollo',
  general: 'General',
};

export type AgentSkillCatalogEntry = {
  id: string;
  label: string;
  description: string;
  color: string;
  icon: string;
  kind: 'capability' | 'profile';
  /** Agrupación de negocio (UI / catálogo). */
  category?: SkillCategory | string;
  /** Etiquetas libres para búsqueda y composición sugerida. */
  tags?: string[];
  defaultPriority: number;
  config: SkillRuntimeConfig;
  /** Solo admin: si false, no aparece en el editor de agentes. */
  catalogEnabled?: boolean;
};

export type SkillConfigRow = {
  id: string;
  name?: string;
  enabled?: boolean;
  priority?: number;
  config?: {
    prompt_extension?: string;
    active_tools?: string[];
    llm_settings?: SkillLlmSettings;
  };
};

export function makeSkillCatalogMap(catalog: AgentSkillCatalogEntry[]): Map<string, AgentSkillCatalogEntry> {
  return new Map(catalog.map((s) => [s.id, s]));
}

export function getSkillCatalogEntry(
  catalog: AgentSkillCatalogEntry[],
  id: string,
): AgentSkillCatalogEntry | undefined {
  return makeSkillCatalogMap(catalog).get(id.trim());
}

export function buildSkillConfigEntry(
  catalog: AgentSkillCatalogEntry[],
  id: string,
  enabled = true,
  priority?: number,
): SkillConfigRow | null {
  const entry = getSkillCatalogEntry(catalog, id);
  if (!entry) return null;
  return {
    id: entry.id,
    name: entry.label,
    enabled,
    priority: priority ?? entry.defaultPriority,
    config: {
      prompt_extension: entry.config.prompt_extension,
      active_tools: [...entry.config.active_tools],
      ...(entry.config.llm_settings ? { llm_settings: { ...entry.config.llm_settings } } : {}),
    },
  };
}

export function hydrateSkillConfigRow(
  catalog: AgentSkillCatalogEntry[],
  row: SkillConfigRow,
): SkillConfigRow | null {
  const entry = getSkillCatalogEntry(catalog, row.id);
  if (!entry) return null;

  const saved = row.config ?? {};
  const prompt =
    (typeof saved.prompt_extension === 'string' && saved.prompt_extension.trim()) ||
    entry.config.prompt_extension;
  const tools = [
    ...entry.config.active_tools,
    ...(Array.isArray(saved.active_tools) ? saved.active_tools : []),
  ]
    .map((t) => (typeof t === 'string' ? t.trim() : ''))
    .filter(Boolean);
  const uniqueTools = [...new Set(tools)];

  const llm = {
    ...(entry.config.llm_settings ?? {}),
    ...(saved.llm_settings ?? {}),
  };
  const hasLlm =
    typeof llm.temperature === 'number' || typeof llm.maxOutputTokens === 'number';

  return {
    id: entry.id,
    name: row.name?.trim() || entry.label,
    enabled: row.enabled !== false,
    priority: row.priority ?? entry.defaultPriority,
    config: {
      prompt_extension: prompt,
      active_tools: uniqueTools,
      ...(hasLlm ? { llm_settings: llm } : {}),
    },
  };
}

export function normalizeAgentSkillsState(
  catalog: AgentSkillCatalogEntry[],
  legacySkillIds?: string[] | null,
  rows?: SkillConfigRow[] | null,
): SkillConfigRow[] {
  const byId = new Map<string, SkillConfigRow>();

  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row?.id) continue;
    const hydrated = hydrateSkillConfigRow(catalog, row);
    if (hydrated) byId.set(hydrated.id, hydrated);
  }

  for (const rawId of Array.isArray(legacySkillIds) ? legacySkillIds : []) {
    const id = typeof rawId === 'string' ? rawId.trim() : '';
    if (!id || byId.has(id)) continue;
    const built = buildSkillConfigEntry(catalog, id, true);
    if (built) byId.set(id, built);
  }

  return [...byId.values()].sort(
    (a, b) => (a.priority ?? 100) - (b.priority ?? 100),
  );
}

export function isSkillEnabled(rows: SkillConfigRow[], id: string): boolean {
  const row = rows.find((s) => s.id === id);
  return row?.enabled !== false && Boolean(row);
}

export function countEnabledSkills(
  catalog: AgentSkillCatalogEntry[],
  rows: SkillConfigRow[],
): number {
  const map = makeSkillCatalogMap(catalog);
  return rows.filter((s) => s.enabled !== false && map.has(s.id)).length;
}

export function skillsConfigForSave(
  catalog: AgentSkillCatalogEntry[],
  rows: SkillConfigRow[],
): {
  skillsConfig: SkillConfigRow[];
  skillIds: string[];
} {
  const skillsConfig = rows
    .filter((s) => s.enabled !== false)
    .map((s) => hydrateSkillConfigRow(catalog, s))
    .filter((s): s is SkillConfigRow => Boolean(s));

  return {
    skillsConfig,
    skillIds: skillsConfig.map((s) => s.id),
  };
}
