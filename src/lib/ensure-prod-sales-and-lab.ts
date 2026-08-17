/**
 * Preview 6a03a54c = departamento de repuestos (producto).
 * Lab en perfil admin = fixture 300k / pruebas pesadas.
 */
import { randomBytes } from 'crypto';
import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { connectDB } from '@/lib/db/connection';
import { ClientAgent, Widget } from '@/lib/db/models';
import {
  canAttemptHubSync,
  ensureClientAgentHubSynced,
  syncHubCatalogFromLandingAgentDoc,
} from '@/lib/aibackhub-sync';
import { resolveAdminOwnerId } from '@/lib/ensure-landing-assist-agents';
import {
  ensureProdTallerRepuestos,
  PROD_AGENT_ID,
  PROD_WIDGET_ID,
} from '@/lib/ensure-prod-taller-repuestos';
import { PROD_TALLER_NAME } from '@/lib/prod-taller-identity';

export { PROD_AGENT_ID, PROD_WIDGET_ID };
export const LAB_AGENT_NAME = 'Lab Taller (fixture)';
export const LAB_WIDGET_NAME = 'Lab Taller (fixture)';
export const LAB_CLOSER_NAME = 'Lab Closer (fixture)';

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

  // Producto: departamento de repuestos (prompt, subtareas, crons, hoja inventarios).
  await ensureProdTallerRepuestos();

  let labHubId: string | null =
    typeof labAgent.agentHubId === 'string' && labAgent.agentHubId.trim() ? labAgent.agentHubId.trim() : null;

  if (canAttemptHubSync()) {
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
