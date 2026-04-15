/**
 * Sincroniza agentes de plataforma que existen solo en AIBackHub hacia ClientAgent (Mongo landing).
 * Sin esto, el Widget Builder y /api/agents no los ven: la landing solo lista su propia colección.
 */

import { connectDB } from '@/lib/db/connection';
import { ClientAgent, User } from '@/lib/db/models';
import {
  fetchHubAgentsList,
  pushClientAgentToHubCatalog,
  type HubCatalogAgent,
} from '@/lib/aibackhub-sync';

function isHubMainPlatformAgent(h: HubCatalogAgent): boolean {
  if (!h.isPlatform) return false;
  if (h.catalogAgentType === 'sub-agent') return false;
  const st = typeof h.status === 'string' ? h.status : '';
  if (st && st !== 'Active') return false;
  const id = typeof h.id === 'string' ? h.id.trim() : '';
  return id.length > 0;
}

/**
 * Para cada agente de plataforma en el catálogo del hub que no tenga fila en landing,
 * crea ClientAgent (userId = primer admin, o fallbackOwnerUserId) y enlaza el hub con landingClientAgentId.
 */
export async function ensureHubPlatformAgentsInLanding(options?: {
  /** Si no hay admin en BD, dueño del ClientAgent importado (p. ej. usuario actual). */
  fallbackOwnerUserId?: string;
}): Promise<void> {
  const hubAgents = await fetchHubAgentsList();
  if (hubAgents.length === 0) return;

  await connectDB();

  const admin = await User.findOne({ role: 'admin' }).sort({ createdAt: 1 }).lean() as {
    _id?: { toString(): string };
  } | null;
  const ownerId =
    admin?._id?.toString() ||
    (options?.fallbackOwnerUserId && /^[a-f0-9]{24}$/i.test(options.fallbackOwnerUserId)
      ? options.fallbackOwnerUserId
      : '');
  if (!ownerId) {
    console.warn(
      '[hub-platform-import] Sin admin ni fallbackOwnerUserId; no se importan agentes de plataforma del hub.',
    );
    return;
  }

  for (const h of hubAgents) {
    if (!isHubMainPlatformAgent(h)) continue;

    const hubSlug = h.id.trim();
    const existing = await ClientAgent.findOne({ agentHubId: hubSlug }).lean();
    if (existing) continue;

    const prompt =
      typeof h.prompt === 'string' && h.prompt.trim() !== ''
        ? h.prompt.trim()
        : 'Eres un asistente de la plataforma MatIAs.';
    const name = typeof h.name === 'string' && h.name.trim() !== '' ? h.name.trim() : hubSlug;

    const doc = await ClientAgent.create({
      userId: ownerId,
      name,
      description: h.description != null ? String(h.description) : '',
      systemPrompt: prompt,
      model: typeof h.model === 'string' && h.model.trim() !== '' ? h.model.trim() : 'gemini-2.5-flash',
      type: 'agent' as const,
      status: 'active' as const,
      tools: [] as { toolId: string; config?: Record<string, string> }[],
      agentHubId: hubSlug,
      isPlatform: true,
      syncStatus: 'synced' as const,
      ragEnabled: Boolean(h.ragEnabled),
      ragSources: Array.isArray(h.ragSources) ? h.ragSources : [],
      widgetPublicToken:
        typeof h.widgetPublicToken === 'string' && h.widgetPublicToken.trim() !== ''
          ? h.widgetPublicToken.trim().slice(0, 512)
          : null,
    });

    void pushClientAgentToHubCatalog({
      agentHubId: hubSlug,
      name: doc.name,
      description: doc.description ?? '',
      systemPrompt: doc.systemPrompt,
      model: doc.model,
      landingClientAgentMongoId: String(doc._id),
      ragEnabled: doc.ragEnabled,
      ragSources: doc.ragSources,
      type: 'agent',
      parentAgentId: null,
      widgetPublicToken: doc.widgetPublicToken ?? null,
      isPlatform: true,
    }).catch(() => {});
  }
}
