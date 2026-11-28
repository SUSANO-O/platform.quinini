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
import { estimateSheetBytes, streamSheetToChunks } from '@/lib/sheet-sync-stream';
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

/**
 * Sincroniza una hoja escribiendo por bloques (memoria acotada) y sin borrar antes el snapshot anterior.
 * Ver `streamSheetToChunks` en sheet-sync-stream.ts.
 */
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
  const key = { agentId: params.agentId, sheetEntryId: params.entry.id };
  const syncedAt = new Date();

  if (!params.dryRun) {
    try {
      await SheetSnapshot.collection.dropIndex('agentId_1_sheetEntryId_1');
    } catch {
      /* índice viejo ya no existe */
    }
  }

  const r = await streamSheetToChunks({
    fetchRows: SYNC_CHUNK_ROWS,
    chunkRows: MONGO_CHUNK_ROWS,
    maxRows: MAX_SYNC_ROWS,
    dryRun: params.dryRun,
    fetchChunk: (from, take, includeHeader) =>
      fetchGvizChunk(spreadsheetId, gid, sheetName, `A${from}:${maxCol}${from + take - 1}`, includeHeader),
    writeChunk: async ({ chunkIndex, header, rows }) => {
      await SheetSnapshot.replaceOne(
        { ...key, chunkIndex },
        {
          userId: params.userId,
          ...key,
          sheetName: params.entry.name,
          spreadsheetId,
          tabGid: gid,
          tabTitle: params.entry.tabTitle || '',
          header,
          rows,
          byteSize: estimateSheetBytes(header, rows),
          rowCount: rows.length,
          totalRows: 0,
          chunkIndex,
          complete: false,
          syncedAt,
          syncError: null,
        },
        { upsert: true },
      );
    },
  });

  if (!r.header.length && !r.rowCount) {
    return { ok: false, byteSize: 0, rowCount: 0, error: 'Sin datos o sheet no accesible' };
  }

  if (!params.dryRun) {
    if (r.chunks === 0) {
      // Hoja con encabezado pero sin filas: un bloque vacío para conservar el encabezado.
      await SheetSnapshot.replaceOne(
        { ...key, chunkIndex: 0 },
        {
          userId: params.userId, ...key, sheetName: params.entry.name, spreadsheetId, tabGid: gid,
          tabTitle: params.entry.tabTitle || '', header: r.header, rows: [], byteSize: r.byteSize,
          rowCount: 0, totalRows: 0, chunkIndex: 0, complete: r.complete, syncedAt, syncError: null,
        },
        { upsert: true },
      );
    }
    // Solo ahora, con todo escrito: quitar bloques sobrantes del snapshot anterior y marcar el total.
    await SheetSnapshot.deleteMany({ ...key, chunkIndex: { $gte: Math.max(1, r.chunks) } });
    await SheetSnapshot.updateMany(key, { $set: { totalRows: r.rowCount, complete: r.complete } });
  }

  return { ok: true, byteSize: r.byteSize, rowCount: r.rowCount };
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
