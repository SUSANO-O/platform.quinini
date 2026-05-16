/** Tipos compartidos del módulo de scraping. */

export interface ScrapeBlock {
  title: string;
  content: string;
  type: string;
  order: number;
}

export interface ScrapeResult {
  url: string;
  title: string;
  charCount: number;
  extractedBy: 'ai' | 'chunk';
  blocks: ScrapeBlock[];
}

/** Convierte HTML crudo en Markdown limpio. */
export interface IExtractor {
  extract(html: string): { title: string; text: string };
}

/** Abre la URL con un navegador y devuelve el HTML renderizado. */
export interface IPageScraper {
  scrape(url: string): Promise<{ title: string; html: string }>;
}

/** Divide el Markdown en bloques RAG. */
export interface ISegmenter {
  segment(title: string, markdown: string): Promise<ScrapeBlock[]>;
}
