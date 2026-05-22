/**
 * Lógica compartida para ingerir archivos en ragSources de un agente.
 * Usada por rag-upload, quick-start y bulk RAG.
 */

import crypto from 'crypto';
import { processFile, getFileCategory } from '@/lib/rag-processor';
import { canAttemptHubSync, syncHubCatalogFromLandingAgentDoc } from '@/lib/aibackhub-sync';
import type { AgentPlanLimits } from '@/lib/agent-plans';
import type { ClientAgent } from '@/lib/db/models';

export const RAG_MAX_FILE_SIZE = 10 * 1024 * 1024;
export const RAG_DEFAULT_MAX_SOURCES = 20;

export const RAG_ALLOWED_MIMES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'text/html',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

export function magicBytesMatch(buf: Buffer, declaredMime: string): boolean {
  if (buf.length < 4) return true;
  switch (declaredMime) {
    case 'application/pdf':
      return buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46;
    case 'image/png':
      return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    case 'image/jpeg':
      return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    case 'image/gif':
      return buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38;
    case 'image/webp':
      return (
        buf.length >= 12 &&
        buf[0] === 0x52 &&
        buf[1] === 0x49 &&
        buf[2] === 0x46 &&
        buf[3] === 0x46 &&
        buf[8] === 0x57 &&
        buf[9] === 0x45 &&
        buf[10] === 0x42 &&
        buf[11] === 0x50
      );
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/msword':
      return (buf[0] === 0x50 && buf[1] === 0x4b) || (buf[0] === 0xd0 && buf[1] === 0xcf);
    default:
      return true;
  }
}

export type RagIngestInput = {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  size: number;
};

export type RagIngestResult =
  | { ok: true; source: Record<string, unknown>; warning?: string | null }
  | { ok: false; error: string; status: number };

type AgentDoc = InstanceType<typeof ClientAgent>;

export function ragUsedBytes(agent: { ragSources?: unknown[] }): number {
  return (agent.ragSources ?? []).reduce((acc: number, s: unknown) => {
    if (!s || typeof s !== 'object') return acc;
    const size = (s as { fileSize?: unknown }).fileSize;
    return acc + (typeof size === 'number' && Number.isFinite(size) ? Math.max(0, size) : 0);
  }, 0);
}

export function maxSourcesForPlan(limits: AgentPlanLimits): number {
  return limits.ragSourcesPerAgent > 0 ? limits.ragSourcesPerAgent : RAG_DEFAULT_MAX_SOURCES;
}

export function validateRagIngestInput(
  input: RagIngestInput,
  agent: { ragSources?: unknown[] },
  limits: AgentPlanLimits,
): RagIngestResult | null {
  if (!limits.ragEnabled) {
    return { ok: false, error: 'RAG no está disponible en tu plan. Actualiza tu suscripción.', status: 403 };
  }
  if (input.size > RAG_MAX_FILE_SIZE) {
    return {
      ok: false,
      error: `El archivo excede el límite de ${RAG_MAX_FILE_SIZE / 1024 / 1024} MB.`,
      status: 413,
    };
  }
  const mimeType = input.mimeType || 'application/octet-stream';
  const filename = input.filename || 'archivo';
  if (!RAG_ALLOWED_MIMES.has(mimeType) && getFileCategory(mimeType, filename) === 'unsupported') {
    return {
      ok: false,
      error: `Tipo de archivo no soportado: ${mimeType}. Sube PDF, DOCX, TXT, CSV, JSON o imágenes.`,
      status: 415,
    };
  }
  const maxSources = maxSourcesForPlan(limits);
  const currentSources = agent.ragSources?.length ?? 0;
  if (currentSources >= maxSources) {
    return {
      ok: false,
      error: `Máximo ${maxSources} fuentes por agente en tu plan. Elimina alguna antes de subir más.`,
      status: 403,
    };
  }
  const usedBytes = ragUsedBytes(agent);
  const maxStorageBytes = Math.max(0, limits.ragStorageMbPerAgent) * 1024 * 1024;
  if (maxStorageBytes > 0 && usedBytes + input.size > maxStorageBytes) {
    const usedMb = (usedBytes / 1024 / 1024).toFixed(1);
    return {
      ok: false,
      error:
        `Límite de almacenamiento RAG alcanzado para tu plan (${limits.ragStorageMbPerAgent} MB por agente). ` +
        `Uso actual: ${usedMb} MB.`,
      status: 403,
    };
  }
  if (!magicBytesMatch(input.buffer, mimeType)) {
    return {
      ok: false,
      error: 'El contenido del archivo no coincide con el tipo declarado. Verifica que el archivo no esté corrupto.',
      status: 415,
    };
  }
  return null;
}

export async function ingestRagFileToAgent(
  agent: AgentDoc,
  input: RagIngestInput,
  limits: AgentPlanLimits,
  options?: { syncHub?: boolean },
): Promise<RagIngestResult> {
  const validationError = validateRagIngestInput(input, agent, limits);
  if (validationError) return validationError;

  const mimeType = input.mimeType || 'application/octet-stream';
  const filename = input.filename || 'archivo';
  const result = await processFile(input.buffer, filename, mimeType);

  if (result.category === 'unsupported') {
    return { ok: false, error: result.warning ?? 'Tipo de archivo no soportado.', status: 415 };
  }

  const fileId = crypto.randomBytes(8).toString('hex');
  const newSource = {
    type: 'file' as const,
    name: filename,
    content: result.text,
    fileId,
    fileName: filename,
    fileMime: mimeType,
    fileSize: input.size,
    fileCategory: result.category,
    charCount: result.charCount,
    warning: result.warning ?? null,
    uploadedAt: new Date(),
  };

  agent.ragSources = [...(agent.ragSources ?? []), newSource];
  agent.ragEnabled = true;
  await agent.save();

  const shouldSync = options?.syncHub !== false;
  if (shouldSync) {
    const hubId = typeof agent.agentHubId === 'string' ? agent.agentHubId.trim() : '';
    if (hubId && canAttemptHubSync()) {
      const ok = await syncHubCatalogFromLandingAgentDoc(agent);
      agent.syncStatus = ok ? 'synced' : 'failed';
      await agent.save();
    }
  }

  return { ok: true, source: newSource, warning: result.warning ?? null };
}
