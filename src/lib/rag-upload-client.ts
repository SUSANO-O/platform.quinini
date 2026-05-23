'use client';

import { upload } from '@vercel/blob/client';
import { prepareFileForRagUpload } from '@/lib/pdf-client-prep';

type UploadConfig = {
  blobEnabled: boolean;
  maxFileMb: number;
  maxDirectMb: number;
};

let cachedConfig: UploadConfig | null = null;

async function getUploadConfig(): Promise<UploadConfig> {
  if (cachedConfig) return cachedConfig;
  const res = await fetch('/api/rag/upload-config');
  const data = await res.json();
  cachedConfig = {
    blobEnabled: Boolean(data.blobEnabled),
    maxFileMb: Number(data.maxFileMb) || 10,
    maxDirectMb: Number(data.maxDirectMb) || 4,
  };
  return cachedConfig;
}

export type RagUploadResult = {
  ok: boolean;
  error?: string;
  source?: unknown;
  message?: string;
};

export type RagUploadOptions = {
  deferSync?: boolean;
  onStatus?: (message: string) => void;
};

async function uploadFileBinary(
  agentId: string,
  file: File,
  config: UploadConfig,
  deferQuery: string,
): Promise<RagUploadResult> {
  if (config.blobEnabled) {
    try {
      const blob = await upload(file.name, file, {
        access: 'private',
        handleUploadUrl: `/api/agents/${agentId}/rag-upload/blob`,
        clientPayload: JSON.stringify({ agentId }),
      });

      const completeRes = await fetch(`/api/agents/${agentId}/rag-upload/complete${deferQuery}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          downloadUrl: blob.downloadUrl,
          pathname: blob.pathname,
          filename: file.name,
          mimeType: file.type || 'application/octet-stream',
          size: file.size,
        }),
      });
      const data = await completeRes.json();
      if (!completeRes.ok) {
        return { ok: false, error: typeof data.error === 'string' ? data.error : 'Error al procesar el archivo.' };
      }
      return { ok: true, source: data.source, message: data.message };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Error al subir el archivo.',
      };
    }
  }

  const directMax = config.maxDirectMb * 1024 * 1024;
  if (file.size > directMax) {
    return {
      ok: false,
      error: `Archivo demasiado grande (${config.maxDirectMb} MB máx. en subida directa).`,
    };
  }

  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`/api/agents/${agentId}/rag-upload${deferQuery}`, { method: 'POST', body: form });
  const data = await res.json();
  if (!res.ok) {
    return { ok: false, error: typeof data.error === 'string' ? data.error : 'Error al subir el archivo.' };
  }
  return { ok: true, source: data.source, message: data.message };
}

export async function uploadRagFileToAgent(
  agentId: string,
  file: File,
  options?: RagUploadOptions,
): Promise<RagUploadResult> {
  const config = await getUploadConfig();
  const maxBytes = config.maxFileMb * 1024 * 1024;
  if (file.size > maxBytes) {
    return {
      ok: false,
      error: `El archivo supera ${config.maxFileMb} MB.`,
    };
  }

  const deferQuery = options?.deferSync ? '?deferSync=1' : '';
  const maxDirectBytes = config.maxDirectMb * 1024 * 1024;

  let prepared;
  try {
    prepared = await prepareFileForRagUpload(file, {
      maxDirectBytes,
      maxFileBytes: maxBytes,
      blobEnabled: config.blobEnabled,
      onStatus: options?.onStatus,
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Error al preparar el archivo.',
    };
  }

  if (prepared.mode === 'text') {
    const res = await fetch(`/api/agents/${agentId}/rag-upload/text${deferQuery}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: prepared.text,
        filename: prepared.filename,
        originalSize: prepared.originalSize,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      return { ok: false, error: typeof data.error === 'string' ? data.error : 'Error al indexar el texto.' };
    }
    options?.onStatus?.('Texto indexado (PDF original descartado).');
    return { ok: true, source: data.source, message: data.message };
  }

  return uploadFileBinary(agentId, prepared.file, config, deferQuery);
}

/** Invalida caché de límites (p. ej. tras cambiar entorno). */
export function resetRagUploadConfigCache() {
  cachedConfig = null;
}
