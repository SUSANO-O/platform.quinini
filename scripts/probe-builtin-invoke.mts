/**
 * Prueba tools por invoke-tool (MCP) + ejecución directa farm.
 * Clasifica: OK | FAIL | NEEDS_OAUTH | UNKNOWN_TOOL
 */
import { connectDB } from '../src/lib/db/connection.ts';
import { ClientAgent } from '../src/lib/db/models.ts';
import mongoose from 'mongoose';
import { readFileSync } from 'fs';

function loadKey(): string {
  try {
    const env = readFileSync('/Users/harddis/agentes/matias-backend/.env', 'utf8');
    const m = env.match(/^API_KEY=(.+)$/m);
    if (m?.[1]) return m[1].trim();
  } catch {
    /* ignore */
  }
  return process.env.AIBACKHUB_API_KEY || process.env.API_KEY || '';
}

type Row = { id: string; status: string; detail: string };

async function invoke(
  backend: string,
  apiKey: string,
  tenantId: string,
  agentId: string,
  toolId: string,
  input: Record<string, unknown>,
) {
  const res = await fetch(`${backend}/api/mcp/invoke-tool`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'x-tenant-id': tenantId,
    },
    body: JSON.stringify({ agentId, toolId, input }),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, json };
}

function classify(status: number, json: Record<string, unknown>): { status: string; detail: string } {
  const errObj = json.error;
  const msg = String(
    (typeof errObj === 'object' && errObj && 'message' in errObj
      ? (errObj as { message: unknown }).message
      : null) ||
      json.message ||
      json.error ||
      '',
  );
  const blob = `${msg} ${JSON.stringify(json)}`.toLowerCase();
  if (status >= 200 && status < 300 && json.success !== false) {
    const data = json.data ?? json.result ?? json;
    return { status: 'OK', detail: JSON.stringify(data).slice(0, 160) };
  }
  if (
    /oauth|token|credencial|no configur|not connected|unauthorized|401|403|missing.*(key|token|credential)|sin (token|credencial)|connect|autoriz/i.test(
      blob,
    )
  ) {
    return { status: 'NEEDS_OAUTH', detail: msg.slice(0, 160) || `HTTP_${status}` };
  }
  if (/desconocida|unknown|not found|404/i.test(blob)) {
    return { status: 'UNKNOWN_TOOL', detail: msg.slice(0, 160) || `HTTP_${status}` };
  }
  return { status: 'FAIL', detail: (msg || `HTTP_${status}`).slice(0, 160) };
}

