# Changelog

## [1.1.0] — 2026-07-18

### Novedades

- **Math-ais — visión UI**: comparación de capturas con golden screenshots del dashboard (`public/assets/platform-ui-ref/`).
- **Math-ais — navegación SPA**: botones Sí/No para moverse entre secciones del panel sin recarga.
- **Snapshot de agente**: contexto en vivo en `/dashboard/agents/[id]` (MCP, RAG, FAQs, plan, recomendaciones).
- **Widget dual bundle**: `widget.js` público (`AgentFlowhub`) vs `assist.js` interno (`__BIV`).
- **Stream MCP directo**: ruta `stream-direct-mcp` en chat SSE con trazas de latencia.
- **Dev local**: bypass de rate limits y cuotas en desarrollo.

### Correcciones

- Build Vercel: `widget.js` sin `__BIV` (verify-build).
- Tipo `WidgetChatLatencyPath` incluye `stream-direct-mcp`.
- `window.__BIV.init` opcional antes de cargar `assist.js`.

### Release

- Tag: [v1.1.0](https://github.com/SUSANO-O/platform.quinini/releases/tag/v1.1.0)
