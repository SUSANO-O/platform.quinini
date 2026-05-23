/** Límite lógico por archivo RAG (MB en UI = este valor). */
export const RAG_MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Límite del body en funciones serverless de Vercel (~4.5 MB). */
export const RAG_DIRECT_UPLOAD_MAX = 4 * 1024 * 1024;

export function isRagBlobUploadEnabled(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

export function getRagMaxFileSizeBytes(): number {
  return RAG_MAX_FILE_SIZE;
}

/** Tamaño máximo en subida multipart directa al API route. */
export function getRagDirectUploadMaxBytes(): number {
  if (isRagBlobUploadEnabled()) return RAG_MAX_FILE_SIZE;
  return Math.min(RAG_MAX_FILE_SIZE, RAG_DIRECT_UPLOAD_MAX);
}

export function ragMaxFileSizeMb(): number {
  return RAG_MAX_FILE_SIZE / 1024 / 1024;
}

export function ragDirectUploadMaxMb(): number {
  return getRagDirectUploadMaxBytes() / 1024 / 1024;
}