async function main() {
  await connectDB();
  const agent = await ClientAgent.findOne({ name: 'Asesor de Taller Experto' });
  if (!agent) {
    console.log('NO_AGENT');
    process.exit(1);
  }

  const backend = (process.env.BACKEND_URL || 'http://127.0.0.1:9003').replace(/\/$/, '');
  const apiKey = loadKey();
  const tenantId = String(agent.userId);
  const agentId = String(agent.agentHubId || agent._id);
  const baseTools = (agent.enabledMcpToolIds || []).map(String);

  console.log('AGENT', agent.name, agentId);
  console.log('BASE_TOOLS', baseTools);
  console.log('BACKEND', backend);

  // connections
  const connRes = await fetch(
    `${backend}/api/mcp/connections?agentId=${encodeURIComponent(agentId)}`,
    { headers: { 'x-api-key': apiKey, 'x-tenant-id': tenantId } },
  );
  const connJson = (await connRes.json().catch(() => ({}))) as Record<string, unknown>;
  const connData = connJson.data ?? connJson;
  const connList = Array.isArray(connData)
    ? connData
    : Array.isArray((connData as { connections?: unknown[] }).connections)
      ? (connData as { connections: unknown[] }).connections
      : Array.isArray((connData as { items?: unknown[] }).items)
        ? (connData as { items: unknown[] }).items
        : [];
  console.log('\n=== CONNECTIONS ===');
  for (const c of connList as Array<Record<string, unknown>>) {
    console.log(
      JSON.stringify({
        key: c.integrationKey || c.key,
        syncStatus: c.syncStatus || c.status,
        id: c.id || c._id,
      }),
    );
  }
  if (!connList.length) {
    console.log('(ninguna / shape)', JSON.stringify(connJson).slice(0, 300));
  }

  const mcpCases: Array<{ id: string; input: Record<string, unknown>; oauth?: boolean }> = [
    { id: 'mcp:weather:weather_current', input: { city: 'Madrid' } },
    { id: 'mcp:weather:weather_forecast', input: { city: 'Bogotá', days: 3 } },
    { id: 'mcp:webSearch:web_search', input: { query: 'BotIvA agentes', numResults: 3 } },
    { id: 'mcp:webSearch:web_fetch_page', input: { url: 'https://example.com' } },
    { id: 'mcp:hubspot:hubspot_search_contacts', input: { query: 'test', limit: 3 }, oauth: true },
    { id: 'mcp:gmail:gmail_search_messages', input: { query: 'in:inbox', maxResults: 3 }, oauth: true },
    { id: 'mcp:gmail:gmail_get_profile', input: {}, oauth: true },
    {
      id: 'mcp:googleCalendar:calendar_list_events',
      input: { maxResults: 3 },
      oauth: true,
    },
    { id: 'mcp:slack:slack_list_channels', input: { limit: 5 }, oauth: true },
    { id: 'mcp:googleMaps:maps_geocode', input: { address: 'Madrid, Spain' }, oauth: true },
    { id: 'mcp:mongodb:mongo_list_collections', input: {}, oauth: true },
  ];

  // landing webhook tools del agente
  for (const t of baseTools) {
    if (t.includes('landing') || t.includes('webhook') || t.includes('hubspot')) {
      mcpCases.unshift({
        id: t,
        input: t.includes('hubspot')
          ? { query: 'test', limit: 3 }
          : { path: '/', method: 'GET' },
        oauth: t.includes('hubspot'),
      });
    }
  }

  const rows: Row[] = [];
  console.log('\n=== MCP INVOKE-TOOL ===');
  for (const c of mcpCases) {
    const r = await invoke(backend, apiKey, tenantId, agentId, c.id, c.input);
    let { status, detail } = classify(r.status, r.json);
    if (c.oauth && status === 'FAIL') {
      if (/token|oauth|credencial|connect|autoriz|401|403|missing/i.test(detail)) {
        status = 'NEEDS_OAUTH';
      } else if (/HubSpot|Gmail|Calendar|Slack|Maps|Mongo/i.test(detail + c.id)) {
        status = 'NEEDS_OAUTH';
      }
    }
    rows.push({ id: c.id, status, detail });
    console.log(`${status.padEnd(14)} ${c.id}  ${detail.slice(0, 120)}`);
  }

  // Farm: smoke direct mode (tools internas del agente)
  const farmCases: Array<{ agent: string; data: Record<string, unknown> }> = [
    {
      agent: 'water-quality',
      data: { ph: 7.2, turbidity: 3, temperature: 22, dissolvedOxygen: 7, conductivity: 400 },
    },
    { agent: 'health-monitor', data: { bloodOxygen: 98, heartRate: 72, bodyTemperature: 36.6 } },
    { agent: 'agriculture', data: { location: 'Valencia', message: 'Diagnóstico breve de tomate' } },
    {
      agent: 'tutor',
      data: { studentLevel: 'secundaria', subject: 'matemáticas', topic: 'fracciones' },
    },
    { agent: 'pharma', data: { researchText: 'Resumen breve de ibuprofeno dosis adulto' } },
    {
      agent: 'error-resolution',
      data: { errorDescription: 'ECONNREFUSED 127.0.0.1:5432 al conectar Postgres' },
    },
    { agent: 'cybersecurity', data: { task: 'Clasifica IoC IP 1.2.3.4 de forma breve' } },
    {
      agent: 'geoeconomics',
      data: { analysisType: 'country', country: 'España', query: 'riesgo breve' },
    },
  ];
  console.log('\n=== FARM AGENTS (direct) ===');
  for (const f of farmCases) {
    try {
      const res = await fetch(`${backend}/api/agent-farm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'x-tenant-id': tenantId,
        },
        body: JSON.stringify({ mode: 'direct', agent: f.agent, data: f.data }),
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const text = JSON.stringify(json.data ?? json.error ?? json).slice(0, 140);
      let status = res.status >= 200 && res.status < 300 ? 'OK' : 'FAIL';
      if (status === 'OK' && /error|fail/i.test(text) && !/result|analysis|ok/i.test(text)) {
        status = 'FAIL';
      }
      rows.push({ id: `farm:${f.agent}`, status, detail: text });
      console.log(`${status.padEnd(14)} farm:${f.agent}  ${text}`);
    } catch (e) {
      rows.push({ id: `farm:${f.agent}`, status: 'FAIL', detail: (e as Error).message });
      console.log(`FAIL           farm:${f.agent}  ${(e as Error).message}`);
    }
  }

  console.log('\n=== RESUMEN ===');
  const groups = new Map<string, string[]>();
  for (const r of rows) {
    const g = groups.get(r.status) || [];
    g.push(r.id);
    groups.set(r.status, g);
  }
  for (const [k, v] of groups) {
    console.log(`\n${k} (${v.length})`);
    for (const id of v) console.log(' -', id);
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
