/**
 * Prueba tools built-in / MCP del catálogo unificado contra un agente con webhook.
 * Clasifica: OK | FAIL | NEEDS_OAUTH | SKIP
 */
import { connectDB } from '../src/lib/db/connection.ts';
import { ClientAgent } from '../src/lib/db/models.ts';
import mongoose from 'mongoose';

type Row = { id: string; status: string; detail: string; toolsUsed?: string[] };

async function chat(
  backend: string,
  apiKey: string,
  tenantId: string,
  agentId: string,
  message: string,
  enabledToolIds: string[],
  systemPrompt: string,
) {
  const res = await fetch(`${backend}/api/mcp/widget-chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'x-tenant-id': tenantId,
    },
    body: JSON.stringify({
      agentId,
      message,
      history: [],
      model: 'gemini-2.5-flash',
      systemPrompt,
      enabledToolIds,
      replyProvider: 'vertex',
      hubspotAutoCaptureContacts: false,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const data = (json.data && typeof json.data === 'object' ? json.data : json) as Record<
    string,
    unknown
  >;
  return {
    status: res.status,
    reply: String(data.text || data.reply || JSON.stringify(json.error || json)).slice(0, 280),
    toolsUsed: (data.toolsUsed as string[]) || [],
    err: json.error,
  };
}

async function main() {
  await connectDB();
  const agent = await ClientAgent.findOne({
    name: 'Asesor de Taller Experto',
  });
  if (!agent) {
    console.log('NO_AGENT');
    process.exit(1);
  }

  const backend = (process.env.BACKEND_URL || 'http://127.0.0.1:9003').replace(/\/$/, '');
  const apiKey = process.env.AIBACKHUB_API_KEY || '';
  const tenantId = String(agent.userId);
  const agentId = String(agent.agentHubId || agent._id);
  const baseTools = (agent.enabledMcpToolIds || []).map(String);

  // Catálogo unificado
  const catRes = await fetch(`${backend}/api/tools/unified`, {
    headers: { 'x-api-key': apiKey },
  });
  const catJson = (await catRes.json()) as { data?: { catalog?: Array<{ id: string }> } };
  const allIds = (catJson.data?.catalog || []).map((x) => x.id);

  const cases: Array<{
    label: string;
    toolIds: string[];
    prompt: string;
    expectPrefix?: string;
    needsOauth?: boolean;
  }> = [
    {
      label: 'landing_webhook',
      toolIds: baseTools.filter((t) => t.includes('landing') || t.includes('webhook')),
      prompt:
        'Usa la herramienta de webhook del agente ahora mismo para consultar cotizaciones o datos. No inventes: di si la tool respondió.',
      expectPrefix: 'mcp:landing:',
    },
    {
      label: 'weather_current',
      toolIds: ['mcp:weather:weather_current'],
      prompt: 'Usa la tool weather_current para el clima actual en Bogotá. Reporta temperatura.',
      expectPrefix: 'mcp:weather:',
    },
    {
      label: 'web_search',
      toolIds: ['mcp:webSearch:web_search'],
      prompt: 'Usa web_search para buscar "BotIvA agentes" y resume 1 resultado.',
      expectPrefix: 'mcp:webSearch:',
    },
    {
      label: 'hubspot_search',
      toolIds: [
        'mcp:hubspot:hubspot_search_contacts',
        'mcp:hubspot:hubspot_create_contact',
      ],
      prompt: 'Usa hubspot_search_contacts con query test@example.com. Di el resultado crudo.',
      expectPrefix: 'mcp:hubspot:',
      needsOauth: true,
    },
    {
      label: 'gmail_search',
      toolIds: ['mcp:gmail:gmail_search_messages'],
      prompt: 'Usa gmail_search_messages con query newer_than:1d. Di si funcionó.',
      expectPrefix: 'mcp:gmail:',
      needsOauth: true,
    },
    {
      label: 'calendar_list',
      toolIds: ['mcp:googleCalendar:calendar_list_events'],
      prompt: 'Usa calendar_list_events y di si hay eventos.',
      expectPrefix: 'mcp:googleCalendar:',
      needsOauth: true,
    },
    {
      label: 'slack_list',
      toolIds: ['mcp:slack:slack_list_channels'],
      prompt: 'Usa slack_list_channels y lista canales.',
      expectPrefix: 'mcp:slack:',
      needsOauth: true,
    },
  ];

  const rows: Row[] = [];
  console.log('AGENT', agent.name, agentId, 'baseTools', baseTools.length);
  console.log('CATALOG_SIZE', allIds.length);

  for (const c of cases) {
    const toolIds = c.toolIds.length ? c.toolIds : baseTools;
    if (!toolIds.length && c.label === 'landing_webhook') {
      // fallback: all base
      toolIds.push(...baseTools);
    }
    // Asegurar que las tools pedidas estén en el allowlist del request
    const enabled = [...new Set([...baseTools, ...toolIds])];
    console.log('\n>>', c.label, 'tools', toolIds);
    try {
      const r = await chat(
        backend,
        apiKey,
        tenantId,
        agentId,
        c.prompt,
        enabled,
        'Eres un agente de prueba. DEBES invocar la herramienta pedida. No inventes datos de tools.',
      );
      const used = r.toolsUsed;
      const hit = c.expectPrefix
        ? used.some((t) => t.startsWith(c.expectPrefix!))
        : used.length > 0;
      let status = 'FAIL';
      let detail = r.reply;
      if (r.status !== 200) {
        status = String(r.err && typeof r.err === 'object' && 'message' in (r.err as object)
          ? (r.err as { message: string }).message
          : `HTTP_${r.status}`);
        if (c.needsOauth || /NO_MCP|token|oauth|credencial|no configur/i.test(status + detail)) {
          status = 'NEEDS_OAUTH_OR_CONFIG';
        }
      } else if (hit) {
        status = 'OK';
        detail = `toolsUsed=${used.join(',')}`;
      } else if (c.needsOauth && /conect|oauth|token|autoriz|credencial|no (puedo|puedes)|sin acceso/i.test(r.reply)) {
        status = 'NEEDS_OAUTH_OR_CONFIG';
      } else if (used.length) {
        status = 'OTHER_TOOL';
        detail = `used=${used.join(',')} | ${r.reply}`;
      } else {
        status = 'NO_TOOL_CALL';
      }
      rows.push({ id: c.label, status, detail: detail.slice(0, 200), toolsUsed: used });
      console.log(status, detail.slice(0, 160));
    } catch (e) {
      rows.push({ id: c.label, status: 'ERROR', detail: (e as Error).message });
      console.log('ERROR', (e as Error).message);
    }
  }

  console.log('\n=== RESUMEN ===');
  for (const r of rows) {
    console.log(`${r.status.padEnd(24)} ${r.id}  ${r.detail.slice(0, 100)}`);
  }

  // Builtin farm agents (no MCP) — solo listado
  const builtins = allIds.filter((id) => !id.startsWith('mcp:') && !id.startsWith('std:'));
  console.log('\nBUILTIN_FARM_TOOLS', builtins.length, builtins.slice(0, 12), '...');

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
