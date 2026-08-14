/**
 * Indexado de los documentos del panel en el motor de búsqueda.
 *
 * Subir un documento desde el panel guardaba su texto en `ragSources` y lo
 * sincronizaba al catálogo del hub, pero nadie generaba los vectores. Como el
 * RAG solo consulta vectores (`metadata.type: 'chunk'`), esos documentos no se
 * podían recuperar: el panel decía "18 documentos" y el agente no veía ninguno.
 * La API REST de Team+ sí indexaba, de ahí que unos agentes funcionaran y otros
 * no según por dónde se hubieran subido.
 *
 * Se indexa contra `agentHubId`, que es el id con el que el motor busca en
 * tiempo de inferencia; con el ObjectId de la landing los vectores quedarían en
 * un cubo que nadie consulta.
 */

import { getAibackhubBaseUrl, hubFetch } from '@/lib/aibackhub-sync';

/** Generar embeddings de un documento largo no es inmediato. */
const INDEX_TIMEOUT_MS = 120_000;
const DELETE_TIMEOUT_MS = 15_000;

/** Como hubCreateHeaders pero sin Content-Type: en multipart lo pone FormData. */
function hubUploadHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  const apiKey = process.env.AIBACKHUB_API_KEY?.trim();
  if (apiKey) h['x-api-key'] = apiKey;
  const tenantId = process.env.AIBACKHUB_TENANT_ID?.trim();
  if (tenantId) h['x-tenant-id'] = tenantId;
  return h;
}

/** El motor deduce el parser por la extensión, así que conviene que la tenga. */
export function ragSourceFileName(name: string, fallback = 'documento'): string {
  const base = String(name ?? '').trim() || fallback;
  return /\.[a-z0-9]{1,8}$/i.test(base) ? base : `${base}.txt`;
}

export type RagSourceLike = {
  name?: string;
  fileName?: string;
  content?: string;
};

export function ragSourceIndexName(s: RagSourceLike): string {
  return ragSourceFileName(s.fileName || s.name || 'documento');
}

/** Nombre + texto: si cambia el contenido se reindexa; si no, no se vuelve a pagar el embedding. */
export function ragSourceFingerprint(s: RagSourceLike): string {
  return `${ragSourceIndexName(s)}\n${String(s.content ?? '').trim()}`;
}

/**
 * Qué hay que indexar y qué borrar al guardar el panel (texto, URL o duplicar).
 * Los archivos ya pasan por ingest; este diff cubre el resto y evita reindexar
 * lo que no se ha tocado.
 */
export function diffRagSourcesForIndex(
  previous: RagSourceLike[],
  next: RagSourceLike[],
): { toIndex: RagSourceLike[]; toDelete: string[] } {
  const prevFp = new Set((previous ?? []).map(ragSourceFingerprint));
  const nextNames = new Set((next ?? []).map(ragSourceIndexName));
  const toIndex = (next ?? []).filter(
    (s) => String(s.content ?? '').trim() && !prevFp.has(ragSourceFingerprint(s)),
  );
  const toDelete = [...new Set((previous ?? []).map(ragSourceIndexName))].filter(
    (n) => !nextNames.has(n),
  );
  return { toIndex, toDelete };
}

export type RagIndexResult =
  | { ok: true; chunks: number }
  | { ok: false; error: string };

/**
 * Genera y guarda los vectores de un documento. Nunca lanza: el documento ya
 * está guardado y no indexarlo es peor experiencia, no una pérdida de datos.
 */
