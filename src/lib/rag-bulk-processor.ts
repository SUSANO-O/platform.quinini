/**
 * Procesamiento async de jobs bulk RAG (ZIP o lote grande de archivos).
 */

import JSZip from 'jszip';
import { ClientAgent, RagBulkJob } from '@/lib/db/models';
import { getAgentLimits } from '@/lib/agent-plans';
import { ingestRagFileToAgent, RAG_ALLOWED_MIMES, type RagIngestInput } from '@/lib/rag-file-ingest';
import { canAttemptHubSync, syncHubCatalogFromLandingAgentDoc } from '@/lib/aibackhub-sync';
import { takeBulkFiles } from '@/lib/rag-bulk-queue';

const BULK_ASYNC_THRESHOLD = 6;

export function shouldProcessBulkAsync(fileCount: number): boolean {
  return fileCount >= BULK_ASYNC_THRESHOLD;
}

export async function extractFilesFromZip(buffer: Buffer): Promise<Array<{ name: string; buffer: Buffer }>> {
  const zip = await JSZip.loadAsync(buffer);
  const out: Array<{ name: string; buffer: Buffer }> = [];
  const entries = Object.values(zip.files).filter((f) => !f.dir);
  for (const entry of entries) {
    const name = entry.name.split('/').pop() || entry.name;
    if (!name || name.startsWith('.')) continue;
    const buf = await entry.async('nodebuffer');
    if (buf.length === 0) continue;
    out.push({ name, buffer: buf });
  }
  return out;
}

function guessMime(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (lower.endsWith('.doc')) return 'application/msword';
  if (lower.endsWith('.txt')) return 'text/plain';
  if (lower.endsWith('.md')) return 'text/markdown';
  if (lower.endsWith('.csv')) return 'text/csv';
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'text/html';
  return 'application/octet-stream';
}

export async function processRagBulkJob(jobId: string): Promise<void> {
  const job = await RagBulkJob.findById(jobId);
  if (!job || job.status !== 'pending') return;

  job.status = 'processing';
  job.startedAt = new Date();
  await job.save();

  const agent = await ClientAgent.findOne({ _id: job.agentId, userId: job.userId });
  if (!agent) {
    job.status = 'failed';
    job.fileErrors = [{ file: '*', error: 'Agente no encontrado.' }];
    job.finishedAt = new Date();
    await job.save();
    return;
  }

  if (agent.isPlatform) {
    job.status = 'failed';
    job.fileErrors = [{ file: '*', error: 'Agente de plataforma no editable.' }];
    job.finishedAt = new Date();
    await job.save();
    return;
  }

  const limits = getAgentLimits(job.plan);
  const staged = takeBulkFiles(jobId);
  const files = staged ?? [];
  let processed = 0;
  const errors: Array<{ file: string; error: string }> = [];

  if (!files.length) {
    job.status = 'failed';
    job.fileErrors = [{ file: '*', error: 'Archivos del job no disponibles (expirados o ya procesados).' }];
    job.finishedAt = new Date();
    await job.save();
    return;
  }

  for (const f of files) {
    const mimeType = f.mimeType || guessMime(f.name);
    if (!RAG_ALLOWED_MIMES.has(mimeType) && !f.name.match(/\.(pdf|docx|doc|txt|md|csv|json|png|jpe?g|webp|gif|html?)$/i)) {
      errors.push({ file: f.name, error: 'Tipo no soportado.' });
      continue;
    }
    const input: RagIngestInput = {
      buffer: f.buffer,
      filename: f.name,
      mimeType,
      size: f.buffer.length,
    };
    const result = await ingestRagFileToAgent(agent, input, limits, { syncHub: false });
    if (!result.ok) {
      errors.push({ file: f.name, error: result.error });
      if (result.status === 403) break;
      continue;
    }
    processed += 1;
    job.processedFiles = processed;
    await job.save();
  }

  const hubId = typeof agent.agentHubId === 'string' ? agent.agentHubId.trim() : '';
  if (hubId && canAttemptHubSync() && processed > 0) {
    const ok = await syncHubCatalogFromLandingAgentDoc(agent);
    agent.syncStatus = ok ? 'synced' : 'failed';
    await agent.save();
  }

  job.status = errors.length && processed === 0 ? 'failed' : 'completed';
  job.processedFiles = processed;
  job.fileErrors = errors;
  job.finishedAt = new Date();
  await job.save();
}

export function scheduleRagBulkJob(jobId: string): void {
  setImmediate(() => {
    processRagBulkJob(jobId).catch((err) => {
      console.error('[rag-bulk] job failed', jobId, err);
      RagBulkJob.findByIdAndUpdate(jobId, {
        status: 'failed',
        finishedAt: new Date(),
        fileErrors: [{ file: '*', error: err instanceof Error ? err.message : String(err) }],
      }).catch(() => {});
    });
  });
}
