/**
 * Sync nocturno Google Sheets → Mongo (3 AM America/Bogota).
 * Solo entradas con nightlySyncEnabled y dueños con plan Plus+.
 */

import {
  buildGvizCsvUrl,
  extractGid,
  extractSpreadsheetId,
  extractAgentSheets,
  parseSimpleCsv,
  sheetDataRowsToA1Range,
  type SheetEntry,
} from '@/lib/agent-sheets';
import {
  sheetNightlySyncEnabled,
  sheetSyncBillingActive,
  sheetSyncChargeUsd,
  effectiveProductPlan,
} from '@/lib/plan-catalog';
import { connectDB } from '@/lib/db/connection';
import { ClientAgent, SheetSnapshot, SheetSyncUsage, Subscription } from '@/lib/db/models';

const SYNC_CHUNK_ROWS = 200;
const MAX_SYNC_ROWS = 20_000;
const FETCH_TIMEOUT_MS = 25_000;

export type SheetSyncRunResult = {
  ok: boolean;
  dryRun: boolean;
  agentsScanned: number;
  sheetsSynced: number;
  sheetsSkipped: number;
  sheetsFailed: number;
  totalBytes: number;
  errors: Array<{ agentId: string; sheetId: string; error: string }>;
};

async function fetchGvizChunk(
  spreadsheetId: string,
  gid: string,
  sheetName: string | undefined,
  range: string,
  includeHeader: boolean,
): Promise<{ header: string[]; rows: string[][] } | null> {
  const url = buildGvizCsvUrl({ spreadsheetId, gid, sheetName, range });
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Botiva-SheetSync/1.0' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) return null;
  const text = await res.text();
  const parsed = parseSimpleCsv(text);
  if (!includeHeader && parsed.rows.length > 0) {
    return { header: [], rows: parsed.rows };
  }
  return parsed;
}

function estimateByteSize(header: string[], rows: string[][]): number {
  let n = 0;
  for (const h of header) n += Buffer.byteLength(h, 'utf8');
  for (const row of rows) {
    for (const cell of row) n += Buffer.byteLength(cell, 'utf8') + 1;
  }
  return n;
}

async function syncOneSheet(params: {
  userId: string;
  agentId: string;
  entry: SheetEntry;
  dryRun: boolean;
}): Promise<{ ok: boolean; byteSize: number; rowCount: number; error?: string }> {
  const spreadsheetId = extractSpreadsheetId(params.entry.url);
  if (!spreadsheetId) return { ok: false, byteSize: 0, rowCount: 0, error: 'URL inválida' };

  const gid = params.entry.tabGid || extractGid(params.entry.url) || '0';
  const sheetName = params.entry.tabTitle?.trim() || undefined;

  let header: string[] = [];
  const allRows: string[][] = [];
  let offset = 0;

  while (offset < MAX_SYNC_ROWS) {
    const to = offset + SYNC_CHUNK_ROWS;
    const range =
      offset === 0
        ? `A1:ZZ${SYNC_CHUNK_ROWS + 1}`
        : sheetDataRowsToA1Range(offset, to);
    const chunk = await fetchGvizChunk(spreadsheetId, gid, sheetName, range, offset === 0);
    if (!chunk) break;
    if (offset === 0 && chunk.header.length) header = chunk.header;
    if (!chunk.rows.length) break;
    allRows.push(...chunk.rows);
    if (chunk.rows.length < SYNC_CHUNK_ROWS) break;
    offset += chunk.rows.length;
  }

  if (!header.length && !allRows.length) {
    return { ok: false, byteSize: 0, rowCount: 0, error: 'Sin datos o sheet no accesible' };
  }

  const byteSize = estimateByteSize(header, allRows);
  const rowCount = allRows.length;

  if (!params.dryRun) {
    await SheetSnapshot.findOneAndUpdate(
      { agentId: params.agentId, sheetEntryId: params.entry.id },
      {
        $set: {
          userId: params.userId,
          agentId: params.agentId,
          sheetEntryId: params.entry.id,
          sheetName: params.entry.name,
          spreadsheetId,
          tabGid: gid,
          tabTitle: params.entry.tabTitle || '',
          header,
          rows: allRows,
          byteSize,
          rowCount,
          syncedAt: new Date(),
          syncError: null,
        },
      },
      { upsert: true },
    );
  }

  return { ok: true, byteSize, rowCount };
}

