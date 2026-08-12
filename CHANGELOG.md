# Changelog

## [1.2.0] — 2026-08-12

### Novedades

- **Dashboard B/N**: paleta negro/blanco en panel, gráficos monocromos y métricas más legibles.
- **Botones grises**: primarios en gris (`#525252`) estilo app moderna (píldora, sin sombras fuertes).
- **Widget 1.6.81**: más espacio entre mensajes, burbujas premium, composer refinado.
- **Borde arcoíris**: feedback más intenso en input y tarjeta “consultando…”.
- **Nav móvil**: logo recortado, safe-area y offset del asistente interno.
- **Tema MUI dashboard**: `dashboard-mui-theme.ts` + `ThemeProvider` en shell.
- **Date range picker** y hero de suscripción alineados al nuevo estilo.

### Correcciones

- Gráficos y pools del home en escala de grises (sin colores de marca landing).
- Widget assist no solapa la barra inferior en móvil.

### Rollback (volver atrás en minutos)

1. **Vercel** → proyecto `platform-quinini` → **Deployments** → elegir el deploy anterior a `v1.2.0` → **Promote to Production**.
2. **Git** (alternativa): `git checkout v1.1.0` y redeploy, o revert del merge/commit de release.
3. **Widget embebido**: los sitios cargan `widget.js?v=1.6.81`; al volver atrás el snippet vuelve a servir la versión anterior vía `?v=` en el deploy previo (sin migración de datos).
4. No hay cambios destructivos en Mongo; el rollback es seguro.

### Release

- Tag: [v1.2.0](https://github.com/SUSANO-O/platform.quinini/releases/tag/v1.2.0)

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
