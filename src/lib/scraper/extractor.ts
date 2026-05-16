/**
 * MarkdownExtractor — responsabilidad única: HTML → Markdown limpio.
 *
 * Sin Readability, sin jsdom, sin heurísticas de clases.
 * Solo limpieza básica de tags no-textuales + Turndown.
 * La inteligencia de "qué es contenido útil" la delega a Gemini.
 */

import TurndownService from 'turndown';
import type { IExtractor } from './types';

// ── Turndown configurado para RAG ─────────────────────────────────────────────

function buildTurndown(): TurndownService {
  const td = new TurndownService({
    headingStyle:     'atx',
    bulletListMarker: '-',
    codeBlockStyle:   'fenced',
  });

  // Tablas → Markdown (Turndown no las soporta por defecto)
  td.addRule('table', {
    filter: 'table',
    replacement(_content, node) {
      const rows = Array.from((node as HTMLElement).querySelectorAll('tr'));
      if (rows.length === 0) return '';
      const lines: string[] = [];
      rows.forEach((row, i) => {
        const cells = Array.from(row.querySelectorAll('th, td'))
          .map((c) => (c.textContent ?? '').replace(/\n/g, ' ').trim());
        lines.push(`| ${cells.join(' | ')} |`);
        if (i === 0) lines.push(`| ${cells.map(() => '---').join(' | ')} |`);
      });
      return `\n\n${lines.join('\n')}\n\n`;
    },
  });

  // Elimina tags que no aportan texto
  td.remove(['script', 'style', 'noscript', 'iframe', 'button', 'input', 'select', 'meta', 'link']);

  // Imágenes → vacío (evita `![alt](cdn-url)` que es ruido puro para Gemini)
  td.addRule('strip-images', {
    filter: 'img',
    replacement: () => '',
  });

  // Links sin texto (solo href) → solo el texto visible, sin la URL
  td.addRule('clean-links', {
    filter: 'a',
    replacement: (content) => content.trim() || '',
  });

  return td;
}

const td = buildTurndown();

// Tags que generan ruido puro antes de Turndown
const STRIP_TAGS = /<(script|style|noscript|svg|iframe)[^>]*>[\s\S]*?<\/\1>/gi;

function extractTitle(html: string): string {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return (m?.[1] ?? '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim()
    || 'Sin título';
}

// ── Extractor ─────────────────────────────────────────────────────────────────

export class MarkdownExtractor implements IExtractor {
  extract(html: string): { title: string; text: string } {
    const title   = extractTitle(html);
    const cleaned = html.replace(STRIP_TAGS, ' ');
    const markdown = td.turndown(cleaned);

    const normalized = markdown
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return { title, text: normalized };
  }
}
