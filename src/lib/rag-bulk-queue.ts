/**
 * Cola en memoria para buffers de jobs bulk RAG (evita guardar binarios en MongoDB).
 * TTL corto: los jobs deben procesarse en segundos tras la petición POST.
 */

export type BulkStagedFile = {
  name: string;
  buffer: Buffer;
  mimeType?: string;
};

const stash = new Map<string, { files: BulkStagedFile[]; expiresAt: number }>();
const TTL_MS = 30 * 60 * 1000;

function purgeExpired() {
  const now = Date.now();
  for (const [id, entry] of stash.entries()) {
    if (entry.expiresAt <= now) stash.delete(id);
  }
}

export function stageBulkFiles(jobId: string, files: BulkStagedFile[]): void {
  purgeExpired();
  stash.set(jobId, { files, expiresAt: Date.now() + TTL_MS });
}

export function takeBulkFiles(jobId: string): BulkStagedFile[] | null {
  purgeExpired();
  const entry = stash.get(jobId);
  if (!entry) return null;
  stash.delete(jobId);
  return entry.files;
}