export async function indexRagSourceEmbeddings(params: {
  agentHubId: string;
  fileName: string;
  content: string;
}): Promise<RagIndexResult> {
  const agentId = params.agentHubId.trim();
  const text = params.content ?? '';

  if (!getAibackhubBaseUrl()) return { ok: false, error: 'AIBackHub no configurado.' };
  if (!agentId) return { ok: false, error: 'El agente aún no está sincronizado con el hub.' };
  if (!text.trim()) return { ok: false, error: 'El documento no tiene texto que indexar.' };

  try {
    const form = new FormData();
    form.append('file', new Blob([text], { type: 'text/plain' }), ragSourceFileName(params.fileName));
    form.append('agentId', agentId);

    const res = await hubFetch(
      '/api/embeddings/upload',
      { method: 'POST', headers: hubUploadHeaders(), body: form },
      INDEX_TIMEOUT_MS,
    );

    const json = (await res.json().catch(() => ({}))) as {
      data?: { totalChunks?: number };
      error?: { message?: string } | string;
      message?: string;
    };

    if (!res.ok) {
      const msg =
        (typeof json.error === 'string' ? json.error : json.error?.message) ||
        json.message ||
        `HTTP ${res.status}`;
      return { ok: false, error: msg };
    }

    return { ok: true, chunks: typeof json.data?.totalChunks === 'number' ? json.data.totalChunks : 0 };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error indexando el documento.' };
  }
}

const RECALL_TIMEOUT_MS = 8_000;

/**
 * Busca en los documentos del agente y devuelve un bloque listo para el prompt.
 *
 * La inferencia directa no consultaba nada: descarta a los agentes con MCP pero
 * no a los que tienen documentos, así que un agente con base de conocimiento y
 * sin herramientas respondía como si no la tuviera. Nunca lanza; quedarse sin
 * contexto es peor respuesta, no un fallo del chat.
 */
export async function retrieveRagContextBlock(params: {
  agentHubId: string;
  query: string;
}): Promise<string> {
  const agentId = params.agentHubId.trim();
  const query = params.query.trim();
  if (!getAibackhubBaseUrl() || !agentId || !query) return '';

  try {
    const res = await hubFetch(
      '/api/embeddings/rag',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...hubUploadHeaders() },
        body: JSON.stringify({ agentId, query, topK: 4, threshold: 0.35 }),
      },
      RECALL_TIMEOUT_MS,
    );
    if (!res.ok) return '';

    const json = (await res.json().catch(() => ({}))) as { data?: { context?: string } };
    const texto = json.data?.context;
    return typeof texto === 'string' ? texto.trim() : '';
  } catch {
    return '';
  }
}

/** Borra los vectores de un documento eliminado, para que deje de responder. */
export async function deleteRagSourceEmbeddings(params: {
  agentHubId: string;
  fileName: string;
}): Promise<boolean> {
  const agentId = params.agentHubId.trim();
  if (!getAibackhubBaseUrl() || !agentId) return false;

  try {
    const res = await hubFetch(
      '/api/embeddings/file',
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...hubUploadHeaders() },
        body: JSON.stringify({ agentId, sourceFile: ragSourceFileName(params.fileName) }),
      },
      DELETE_TIMEOUT_MS,
    );
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Alinea vectores con lo que acaba de guardar el panel: indexa altas y cambios,
 * borra lo que ya no está. Nunca lanza.
 */
export async function syncRagSourceEmbeddings(params: {
  agentHubId: string;
  previous: RagSourceLike[];
  next: RagSourceLike[];
}): Promise<{ indexed: number; deleted: number; errors: string[] }> {
  const { toIndex, toDelete } = diffRagSourcesForIndex(params.previous, params.next);
  const errors: string[] = [];
  let indexed = 0;
  let deleted = 0;

  for (const nombre of toDelete) {
    const ok = await deleteRagSourceEmbeddings({
      agentHubId: params.agentHubId,
      fileName: nombre,
    });
    if (ok) deleted += 1;
  }

  for (const s of toIndex) {
    const r = await indexRagSourceEmbeddings({
      agentHubId: params.agentHubId,
      fileName: ragSourceIndexName(s),
      content: String(s.content ?? ''),
    });
    if (r.ok) indexed += 1;
    else errors.push(`${ragSourceIndexName(s)}: ${r.error}`);
  }

  return { indexed, deleted, errors };
}
