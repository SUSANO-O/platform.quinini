/**
 * Scraper Service — punto de entrada público.
 *
 * Pipeline:
 *   IPageScraper  →  HTML renderizado con JS (Chrome real)
 *   IExtractor    →  Markdown limpio (Turndown, sin imágenes ni heurísticas)
 *   ISegmenter    →  Gemini identifica, filtra y segmenta en bloques RAG
 */

import { PuppeteerScraper }                      from './browser';
import { MarkdownExtractor }                     from './extractor';
import { GeminiSegmenter, ChunkSegmenter, buildSegmenter } from './segmenter';
import type { ScrapeResult, IPageScraper, IExtractor, ISegmenter } from './types';

export type { ScrapeResult, ScrapeBlock } from './types';

interface ScraperOptions {
  pageScraper?: IPageScraper;
  extractor?:   IExtractor;
  segmenter?:   ISegmenter;
}

export async function scrape(url: string, opts: ScraperOptions = {}): Promise<ScrapeResult> {
  const pageScraper = opts.pageScraper ?? new PuppeteerScraper();
  const extractor   = opts.extractor   ?? new MarkdownExtractor();

  // Construye segmentadores con tracking de cuál respondió
  const geminiKey = process.env.GEMINI_API_KEY;
  let usedAI = false;

  const segmenter: ISegmenter = opts.segmenter ?? {
    async segment(title, markdown) {
      if (geminiKey) {
        try {
          const blocks = await new GeminiSegmenter(geminiKey).segment(title, markdown);
          if (blocks.length > 0) {
            usedAI = true;
            return blocks;
          }
          // Gemini devolvió vacío → la página es puro ruido (nav, imágenes, footer)
        } catch {
          // Gemini falló → fallback
        }
      }
      return new ChunkSegmenter().segment(title, markdown);
    },
  };

  // 1. Chrome renderiza el JS y devuelve HTML completo
  const { html }        = await pageScraper.scrape(url);

  // 2. Turndown: HTML → Markdown sin imágenes ni ruido visual
  const { title, text } = extractor.extract(html);

  if (text.trim().length < 80) {
    throw new Error('No se encontró contenido suficiente en la URL.');
  }

  // 3. Gemini identifica, filtra y segmenta — ChunkSegmenter como fallback
  const blocks = await segmenter.segment(title, text);

  return {
    url,
    title,
    charCount:   text.length,
    extractedBy: usedAI ? 'ai' : 'chunk',
    blocks,
  };
}
