/**
 * Scrapers de página — dos implementaciones intercambiables:
 *
 *  FirecrawlScraper  → API externa (Vercel Hobby, producción sin Chrome)
 *                      Devuelve Markdown limpio directamente.
 *                      Requiere FIRECRAWL_API_KEY.
 *
 *  PuppeteerScraper  → Chrome local / Railway / VPS con Chrome instalado.
 *                      Devuelve HTML crudo para procesar con Turndown.
 *                      No funciona en Vercel Hobby (timeout 10s).
 */

import { existsSync } from 'fs';
import type { IPageScraper } from './types';

// ── Jina AI Reader — gratis, sin cuenta, sin API key ─────────────────────────
// Uso: GET https://r.jina.ai/{url} → devuelve Markdown limpio del contenido principal.

export class JinaScraper implements IPageScraper {
  async scrape(url: string): Promise<{ title: string; html: string; isMarkdown?: boolean }> {
    const jinaUrl = `https://r.jina.ai/${url}`;

    const res = await fetch(jinaUrl, {
      headers: {
        'Accept':          'text/plain',
        'X-Return-Format': 'markdown',
        'X-No-Cache':      'true',
      },
      signal: AbortSignal.timeout(45_000),
    });

    if (!res.ok) {
      throw new Error(`Jina Reader error ${res.status}: ${res.statusText}`);
    }

    const markdown = await res.text();

    if (!markdown || markdown.trim().length < 80) {
      throw new Error('Jina Reader no devolvió contenido suficiente.');
    }

    // Jina incluye el título en la primera línea: "Title: ..."
    const titleMatch = markdown.match(/^Title:\s*(.+)/m);
    const title = titleMatch?.[1]?.trim() ?? url;

    // Elimina bloque de metadatos que Jina agrega al inicio
    const content = markdown
      .replace(/^(Title|URL Source|URL|Published Time|Description|Markdown Content):.*\n?/gim, '')
      .replace(/^[=\-]{3,}\s*$/gm, '')
      .trim();

    return { title, html: content, isMarkdown: true };
  }
}

// ── Puppeteer (local / VPS) ───────────────────────────────────────────────────

const LOCAL_CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  `${process.env.LOCALAPPDATA ?? ''}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env.LOCALAPPDATA ?? ''}\\Google\\Chrome SxS\\Application\\chrome.exe`,
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

const BLOCKED_RESOURCES = new Set(['image', 'font', 'media', 'stylesheet']);

async function resolveChrome(): Promise<{ executablePath: string; args: string[] }> {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH, args: [] };
  }

  if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
    try {
      const chromium = await import('@sparticuz/chromium');
      const executablePath = await chromium.default.executablePath();
      return { executablePath, args: chromium.default.args };
    } catch {
      // no disponible — intenta Chrome local
    }
  }

  for (const p of LOCAL_CHROME_PATHS) {
    if (p && existsSync(p)) return { executablePath: p, args: [] };
  }

  throw new Error(
    'Chrome no encontrado. Define PUPPETEER_EXECUTABLE_PATH en .env, ' +
    'o usa FIRECRAWL_API_KEY para scraping sin Chrome.'
  );
}

export class PuppeteerScraper implements IPageScraper {
  async scrape(url: string): Promise<{ title: string; html: string }> {
    const puppeteer = await import('puppeteer-core');
    const { executablePath, args } = await resolveChrome();

    const browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: [
        ...args,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--window-size=1280,900',
      ],
    });

    try {
      const page = await browser.newPage();

      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      );
      await page.setViewport({ width: 1280, height: 900 });
      await page.setExtraHTTPHeaders({ 'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8' });

      await page.setRequestInterception(true);
      page.on('request', (req) => {
        if (BLOCKED_RESOURCES.has(req.resourceType())) req.abort();
        else req.continue();
      });

      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30_000 });
      await page
        .waitForFunction(() => document.body?.innerText?.trim().length > 50, { timeout: 10_000 })
        .catch(() => undefined);

      const title = await page.title();
      const html  = await page.content();
      return { title, html };
    } finally {
      await browser.close();
    }
  }
}