async function updateUserBillingMeter(userId: string, totalBytes: number): Promise<void> {
  const sub = await Subscription.findOne({ userId }).select({ sheetSyncBillingEnabled: 1 }).lean() as
    | { sheetSyncBillingEnabled?: boolean }
    | null;
  const billingOn = sheetSyncBillingActive(sub?.sheetSyncBillingEnabled);
  const month = new Date().toISOString().slice(0, 7);
  const estimatedUsd = billingOn ? sheetSyncChargeUsd(totalBytes) : 0;

  await SheetSyncUsage.findOneAndUpdate(
    { userId, month },
    {
      $set: {
        bytesStored: totalBytes,
        estimatedUsd,
        billingEnabled: billingOn,
        lastSyncAt: new Date(),
      },
    },
    { upsert: true },
  );
}

export async function runSheetNightlySync(opts: { dryRun?: boolean } = {}): Promise<SheetSyncRunResult> {
  const dryRun = opts.dryRun === true;
  await connectDB();

  const agents = await ClientAgent.find({
    'tools.toolId': 'google-sheets',
    status: { $ne: 'deleted' },
  })
    .select({ userId: 1, tools: 1, agentHubId: 1 })
    .lean();

  const planByUser = new Map<string, { plan: string; features: string[]; billing: boolean }>();
  const bytesByUser = new Map<string, number>();

  let sheetsSynced = 0;
  let sheetsSkipped = 0;
  let sheetsFailed = 0;
  let totalBytes = 0;
  const errors: SheetSyncRunResult['errors'] = [];

  for (const agent of agents) {
    const userId = String(agent.userId || '');
    const agentId = String(
      (agent as { agentHubId?: string }).agentHubId || (agent as { _id?: unknown })._id || '',
    );
    if (!userId || !agentId) continue;

    let planInfo = planByUser.get(userId);
    if (!planInfo) {
      const sub = await Subscription.findOne({ userId })
        .select({ plan: 1, status: 1, features: 1, sheetSyncBillingEnabled: 1 })
        .lean() as {
          plan?: string;
          status?: string;
          features?: string[];
          sheetSyncBillingEnabled?: boolean;
        } | null;
      const plan = effectiveProductPlan(sub?.plan ?? 'free', sub?.status ?? 'free');
      planInfo = {
        plan,
        features: Array.isArray(sub?.features) ? sub.features : [],
        billing: sub?.sheetSyncBillingEnabled === true,
      };
      planByUser.set(userId, planInfo);
    }

    if (!sheetNightlySyncEnabled(planInfo.plan, planInfo.features)) {
      sheetsSkipped += extractAgentSheets(agent).filter((e) => e.nightlySyncEnabled).length;
      continue;
    }

    const sheets = extractAgentSheets(agent).filter((e) => e.nightlySyncEnabled && e.url);
    for (const entry of sheets) {
      try {
        const r = await syncOneSheet({ userId, agentId, entry, dryRun });
        if (r.ok) {
          sheetsSynced++;
          totalBytes += r.byteSize;
          bytesByUser.set(userId, (bytesByUser.get(userId) ?? 0) + r.byteSize);
        } else {
          sheetsFailed++;
          errors.push({ agentId, sheetId: entry.id, error: r.error || 'falló' });
          if (!dryRun) {
            await SheetSnapshot.findOneAndUpdate(
              { agentId, sheetEntryId: entry.id },
              { $set: { syncError: r.error || 'falló', syncedAt: new Date() } },
              { upsert: true },
            );
          }
        }
      } catch (e) {
        sheetsFailed++;
        const msg = e instanceof Error ? e.message : String(e);
        errors.push({ agentId, sheetId: entry.id, error: msg });
      }
    }
  }

  if (!dryRun) {
    for (const [userId, bytes] of bytesByUser) {
      const allSnaps = await SheetSnapshot.find({ userId }).select({ byteSize: 1 }).lean();
      const totalUserBytes = allSnaps.reduce((acc, s) => acc + (typeof s.byteSize === 'number' ? s.byteSize : 0), 0);
      await updateUserBillingMeter(userId, totalUserBytes || bytes);
    }
  }

  return {
    ok: sheetsFailed === 0,
    dryRun,
    agentsScanned: agents.length,
    sheetsSynced,
    sheetsSkipped,
    sheetsFailed,
    totalBytes,
    errors: errors.slice(0, 50),
  };
}
