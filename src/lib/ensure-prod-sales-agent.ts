/**
 * Crea/actualiza el gemelo de ventas del Taller: misma hoja, HubSpot y webhooks,
 * prompt y atajos comerciales. No toca el agente de taller de producto.
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
import { LAB_AGENT_NAME, LAB_WIDGET_NAME, PROD_AGENT_ID, PROD_WIDGET_ID } from '@/lib/ensure-prod-sales-and-lab';
import {
  hasSheetsTool,
  mergeHubspotToolIds,
  mergeSalesSkillIds,
  PROD_SALES_NAME,
  PROD_SALES_SHORTCUTS,
  PROD_SALES_SUBTITLE,
  PROD_SALES_SYSTEM_PROMPT,
  PROD_SALES_WELCOME,
  PROD_SALES_WIDGET_NAME,
} from '@/lib/prod-sales-identity';

const SALES_CLOSER_NAME = 'Closer de Ventas';

function cloneAgentFields(src: Record<string, unknown>, patch: Record<string, unknown>) {
  const skip = new Set(['_id', 'id', 'createdAt', 'updatedAt', '__v']);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(src)) {
    if (skip.has(k)) continue;
    out[k] = v;
  }
  return { ...out, ...patch };
}

export async function ensureProdSalesAgent(options?: {
  generatedJsonPath?: string;
}): Promise<{
  ownerUserId: string;
  sales: { widgetId: string; agentId: string; hubId: string | null; previewPath: string };
  source: 'lab' | 'prod';
  created: boolean;
  hasSheets: boolean;
}> {
  await connectDB();

  const prodAgent = await ClientAgent.findById(PROD_AGENT_ID);
  const prodWidget = await Widget.findById(PROD_WIDGET_ID);
  if (!prodAgent || !prodWidget) {
    throw new Error('No está el Taller de Limarle (preview 6a03a54c / 69d5084c).');
  }
  const ownerUserId = String(prodAgent.userId);
  if (!ownerUserId) throw new Error('El Taller no tiene dueño.');

  const labAgent = await ClientAgent.findOne({ name: LAB_AGENT_NAME, type: 'agent' });
  const sourceAgent = labAgent || prodAgent;
  const source: 'lab' | 'prod' = labAgent ? 'lab' : 'prod';

  const sourceWidget =
    (labAgent
      ? await Widget.findOne({ name: LAB_WIDGET_NAME })
      : null) || prodWidget;

  let created = false;
  let salesAgent = await ClientAgent.findOne({ name: PROD_SALES_NAME, type: 'agent' });

  if (!salesAgent) {
    salesAgent = await ClientAgent.create(
      cloneAgentFields(sourceAgent.toObject() as Record<string, unknown>, {
        userId: ownerUserId,
        name: PROD_SALES_NAME,
        description: 'Asesor comercial: hoja Sheets, HubSpot y los mismos webhooks del Taller.',
        systemPrompt: PROD_SALES_SYSTEM_PROMPT,
        agentHubId: null,
        widgetPublicToken: null,
        syncStatus: 'pending',
        isPlatform: false,
        parentAgentId: null,
        type: 'agent',
        subAgentIds: [],
        hubspotAutoCaptureContacts: true,
        skills: mergeSalesSkillIds(sourceAgent.skills as string[] | undefined),
        enabledMcpToolIds: mergeHubspotToolIds(sourceAgent.enabledMcpToolIds as string[] | undefined),
      }),
    );
    created = true;

    const closerId = Array.isArray(sourceAgent.subAgentIds) ? String(sourceAgent.subAgentIds[0] || '') : '';
    if (closerId) {
      const closerSrc = await ClientAgent.findById(closerId);
      if (closerSrc) {
        const salesCloser = await ClientAgent.create(
          cloneAgentFields(closerSrc.toObject() as Record<string, unknown>, {
            userId: ownerUserId,
            name: SALES_CLOSER_NAME,
            description: 'Sub-agente de cierre comercial. Usa CRM/webhooks del padre.',
            agentHubId: null,
            widgetPublicToken: null,
            syncStatus: 'pending',
            isPlatform: false,
            parentAgentId: String(salesAgent._id),
            type: 'sub-agent',
            hubspotAutoCaptureContacts: true,
          }),
        );
        salesAgent.subAgentIds = [String(salesCloser._id)];
        await salesAgent.save();
        if (canAttemptHubSync()) {
          await ensureClientAgentHubSynced(String(salesCloser._id), ownerUserId);
        }
      }
    }
  } else {
    salesAgent.userId = ownerUserId;
    salesAgent.description = 'Asesor comercial: hoja Sheets, HubSpot y los mismos webhooks del Taller.';
    salesAgent.systemPrompt = PROD_SALES_SYSTEM_PROMPT;
    salesAgent.hubspotAutoCaptureContacts = true;
    salesAgent.skills = mergeSalesSkillIds(salesAgent.skills as string[] | undefined);
    salesAgent.enabledMcpToolIds = mergeHubspotToolIds(salesAgent.enabledMcpToolIds as string[] | undefined);
    if (!hasSheetsTool(salesAgent.tools as Array<{ toolId?: string }>)) {
      salesAgent.tools = sourceAgent.tools;
    }
    salesAgent.syncStatus = 'pending';
    await salesAgent.save();
    const subIds = Array.isArray(salesAgent.subAgentIds) ? salesAgent.subAgentIds.map(String) : [];
    if (subIds.length) {
      await ClientAgent.updateMany({ _id: { $in: subIds } }, { $set: { userId: ownerUserId } });
    }
  }

  let salesWidget = await Widget.findOne({ name: PROD_SALES_WIDGET_NAME });
  if (!salesWidget) {
    salesWidget = await Widget.create(
      cloneAgentFields(sourceWidget.toObject() as Record<string, unknown>, {
        userId: ownerUserId,
        name: PROD_SALES_WIDGET_NAME,
        agentId: String(salesAgent._id),
        afhubToken: `wt_${randomBytes(24).toString('hex')}`,
        afhubWidgetId: null,
        title: PROD_SALES_WIDGET_NAME,
        subtitle: PROD_SALES_SUBTITLE,
        welcome: PROD_SALES_WELCOME,
        fabHint: 'Asesor de ventas',
        shortcuts: PROD_SALES_SHORTCUTS,
        autoOpen: false,
      }),
    );
    created = true;
  } else {
    salesWidget.userId = ownerUserId;
    salesWidget.agentId = String(salesAgent._id);
    salesWidget.subtitle = PROD_SALES_SUBTITLE;
    salesWidget.welcome = PROD_SALES_WELCOME;
    salesWidget.fabHint = 'Asesor de ventas';
    salesWidget.shortcuts = PROD_SALES_SHORTCUTS as typeof salesWidget.shortcuts;
    await salesWidget.save();
  }

  let hubId: string | null =
    typeof salesAgent.agentHubId === 'string' && salesAgent.agentHubId.trim()
      ? salesAgent.agentHubId.trim()
      : null;

  if (canAttemptHubSync()) {
    hubId = (await ensureClientAgentHubSynced(String(salesAgent._id), ownerUserId)) || hubId;
    const fresh = await ClientAgent.findById(salesAgent._id);
    if (fresh) await syncHubCatalogFromLandingAgentDoc(fresh).catch(() => {});
  }

  const hasSheets = hasSheetsTool(salesAgent.tools as Array<{ toolId?: string }>);
  const report = {
    ownerUserId,
    sales: {
      widgetId: String(salesWidget._id),
      agentId: String(salesAgent._id),
      hubId,
      previewPath: `/dashboard/widget-preview?id=${String(salesWidget._id)}`,
    },
    source,
    created,
    hasSheets,
  };

  const jsonPath =
    options?.generatedJsonPath || resolve(process.cwd(), 'scripts/sales-widget.generated.json');
  writeFileSync(
    jsonPath,
    `${JSON.stringify(
      {
        widgetId: report.sales.widgetId,
        agentId: report.sales.agentId,
        hubId: report.sales.hubId,
        previewPath: report.sales.previewPath,
        ownerUserId: report.ownerUserId,
        source: report.source,
        hasSheets: report.hasSheets,
      },
      null,
      2,
    )}\n`,
  );

  return report;
}
