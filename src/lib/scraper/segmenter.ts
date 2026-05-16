/**
 * Segmentadores — la IA hace todo: identifica, filtra y segmenta.
 *
 * GeminiSegmenter   → Gemini 2.0 Flash (identifica tipo de página,
 *                      descarta ruido semántico, segmenta contenido útil)
 * ChunkSegmenter    → fallback determinístico sin IA
 * ComposedSegmenter → GeminiSegmenter con fallback a ChunkSegmenter
 */

import type { ISegmenter, ScrapeBlock } from './types';

// ── Prompt principal ──────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Eres un experto en RAG (Retrieval Augmented Generation).

Recibirás el Markdown de una página web. Tu trabajo es extraer ÚNICAMENTE el contenido que sea útil para responder preguntas de usuarios en un chatbot.

━━━ DESCARTA COMPLETAMENTE (aunque sean líneas de texto) ━━━
✗ Listas de links de navegación: Inicio, Investigación, Productos, Empresa, Docs, API, Login, Registro...
✗ Listas de links de footer: Términos, Privacidad, Cookies, Redes sociales, Copyright...
✗ Prompts o ejemplos decorativos de UI: "Plan a surf trip", "Quiz me on vocabulary", "Help me improve..."
✗ Nombres de imágenes o referencias visuales sin texto informativo
✗ Contadores genéricos: "Más de 1M usuarios", "Disponible en 50 países" sin contexto
✗ CTAs aislados sin contexto: "Comenzar gratis", "Ver más", "Contactar"
✗ Líneas con solo URLs o paths: "/es-419/research/", "https://..."

━━━ EXTRAE Y PRESERVA ━━━
✓ Descripciones de productos/servicios con características específicas y concretas
✓ Precios, planes, límites, comparativas con números reales
✓ Instrucciones paso a paso, tutoriales, guías de uso
✓ FAQs: pregunta + respuesta completa
✓ Políticas específicas (devoluciones, envíos, garantías) con condiciones reales
✓ Casos de uso con nombres de empresas y resultados concretos
✓ Datos de contacto, ubicaciones, horarios de atención
✓ Noticias o anuncios con información factual específica

━━━ REGLAS DE SEGMENTACIÓN ━━━
- Máximo 500 palabras por bloque
- Cada bloque debe ser autocontenido y responder una pregunta específica
- Título descriptivo que refleje exactamente qué contiene el bloque

Devuelve ÚNICAMENTE JSON válido (sin markdown, sin texto antes o después):
[{"title":"Título","content":"Contenido informativo...","type":"general|faq|product|policy|docs|news","order":1}]

Si la página no tiene contenido informativo útil (es solo navegación, imágenes o marketing vacío), devuelve exactamente: []`;

// ── Gemini ────────────────────────────────────────────────────────────────────

export class GeminiSegmenter implements ISegmenter {
  constructor(private readonly apiKey: string) {}

  async segment(title: string, markdown: string): Promise<ScrapeBlock[]> {
    const user = `Página: "${title}"\n\nContenido completo:\n\n${markdown.slice(0, 60_000)}`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: {
            temperature:     0.1,
            maxOutputTokens: 8192,
          },
        }),
        signal: AbortSignal.timeout(50_000),
      }
    );

    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);

    const data  = await res.json();
    const raw: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    // Extrae el JSON aunque Gemini lo envuelva en ```json ... ```
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('Gemini no devolvió JSON válido');

    const blocks = JSON.parse(match[0]) as ScrapeBlock[];
    if (!Array.isArray(blocks)) throw new Error('Respuesta no es un array');

    return blocks;
  }
}

// ── Chunk fallback (sin IA) ───────────────────────────────────────────────────

export class ChunkSegmenter implements ISegmenter {
  private readonly chunkSize: number;
  constructor(chunkSize = 2000) { this.chunkSize = chunkSize; }

  async segment(title: string, text: string): Promise<ScrapeBlock[]> {
    const paras  = text.split('\n\n').filter((p) => p.trim().length > 40);
    const blocks: ScrapeBlock[] = [];
    let buf   = '';
    let order = 1;

    for (const para of paras) {
      if (buf.length + para.length > this.chunkSize && buf.length > 0) {
        blocks.push({ title: `${title} — Parte ${order}`, content: buf.trim(), type: 'general', order: order++ });
        buf = para;
      } else {
        buf = buf ? `${buf}\n\n${para}` : para;
      }
    }
    if (buf.trim()) {
      blocks.push({ title: `${title} — Parte ${order}`, content: buf.trim(), type: 'general', order });
    }

    return blocks.length > 0
      ? blocks
      : [{ title, content: text.slice(0, this.chunkSize), type: 'general', order: 1 }];
  }
}

// ── Composed: Gemini con fallback a Chunk ─────────────────────────────────────

export class ComposedSegmenter implements ISegmenter {
  constructor(
    private readonly primary:  ISegmenter,
    private readonly fallback: ISegmenter,
  ) {}

  async segment(title: string, text: string): Promise<ScrapeBlock[]> {
    try {
      const result = await this.primary.segment(title, text);
      // Si Gemini devuelve vacío, el contenido era puro ruido → fallback
      if (result.length === 0) return this.fallback.segment(title, text);
      return result;
    } catch {
      return this.fallback.segment(title, text);
    }
  }
}

/** Factory: construye el segmentador correcto según el entorno. */
export function buildSegmenter(): ISegmenter {
  const key      = process.env.GEMINI_API_KEY;
  const fallback = new ChunkSegmenter();
  return key
    ? new ComposedSegmenter(new GeminiSegmenter(key), fallback)
    : fallback;
}
