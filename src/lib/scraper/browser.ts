/**
 * PuppeteerScraper — responsabilidad única: abrir Chrome y devolver el HTML renderizado.
 * Devuelve HTML completo; la extracción de texto es responsabilidad de IExtractor.
 */

import type { IPageScraper } from './types';

const CHROME_PATH =
  process.env.PUPPETEER_EXECUTABLE_PATH ??
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const BLOCKED_RESOURCES = new Set(['image', 'font', 'media', 'stylesheet']);

export class PuppeteerScraper implements IPageScraper {
  async scrape(url: string): Promise<{ title: string; html: string }> {
    const puppeteer = await import('puppeteer-core');

    const browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
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

      // Espera a que haya contenido visible
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
