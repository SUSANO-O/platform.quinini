import { describe, expect, it } from 'vitest';
import { sanitizeHubReplyBody, stripLeakedToolCalls, TOOL_LEAK_FALLBACK_REPLY } from '@/lib/widget-reply-tool-leak';

describe('stripLeakedToolCalls', () => {
  it('caso real de Navi App (20-oct): solo emoji + bloque json → aviso amable', () => {
    const leaked =
      '💸\n```json\n{"tool_call": {"name": "mysql_query", "arguments": {"query": "SELECT n_marco_bici FROM Bicicletas WHERE b_activa = 1"}}}\n```';
    const r = stripLeakedToolCalls(leaked);
    expect(r.leaked).toBe(true);
    expect(r.text).toBe(TOOL_LEAK_FALLBACK_REPLY);
    expect(r.text).not.toContain('SELECT');
  });

  it('conserva el texto alrededor de la llamada filtrada', () => {
    const r = stripLeakedToolCalls(
      'Voy a revisar tus vehículos.\n{"name": "mysql_query", "arguments": {"query": "SELECT 1"}}\nUn momento.',
    );
    expect(r.leaked).toBe(true);
    expect(r.text).toBe('Voy a revisar tus vehículos.\n\nUn momento.');
  });

  it('bloque sin cerrar (respuesta cortada) también se quita', () => {
    const r = stripLeakedToolCalls('Claro.\n```json\n{"functionCall": {"name": "x", "args": {"q": "SELECT');
    expect(r).toEqual({ text: 'Claro.', leaked: true });
  });

  it('respuestas normales, incluso con JSON que no es una herramienta, no se tocan', () => {
    const normal = 'Tu moto está en Chapinero. Config: ```json\n{"color": "rojo"}\n```';
    expect(stripLeakedToolCalls(normal)).toEqual({ text: normal, leaked: false });
    expect(stripLeakedToolCalls('Hola, ¿en qué te ayudo?')).toEqual({ text: 'Hola, ¿en qué te ayudo?', leaked: false });
  });

  it('llaves dentro de strings no confunden el recorte', () => {
    const r = stripLeakedToolCalls('Listo. {"tool_call": {"name": "q", "arguments": {"text": "a } b {"}}} Fin.');
    expect(r.text).toBe('Listo.  Fin.');
  });
});

describe('sanitizeHubReplyBody', () => {
  it('filtra la fuga dentro del JSON serializado del hub (comillas escapadas)', () => {
    const body = JSON.stringify({
      reply: '💸\n```json\n{"tool_call": {"name": "mysql_query", "arguments": {"query": "SELECT 1"}}}\n```',
      toolsUsed: [],
    });
    const out = JSON.parse(sanitizeHubReplyBody(body)) as { reply: string; toolsUsed: unknown[] };
    expect(out.reply).toBe(TOOL_LEAK_FALLBACK_REPLY);
    expect(out.toolsUsed).toEqual([]);
  });

  it('deja intacto un cuerpo sin fuga o que no es JSON', () => {
    const ok = JSON.stringify({ reply: 'Hola, los arguments de tu caso son claros.' });
    expect(sanitizeHubReplyBody(ok)).toBe(ok);
    expect(sanitizeHubReplyBody('no json arguments')).toBe('no json arguments');
  });
});
