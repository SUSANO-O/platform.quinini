/**
 * Preview 6a03a54c = taller de servicio (producto).
 * Lab en perfil admin = fixture 300k / pruebas pesadas.
 */
import { randomBytes } from 'crypto';
import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { connectDB } from '@/lib/db/connection';
import { ClientAgent, Widget } from '@/lib/db/models';
import { stripFixtureRepuestosSheets } from '@/lib/agent-sheets';
import {
  canAttemptHubSync,
  ensureClientAgentHubSynced,
  syncHubCatalogFromLandingAgentDoc,
} from '@/lib/aibackhub-sync';
import { resolveAdminOwnerId } from '@/lib/ensure-landing-assist-agents';
import {
  PROD_TALLER_NAME,
  PROD_TALLER_SHORTCUTS,
  PROD_TALLER_SUBTITLE,
  PROD_TALLER_SYSTEM_PROMPT,
  PROD_TALLER_WELCOME,
  PROD_TALLER_WIDGET_NAME,
  stripSalesFaqs,
  stripSalesSkills,
  stripSalesSkillsConfig,
} from '@/lib/prod-taller-identity';

export const PROD_WIDGET_ID = '6a03a54c4f69fa7fa9027170';
export const PROD_AGENT_ID = '69d5084c78e0af3d5536fe95';
export const LAB_AGENT_NAME = 'Lab Taller (fixture)';
export const LAB_WIDGET_NAME = 'Lab Taller (fixture)';
export const LAB_CLOSER_NAME = 'Lab Closer (fixture)';

const PROD_FACTS_RULE = {
  id: 'prod-no-invented-stock',
  title: 'No inventar inventario',
  enabled: true,
  priority: 200,
  category: 'general',
  tone: 'profesional',
  shortAnswers: true,
  complaintPolicy: '',
  unknownAnswerPolicy:
    'Si el dato no está en RAG ni en una herramienta, di que no lo tienes. No inventes stock, precios ni citas.',
  interpretedRule:
    'Nunca cites SKU, sedes, pasillos ni existencias que no hayan salido de una herramienta o del RAG de este agente.',
  notes: 'Producto vs laboratorio',
};

function cloneAgentFields(src: Record<string, unknown>, patch: Record<string, unknown>) {
  const skip = new Set(['_id', 'id', 'createdAt', 'updatedAt', '__v']);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(src)) {
    if (skip.has(k)) continue;
    out[k] = v;
  }
  return { ...out, ...patch };
}

