/** Lectura de páginas web para Math (marketing) — precios dinámicos desde URL pública. */
export const MATH_MARKETING_WEB_FETCH_TOOL_ID = 'mcp:webSearch:web_fetch_page' as const;

export const MATH_MARKETING_MCP_USAGE_HINT = `
Precios y planes BotIvA:
1) Ante cualquier pregunta de precio, plan o comparación, invoca **web_fetch_page** con la URL oficial de precios del contexto (INTERNAL_MARKETING_PRICING_URL).
2) Responde SOLO con los datos devueltos por esa lectura (USD/mes, conversaciones, features).
3) No uses web_search ni inventes cifras. Si la lectura falla, dilo y remite a /pricing en el navegador.
`.trim();

export function mathMarketingMcpToolIds(): string[] {
  return [MATH_MARKETING_WEB_FETCH_TOOL_ID];
}
