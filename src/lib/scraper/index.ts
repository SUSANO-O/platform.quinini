/**
 * Scraper Service — punto de entrada público.
 *
 * Selección automática del backend:
 *
 *  Producción / Vercel  →  JinaScraper  (gratis, sin cuenta, sin Chrome)
 *  Desarrollo local     →  PuppeteerScraper  (Chrome del sistema)
 *
 *  FIRECRAWL_API_KEY definida  →  sustituye a Jina si la tienes
 *
 * En todos los casos el Markdown pasa por Gemini para segmentar.
 */

import { JinaScraper, PuppeteerScraper } from './browser';
import { MarkdownExtractor, PassthroughExtractor } from './extractor';
import { GeminiSegmenter, ChunkSegmenter } from './segmenter';
import type { ScrapeResult, IPageScraper, IExtractor, ISegmenter } from './types';

export type { ScrapeResult, ScrapeBlock } from './types';

interface ScraperOptions {
  pageScraper?: IPageScraper;
  extractor?:   IExtractor;
  segmenter?:   ISegmenter;
}

function buildDefaultStack(): { pageScraper: IPageScraper; extractor: IExtractor } {
  const isProduction = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;

  // En producción: Jina (gratis, sin Chrome)
  if (isProduction) {
    return {
      pageScraper: new JinaScraper(),
      extractor:   new PassthroughExtractor(),
    };
  }

  // En local: Puppeteer con Chrome del sistema
  return {
    pageScraper: new PuppeteerScraper(),
    extractor:   new MarkdownExtractor(),
  };
}

export async function scrape(url: string, opts: ScraperOptions = {}): Promise<ScrapeResult> {
  const { pageScraper, extractor } = buildDefaultStack();
  const resolvedScraper   = opts.pageScraper ?? pageScraper;
  const resolvedExtractor = opts.extractor   ?? extractor;

  const geminiKey = process.env.GEMINI_API_KEY;
  let usedAI = false;

  const segmenter: ISegmenter = opts.segmenter ?? {
    async segment(title, markdown) {
      if (geminiKey) {
        try {
          const blocks = await new GeminiSegmenter(geminiKey).segment(title, markdown);
          if (blocks.length > 0) { usedAI = true; return blocks; }
        } catch { /* fallback */ }
      }
      return new ChunkSegmenter().segment(title, markdown);
    },
  };

  // 1. Scraper obtiene contenido (Markdown o HTML)
  const scraped = await resolvedScraper.scrape(url) as {
    title: string; html: string; isMarkdown?: boolean;
  };

  // 2. Extractor: si ya es Markdown (Jina) → passthrough; si es HTML → Turndown
  const { title, text } = scraped.isMarkdown
    ? new PassthroughExtractor().extract(scraped.html)
    : resolvedExtractor.extract(scraped.html);

  if (text.trim().length < 80) {
    throw new Error('No se encontró contenido suficiente en la URL.');
  }

  // 3. Gemini segmenta — ChunkSegmenter como fallback
  const blocks = await segmenter.segment(title, text);

  return { url, title, charCount: text.length, extractedBy: usedAI ? 'ai' : 'chunk', blocks };
}