export async function ensureProdSalesAndLabTaller(options?: {
  adminUserId?: string;
  generatedJsonPath?: string;
}): Promise<{
  adminUserId: string;
  prod: { widgetId: string; agentId: string; name: string };
  lab: { widgetId: string; agentId: string; hubId: string | null; previewPath: string };
  created: boolean;
}> {
  await connectDB();
  const adminUserId = await resolveAdminOwnerId(options?.adminUserId);
  if (!adminUserId) throw new Error('No hay usuario admin.');

  const prodWidget = await Widget.findById(PROD_WIDGET_ID);
  const prodAgent = await ClientAgent.findById(PROD_AGENT_ID);
  if (!prodWidget || !prodAgent) {
    throw new Error('No está el widget/agente de preview 6a03a54c / 69d5084c.');
  }

  let labAgent = await ClientAgent.findOne({ userId: adminUserId, name: LAB_AGENT_NAME, type: 'agent' });
  let created = false;

  if (!labAgent) {
    const src = prodAgent.toObject() as Record<string, unknown>;
    labAgent = await ClientAgent.create(
      cloneAgentFields(src, {
        userId: adminUserId,
        name: LAB_AGENT_NAME,
        description:
          'Banco de pruebas pesadas (hoja 300k, memoria, RAG, MCP, cierre). No es producto. No publicar.',
        agentHubId: null,
        widgetPublicToken: null,
        syncStatus: 'pending',
        isPlatform: false,
        parentAgentId: null,
        type: 'agent',
        subAgentIds: [],
      }),
    );
    created = true;

    const closerId = Array.isArray(prodAgent.subAgentIds) ? String(prodAgent.subAgentIds[0] || '') : '';
    if (closerId) {
      const closerSrc = await ClientAgent.findById(closerId);
      if (closerSrc) {
        const labCloser = await ClientAgent.create(
          cloneAgentFields(closerSrc.toObject() as Record<string, unknown>, {
            userId: adminUserId,
            name: LAB_CLOSER_NAME,
            description: 'Sub-agente de laboratorio. No es producto.',
            agentHubId: null,
            widgetPublicToken: null,
            syncStatus: 'pending',
            isPlatform: false,
            parentAgentId: String(labAgent._id),
            type: 'sub-agent',
          }),
        );
        labAgent.subAgentIds = [String(labCloser._id)];
        await labAgent.save();
        if (canAttemptHubSync()) {
          await ensureClientAgentHubSynced(String(labCloser._id), adminUserId);
        }
      }
    }
  }

  let labWidget = await Widget.findOne({ userId: adminUserId, name: LAB_WIDGET_NAME });
  if (!labWidget) {
    const wsrc = prodWidget.toObject() as Record<string, unknown>;
    labWidget = await Widget.create(
      cloneAgentFields(wsrc, {
        userId: adminUserId,
        name: LAB_WIDGET_NAME,
        agentId: String(labAgent._id),
        afhubToken: `wt_${randomBytes(24).toString('hex')}`,
        afhubWidgetId: null,
        title: 'Lab Taller',
        subtitle: 'Fixture de pruebas',
        welcome:
          'Laboratorio interno. Puedo consultar la hoja demo de repuestos, memoria y tools. Esto no es un agente de cliente.',
        fabHint: 'Lab Taller',
        autoOpen: false,
      }),
    );
    created = true;
  } else if (String(labWidget.agentId) !== String(labAgent._id)) {
    labWidget.agentId = String(labAgent._id);
    await labWidget.save();
  }

  const strippedTools = stripFixtureRepuestosSheets(
    (Array.isArray(prodAgent.tools) ? prodAgent.tools : []) as Array<{
      toolId: string;
      config?: { sheets?: Array<{ url?: string }> };
    }>,
  );
  const rules = Array.isArray(prodAgent.behaviorRules) ? [...prodAgent.behaviorRules] : [];
  if (!rules.some((r) => r && typeof r === 'object' && (r as { id?: string }).id === PROD_FACTS_RULE.id)) {
    rules.push(PROD_FACTS_RULE);
  }

  prodAgent.name = PROD_TALLER_NAME;
  prodAgent.description = 'Taller de servicio y citas. No vende vehículos.';
  prodAgent.systemPrompt = PROD_TALLER_SYSTEM_PROMPT;
  prodAgent.tools = strippedTools as typeof prodAgent.tools;
  prodAgent.behaviorRules = rules.filter((r) => {
    const text = JSON.stringify(r ?? {});
    return !/cerrador de ventas|financi|test drive|embudo comercial/i.test(text);
  }) as typeof prodAgent.behaviorRules;
  prodAgent.skills = stripSalesSkills(prodAgent.skills);
  prodAgent.skillsConfig = stripSalesSkillsConfig(
    (prodAgent.skillsConfig ?? []) as Array<{ id?: string; skillId?: string }>,
  ) as typeof prodAgent.skillsConfig;
  prodAgent.agentFaqs = stripSalesFaqs(
    (prodAgent.agentFaqs ?? []) as Array<{ question?: string }>,
  ) as typeof prodAgent.agentFaqs;
  prodAgent.ragEnabled = false;
  prodAgent.subAgentIds = [];
  prodAgent.syncStatus = 'pending';
  await prodAgent.save();

  prodWidget.name = PROD_TALLER_WIDGET_NAME;
  prodWidget.subtitle = PROD_TALLER_SUBTITLE;
  prodWidget.welcome = PROD_TALLER_WELCOME;
  prodWidget.fabHint = 'Asesor de taller';
  prodWidget.shortcuts = PROD_TALLER_SHORTCUTS;
  await prodWidget.save();

  let labHubId: string | null =
    typeof labAgent.agentHubId === 'string' && labAgent.agentHubId.trim() ? labAgent.agentHubId.trim() : null;

  if (canAttemptHubSync()) {
    const prodFresh = await ClientAgent.findById(PROD_AGENT_ID);
    if (prodFresh) {
      await syncHubCatalogFromLandingAgentDoc(prodFresh).catch(() => {});
    }
    labHubId = (await ensureClientAgentHubSynced(String(labAgent._id), adminUserId)) || labHubId;
    const labFresh = await ClientAgent.findById(labAgent._id);
    if (labFresh) {
      await syncHubCatalogFromLandingAgentDoc(labFresh).catch(() => {});
    }
  }

  const report = {
    adminUserId,
    prod: {
      widgetId: PROD_WIDGET_ID,
      agentId: PROD_AGENT_ID,
      name: PROD_TALLER_NAME,
    },
    lab: {
      widgetId: String(labWidget._id),
      agentId: String(labAgent._id),
      hubId: labHubId,
      previewPath: `/dashboard/widget-preview?id=${String(labWidget._id)}`,
    },
    created,
  };

  const jsonPath =
    options?.generatedJsonPath ||
    resolve(process.cwd(), 'scripts/lab-widget.generated.json');
  writeFileSync(
    jsonPath,
    `${JSON.stringify(
      {
        widgetId: report.lab.widgetId,
        agentId: report.lab.agentId,
        hubId: report.lab.hubId,
        previewPath: report.lab.previewPath,
        prodWidgetId: PROD_WIDGET_ID,
        prodAgentId: PROD_AGENT_ID,
      },
      null,
      2,
    )}\n`,
  );

  return report;
}
