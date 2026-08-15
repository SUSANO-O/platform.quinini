/**
 * Sync nocturno Google Sheets → Mongo (3 AM America/Bogota).
 * Solo entradas con nightlySyncEnabled y dueños con plan Plus+.
 */

import {
  buildGvizCsvUrl,
  extractGid,
  extractSpreadsheetId,
  extractAgentSheets,
  parseGvizCsvChunk,
  splitSheetRowsForMongo,
  SHEET_GVIZ_DEFAULT_MAX_COL,
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

const SYNC_CHUNK_ROWS = 800;
const MAX_SYNC_ROWS = 350_000;
const MONGO_CHUNK_ROWS = 4_000;
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
): Promise<{ header: string[]; rows: string[][]; lineCount: number } | null> {
  const url = buildGvizCsvUrl({ spreadsheetId, gid, sheetName, range });
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Botiva-SheetSync/1.0' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) return null;
  const text = await res.text();
  if (/"status"\s*:\s*"error"|INVALID_QUERY|NO_COLUMN/.test(text)) return null;
  return parseGvizCsvChunk(text, includeHeader);
}

async function persistSnapshotChunks(params: {
  userId: string;
  agentId: string;
  entry: SheetEntry;
  spreadsheetId: string;
  gid: string;
  header: string[];
  rows: string[][];
  byteSize: number;
  rowCount: number;
  complete: boolean;
}): Promise<void> {
  const col = SheetSnapshot.collection;
  try {
    await col.dropIndex('agentId_1_sheetEntryId_1');
  } catch {
    /* índice viejo ya no existe */
  }
  await SheetSnapshot.deleteMany({
    agentId: params.agentId,
    sheetEntryId: params.entry.id,
  });
  const now = new Date();
  const parts = splitSheetRowsForMongo(params.rows, MONGO_CHUNK_ROWS);
  const docs = parts.map((part, chunkIndex) => ({
    userId: params.userId,
    agentId: params.agentId,
    sheetEntryId: params.entry.id,
    sheetName: params.entry.name,
    spreadsheetId: params.spreadsheetId,
    tabGid: params.gid,
    tabTitle: params.entry.tabTitle || '',
    header: params.header,
    rows: part,
    byteSize: estimateByteSize(params.header, part),
    rowCount: part.length,
    totalRows: params.rowCount,
    chunkIndex,
    complete: params.complete,
    syncedAt: now,
    syncError: null,
  }));
  if (docs.length) await SheetSnapshot.insertMany(docs);
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
  const maxCol = SHEET_GVIZ_DEFAULT_MAX_COL;

  let header: string[] = [];
  const allRows: string[][] = [];
  let from = 1;
  let hitEnd = false;

  while (allRows.length < MAX_SYNC_ROWS) {
    const take = Math.min(SYNC_CHUNK_ROWS, MAX_SYNC_ROWS - allRows.length);
    const to = from + take - 1;
    const range = `A${from}:${maxCol}${to}`;
    const chunk = await fetchGvizChunk(spreadsheetId, gid, sheetName, range, from === 1);
    if (!chunk || chunk.lineCount === 0) {
      hitEnd = true;
      break;
    }
    if (from === 1 && chunk.header.length) header = chunk.header;
    if (!chunk.rows.length) {
      hitEnd = true;
      break;
    }
    allRows.push(...chunk.rows);
    from = to + 1;
    if (chunk.lineCount < take) {
      hitEnd = true;
      break;
    }
  }

  if (!header.length && !allRows.length) {
    return { ok: false, byteSize: 0, rowCount: 0, error: 'Sin datos o sheet no accesible' };
  }

  const complete = hitEnd && allRows.length < MAX_SYNC_ROWS;
  const byteSize = estimateByteSize(header, allRows);
  const rowCount = allRows.length;

  if (!params.dryRun) {
    await persistSnapshotChunks({
      userId: params.userId,
      agentId: params.agentId,
      entry: params.entry,
      spreadsheetId,
      gid,
      header,
      rows: allRows,
      byteSize,
      rowCount,
      complete,
    });
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
