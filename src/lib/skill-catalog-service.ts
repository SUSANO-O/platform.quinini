import { connectDB } from '@/lib/db/connection';
import { SkillCatalog } from '@/lib/db/models';
import { DEFAULT_AGENT_SKILLS_CATALOG } from '@/lib/agent-skills-catalog-defaults';
import type { AgentSkillCatalogEntry, SkillLlmSettings } from '@/lib/agent-skills-catalog';

export type SkillCatalogDocInput = {
  id: string;
  label: string;
  description: string;
  color: string;
  icon: string;
  kind: 'capability' | 'profile';
  category?: string;
  tags?: string[];
  defaultPriority: number;
  config: {
    prompt_extension: string;
    active_tools: string[];
    llm_settings?: SkillLlmSettings;
  };
  catalogEnabled?: boolean;
  sortOrder?: number;
};

function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(
    raw
      .map((t) => (typeof t === 'string' ? t.trim().toLowerCase().slice(0, 40) : ''))
      .filter(Boolean),
  )].slice(0, 20);
}

function docToEntry(doc: {
  skillId: string;
  label?: string;
  description?: string;
  color?: string;
  icon?: string;
  kind?: string;
  category?: string;
  tags?: string[];
  defaultPriority?: number;
  config?: {
    prompt_extension?: string;
    active_tools?: string[];
    llm_settings?: SkillLlmSettings;
  };
  catalogEnabled?: boolean;
}): AgentSkillCatalogEntry {
  return {
    id: doc.skillId,
    label: String(doc.label || doc.skillId),
    description: String(doc.description || ''),
    color: String(doc.color || '#94a3b8'),
    icon: String(doc.icon || '✨'),
    kind: doc.kind === 'profile' ? 'profile' : 'capability',
    category: String(doc.category || 'general').trim() || 'general',
    tags: normalizeTags(doc.tags),
    defaultPriority: typeof doc.defaultPriority === 'number' ? doc.defaultPriority : 60,
    catalogEnabled: doc.catalogEnabled !== false,
    config: {
      prompt_extension: String(doc.config?.prompt_extension || ''),
      active_tools: Array.isArray(doc.config?.active_tools)
        ? doc.config!.active_tools.filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
        : [],
      ...(doc.config?.llm_settings && typeof doc.config.llm_settings === 'object'
        ? { llm_settings: { ...doc.config.llm_settings } }
        : {}),
    },
  };
}

function seedDocFromDefault(s: AgentSkillCatalogEntry, i: number, updatedBy?: string) {
  return {
    skillId: s.id,
    label: s.label,
    description: s.description,
    color: s.color,
    icon: s.icon,
    kind: s.kind,
    category: s.category || 'general',
    tags: normalizeTags(s.tags),
    defaultPriority: s.defaultPriority,
    config: {
      prompt_extension: s.config.prompt_extension,
      active_tools: [...s.config.active_tools],
      ...(s.config.llm_settings ? { llm_settings: { ...s.config.llm_settings } } : {}),
    },
    catalogEnabled: true,
    sortOrder: i,
    ...(updatedBy ? { updatedBy } : {}),
  };
}

/** Inserta skills de la semilla que aún no existen (no borra custom). */
export async function syncMissingSkillsFromDefaults(updatedBy?: string): Promise<number> {
  await connectDB();
  const existing = await SkillCatalog.find({}, { skillId: 1 }).lean();
  const have = new Set(existing.map((d) => String((d as { skillId?: string }).skillId || '')));
  const missing = DEFAULT_AGENT_SKILLS_CATALOG
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => !have.has(s.id));
  if (missing.length === 0) return 0;
  await SkillCatalog.insertMany(
    missing.map(({ s, i }) => seedDocFromDefault(s, i, updatedBy)),
  );
  return missing.length;
}

/** Rellena category/tags en docs existentes de la semilla sin tocar prompt/tools. */
async function syncCatalogMetaFromDefaults(): Promise<void> {
  await connectDB();
  for (const s of DEFAULT_AGENT_SKILLS_CATALOG) {
    await SkillCatalog.updateOne(
      {
        skillId: s.id,
        $or: [
          { category: { $exists: false } },
          { category: null },
          { category: '' },
          { tags: { $exists: false } },
          { tags: { $size: 0 } },
        ],
      },
      {
        $set: {
          category: s.category || 'general',
          tags: normalizeTags(s.tags),
        },
      },
    );
  }
}

export async function ensureSkillCatalogSeeded(): Promise<void> {
  await connectDB();
  const n = await SkillCatalog.countDocuments();
  if (n === 0) {
    await SkillCatalog.insertMany(
      DEFAULT_AGENT_SKILLS_CATALOG.map((s, i) => seedDocFromDefault(s, i)),
    );
    return;
  }
  await syncMissingSkillsFromDefaults();
  await syncCatalogMetaFromDefaults();
}

export async function listSkillCatalog(opts?: {
  includeDisabled?: boolean;
  kind?: 'capability' | 'profile';
  category?: string;
}): Promise<AgentSkillCatalogEntry[]> {
  await ensureSkillCatalogSeeded();
  const filter: Record<string, unknown> = {};
  if (!opts?.includeDisabled) filter.catalogEnabled = { $ne: false };
  if (opts?.kind) filter.kind = opts.kind;
  if (opts?.category?.trim()) filter.category = opts.category.trim();

  const docs = await SkillCatalog.find(filter).sort({ kind: 1, category: 1, sortOrder: 1, defaultPriority: 1 }).lean();
  return docs.map((d) => docToEntry(d as Parameters<typeof docToEntry>[0]));
}

