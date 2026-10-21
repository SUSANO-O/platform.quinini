/**
 * El modelo a veces escribe la llamada a una herramienta como texto en vez de ejecutarla
 * (`{"tool_call": {"name": "mysql_query", "arguments": {...}}}`), sobre todo cuando la
 * integración está caída y el turno acaba en el respaldo del hub. Ese JSON no se le puede
 * mostrar al visitante: deja ver la consulta SQL, tablas y columnas del cliente.
 */

/** Mensaje cuando la respuesta era solo la llamada filtrada. */
export const TOOL_LEAK_FALLBACK_REPLY =
  'Ahora mismo no puedo consultar esos datos. Inténtalo de nuevo en unos minutos.';

const TOOL_KEY = /"(?:tool_call|tool_calls|function_call|functionCall)"\s*:|"name"\s*:\s*"[^"]+"\s*,\s*"(?:arguments|args|parameters)"\s*:/;

/** Bloques ```json …``` (o sin lenguaje) que contienen una llamada a herramienta. */
const FENCED_BLOCK = /```[a-zA-Z]*\s*([\s\S]*?)(?:```|$)/g;

/** Devuelve el índice del cierre del objeto JSON que abre en `start` (o -1 si no cierra). */
function matchingBrace(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return i;
  }
  return -1;
}

/** Quita objetos JSON sueltos (sin ```) que sean llamadas a herramientas. */
function stripBareToolObjects(text: string): string {
  let out = text;
  let from = 0;
  for (;;) {
    const start = out.indexOf('{', from);
    if (start === -1) return out;
    const end = matchingBrace(out, start);
    const candidate = end === -1 ? out.slice(start) : out.slice(start, end + 1);
    if (TOOL_KEY.test(candidate)) {
      out = out.slice(0, start) + (end === -1 ? '' : out.slice(end + 1));
      from = start;
    } else {
      from = start + 1;
    }
  }
}

export function stripLeakedToolCalls(text: string): { text: string; leaked: boolean } {
  const original = String(text ?? '');
  if (!TOOL_KEY.test(original)) return { text: original, leaked: false };
  let out = original.replace(FENCED_BLOCK, (block, inner: string) => (TOOL_KEY.test(inner) ? '' : block));
  out = stripBareToolObjects(out);
  out = out.replace(/\n{3,}/g, '\n\n').trim();
  // Si solo quedan emojis/puntuación sueltos (p. ej. "💸"), no hay respuesta real.
  const meaningful = out.replace(/[^\p{L}\p{N}]+/gu, '');
  return { text: meaningful ? out : TOOL_LEAK_FALLBACK_REPLY, leaked: true };
}

/** Cuerpo JSON del hub (`{ reply | response | text }`): filtra la respuesta y re-serializa solo si hubo fuga. */
export function sanitizeHubReplyBody(body: string): string {
  // En el cuerpo serializado las comillas van escapadas (\"tool_call\"): filtro previo laxo y
  // la comprobación exacta se hace ya sobre el texto deserializado.
  if (!/tool_calls?|function_?call|functionCall|arguments|parameters|"args/i.test(body)) return body;
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return body;
    let leaked = false;
    for (const key of ['reply', 'response', 'text'] as const) {
      if (typeof parsed[key] === 'string') {
        const r = stripLeakedToolCalls(parsed[key] as string);
        if (r.leaked) {
          parsed[key] = r.text;
          leaked = true;
        }
      }
    }
    return leaked ? JSON.stringify(parsed) : body;
  } catch {
    return body;
  }
}
