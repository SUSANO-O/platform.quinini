/**
 * Recorrido multi-página sobre un sitio: a partir de una URL inicial, descubre enlaces internos,
 * prioriza las páginas más útiles (nosotros, productos, precios, servicios, FAQ, contacto) y scrapea
 * varias, combinando el texto. Convierte el scraper de 1 página en "aprende del sitio".
 *
 * `discoverLinks` es puro y testeable. `crawlSite` reúsa `scrape()` por página (Jina/Chromium + IA).
 */

import { scrape } from './index';

/** Palabras que marcan páginas de alto valor para un agente de negocio (es/en). */
const PRIORITY_KEYWORDS = [
  'about', 'nosotros', 'quienes', 'empresa', 'company',
  'product', 'producto', 'catalog', 'catalogo', 'catálogo', 'tienda', 'shop',
  'service', 'servicio', 'soluciones', 'solutions',
  'price', 'precio', 'plan', 'planes', 'pricing', 'tarifas',
  'faq', 'preguntas', 'ayuda', 'help',
  'contact', 'contacto', 'menu', 'carta',
];

/** Extensiones/paths que NO son contenido útil. */
const SKIP_EXT = /\.(jpg|jpeg|png|gif|svg|webp|ico|css|js|pdf|zip|mp4|mp3|woff2?|ttf|xml|json)(\?|$)/i;
const SKIP_PATH = /(login|signin|signup|register|logout|cart|checkout|account|wp-admin|wp-login|privacy|terminos|terms|cookie)/i;

/**
 * Extrae enlaces internos (mismo host) de un HTML, normalizados, deduplicados y priorizados.
 * Devuelve rutas absolutas. Puro y testeable.
 */
export function discoverLinks(html: string, baseUrl: string, max = 20): string[] {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return [];
  }
  const found = new Map<string, number>(); // url → score (mayor = más prioritario)
  const re = /<a\b[^>]*\bhref\s*=\s*["']([^"'#]+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1].trim();
    if (!raw || raw.startsWith('mailto:') || raw.startsWith('tel:') || raw.startsWith('javascript:')) continue;
    let u: URL;
    try {
      u = new URL(raw, base);
    } catch {
      continue;
    }
    if (u.host !== base.host) continue; // solo mismo sitio
    if (SKIP_EXT.test(u.pathname) || SKIP_PATH.test(u.pathname)) continue;
    u.hash = '';
    const key = u.toString().replace(/\/$/, '');
    if (key === base.toString().replace(/\/$/, '')) continue; // la propia inicial
    const lower = key.toLowerCase();
    const score = PRIORITY_KEYWORDS.reduce((s, kw) => (lower.includes(kw) ? s + 1 : s), 0);
    if (!found.has(key) || (found.get(key) ?? 0) < score) found.set(key, score);
  }
  return [...found.entries()]
    .sort((a, b) => b[1] - a[1]) // prioritarias primero
    .slice(0, max)
    .map(([u]) => u);
}

export type CrawlResult = { title: string; text: string; pages: string[]; charCount: number };

/** Hace una petición simple para descubrir enlaces (sin datos personales en headers). */
async function fetchHtml(url: string, timeoutMs: number): Promise<string> {
  const res = await fetch(url, {
    headers: { 'user-agent': 'BotIvA-Scraper/1.0', accept: 'text/html' },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: 'follow',
  });
  if (!res.ok) return '';
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('html')) return '';
  return (await res.text()).slice(0, 2_000_000);
}

/**
 * Recorre el sitio desde `startUrl`: scrapea la inicial + hasta `maxPages-1` páginas internas
 * priorizadas, y combina el texto (con cabecera por página). Best-effort: salta las que fallen.
 */
export async function crawlSite(
  startUrl: string,
  opts: { maxPages?: number; perPageCap?: number; totalCap?: number } = {},
): Promise<CrawlResult> {
  const maxPages = Math.max(1, Math.min(opts.maxPages ?? 8, 15));
  const perPageCap = opts.perPageCap ?? 25_000;
  const totalCap = opts.totalCap ?? 120_000;

  // 1. Descubrir enlaces desde el HTML crudo de la inicial.
  let links: string[] = [];
  try {
    const html = await fetchHtml(startUrl, 12_000);
    if (html) links = discoverLinks(html, startUrl, 30);
  } catch {
    /* sin descubrimiento → solo la inicial */
  }

  const queue = [startUrl, ...links].slice(0, maxPages);
  const parts: string[] = [];
  const done: string[] = [];
  let title = '';
  let total = 0;

  for (const url of queue) {
    if (total >= totalCap) break;
    try {
      const r = await scrape(url);
      if (!title) title = r.title;
      const text = (r.blocks ?? [])
        .map((b) => (b.title ? `## ${b.title}\n` : '') + (b.content ?? ''))
        .join('\n\n')
        .trim()
        .slice(0, perPageCap);
      if (text.length < 40) continue;
      parts.push(`# ${r.title || url}\n(${url})\n\n${text}`);
      done.push(url);
      total += text.length;
    } catch {
      /* salta páginas que fallen */
    }
  }

  const combined = parts.join('\n\n---\n\n').slice(0, totalCap);
  return { title: title || startUrl, text: combined, pages: done, charCount: combined.length };
}