export async function getSkillCatalogById(skillId: string): Promise<AgentSkillCatalogEntry | null> {
  await ensureSkillCatalogSeeded();
  const doc = await SkillCatalog.findOne({ skillId: skillId.trim() }).lean();
  if (!doc) return null;
  return docToEntry(doc as Parameters<typeof docToEntry>[0]);
}

function normalizeSkillId(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '_').slice(0, 64);
}

function sanitizeInput(input: SkillCatalogDocInput): SkillCatalogDocInput {
  const id = normalizeSkillId(input.id);
  if (!/^[a-z][a-z0-9_]{1,63}$/.test(id)) {
    throw new Error('ID inválido: usa snake_case (ej. sales_closer).');
  }
  const tools = (input.config.active_tools || [])
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 50);
  const temp = input.config.llm_settings?.temperature;
  const maxTok = input.config.llm_settings?.maxOutputTokens;
  return {
    id,
    label: input.label.trim().slice(0, 120),
    description: input.description.trim().slice(0, 500),
    color: input.color.trim().slice(0, 32) || '#94a3b8',
    icon: input.icon.trim().slice(0, 8) || '✨',
    kind: input.kind === 'profile' ? 'profile' : 'capability',
    category: (input.category || 'general').trim().toLowerCase().slice(0, 40) || 'general',
    tags: normalizeTags(input.tags),
    defaultPriority: Math.max(0, Math.min(1000, Math.floor(input.defaultPriority ?? 60))),
    catalogEnabled: input.catalogEnabled !== false,
    sortOrder: typeof input.sortOrder === 'number' ? input.sortOrder : 0,
    config: {
      prompt_extension: input.config.prompt_extension.trim().slice(0, 6000),
      active_tools: tools,
      ...(typeof temp === 'number'
        ? { llm_settings: { temperature: Math.max(0, Math.min(2, temp)) } }
        : typeof maxTok === 'number'
          ? { llm_settings: { maxOutputTokens: Math.max(1, Math.min(32768, Math.floor(maxTok))) } }
          : input.config.llm_settings
            ? { llm_settings: input.config.llm_settings }
            : {}),
    },
  };
}

export async function createSkillCatalogEntry(
  input: SkillCatalogDocInput,
  updatedBy?: string,
): Promise<AgentSkillCatalogEntry> {
  await connectDB();
  const data = sanitizeInput(input);
  const exists = await SkillCatalog.findOne({ skillId: data.id }).lean();
  if (exists) throw new Error(`Ya existe una skill con id "${data.id}".`);

  const doc = await SkillCatalog.create({
    skillId: data.id,
    label: data.label,
    description: data.description,
    color: data.color,
    icon: data.icon,
    kind: data.kind,
    category: data.category || 'general',
    tags: data.tags || [],
    defaultPriority: data.defaultPriority,
    config: data.config,
    catalogEnabled: data.catalogEnabled !== false,
    sortOrder: data.sortOrder ?? 0,
    updatedBy: updatedBy || null,
  });
  return docToEntry(doc.toObject());
}

export async function updateSkillCatalogEntry(
  skillId: string,
  patch: Partial<SkillCatalogDocInput>,
  updatedBy?: string,
): Promise<AgentSkillCatalogEntry | null> {
  await connectDB();
  const id = normalizeSkillId(skillId);
  const existing = await SkillCatalog.findOne({ skillId: id });
  if (!existing) return null;

  if (patch.label !== undefined) existing.label = patch.label.trim().slice(0, 120);
  if (patch.description !== undefined) existing.description = patch.description.trim().slice(0, 500);
  if (patch.color !== undefined) existing.color = patch.color.trim().slice(0, 32);
  if (patch.icon !== undefined) existing.icon = patch.icon.trim().slice(0, 8);
  if (patch.kind !== undefined) existing.kind = patch.kind === 'profile' ? 'profile' : 'capability';
  if (patch.category !== undefined) {
    existing.category = patch.category.trim().toLowerCase().slice(0, 40) || 'general';
  }
  if (patch.tags !== undefined) existing.tags = normalizeTags(patch.tags);
  if (patch.defaultPriority !== undefined) {
    existing.defaultPriority = Math.max(0, Math.min(1000, Math.floor(patch.defaultPriority)));
  }
  if (patch.catalogEnabled !== undefined) existing.catalogEnabled = patch.catalogEnabled !== false;
  if (patch.sortOrder !== undefined) existing.sortOrder = patch.sortOrder;
  if (patch.config) {
    const cfg = existing.config || { prompt_extension: '', active_tools: [] };
    if (patch.config.prompt_extension !== undefined) {
      cfg.prompt_extension = patch.config.prompt_extension.trim().slice(0, 6000);
    }
    if (patch.config.active_tools !== undefined) {
      cfg.active_tools = patch.config.active_tools.map((t) => t.trim()).filter(Boolean).slice(0, 50);
    }
    if (patch.config.llm_settings !== undefined) {
      cfg.llm_settings = patch.config.llm_settings;
    }
    existing.config = cfg;
    existing.markModified('config');
  }
  if (updatedBy) existing.updatedBy = updatedBy;
  await existing.save();
  return docToEntry(existing.toObject());
}

export async function deleteSkillCatalogEntry(skillId: string): Promise<boolean> {
  await connectDB();
  const res = await SkillCatalog.deleteOne({ skillId: normalizeSkillId(skillId) });
  return res.deletedCount > 0;
}

export async function reseedSkillCatalogFromDefaults(updatedBy?: string): Promise<number> {
  await connectDB();
  await SkillCatalog.deleteMany({});
  const docs = DEFAULT_AGENT_SKILLS_CATALOG.map((s, i) => seedDocFromDefault(s, i, updatedBy));
  const inserted = await SkillCatalog.insertMany(docs);
  return inserted.length;
}
