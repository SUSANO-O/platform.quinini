# Troubleshooting del widget embebido

Guía para diagnosticar fallos del chat del SDK (`widget.js`) cuando la landing hace de proxy hacia AgentFlowhub y AIBackHub.

## Cadena de la petición

```
widget.js  →  POST /api/widget/chat  (landing)
          →  POST /api/widget/chat  (AgentFlowhub)
          →  POST /api/models / agent-farm  (AIBackHub)
          →  generativelanguage.googleapis.com
```

Cada eslabón puede devolver un error distinto. El campo **`details`** en la respuesta JSON de la landing suele contener el mensaje real de Google o del hub.

## Error `WIDGET_CHAT_FAILED`

Respuesta típica:

```json
{
  "error": "El agente no pudo responder ahora…",
  "code": "WIDGET_CHAT_FAILED",
  "requestId": "…",
  "details": "This model models/gemini-3.1-flash-lite-preview is no longer available…"
}
```

### Causa más frecuente: modelo obsoleto en AIBackHub (no en Mongo del agente)

El agente en Mongo puede tener `vx/gemini-3.1-pro-preview` y aun así fallar si **AIBackHub en producción** usa otro modelo como fallback:

1. Variable **`VERTEX_GEMINI_MODEL`** en el despliegue de AIBackHub apuntando a un preview retirado.
2. Binario desplegado con **`DEFAULT_VERTEX_GEMINI_MODEL`** antiguo (redeploy necesario).
3. Modo **auto** en AgentFlowhub que no reenvía el modelo del agente y cae en el default del motor.

**Acciones:**

1. En el hosting de AIBackHub, fijar `VERTEX_GEMINI_MODEL=gemini-2.5-flash` (o un modelo listado en `/api/models/available`).
2. Redeploy de AIBackHub con el código actual (`DEFAULT_VERTEX_GEMINI_MODEL = gemini-2.5-flash`).
3. En local/prod Mongo:
   ```bash
   cd agent-flow-landing
   npm run migrate:vertex-models
   npm run sync:vertex-catalog
   ```
4. En AIBackHub:
   ```bash
   npm run sync:vertex-catalog
   ```

Algunos IDs siguen apareciendo en el listado de la API Gemini pero **fallan en `generateContent`** (p. ej. `gemini-3.1-flash-lite-preview`). El script `migrate-obsolete-vertex-models.mjs` los trata como rotos aunque sigan listados.

### Comprobar en terminal (sin CSP del navegador)

```powershell
curl.exe -s -X POST "https://quinini.online/api/widget/chat" `
  -H "Content-Type: application/json" `
  -d "{\"agentId\":\"AGENT_MONGO_ID\",\"message\":\"hola\",\"token\":\"wt_…\",\"widgetId\":\"WIDGET_ID\",\"sessionId\":\"diag1\"}"
```

Lee siempre **`details`** además de `code`.

## Otros códigos

| Código | Significado | Qué revisar |
|--------|-------------|-------------|
| `AGENTFLOWHUB_URL_MISSING` | Falta URL del hub en Vercel | `AGENTFLOWHUB_URL` en proyecto landing |
| `HUB_CHAT_PROXY_FAILED` | Landing no alcanza AgentFlowhub | Hub caído, URL incorrecta, firewall |
| `HUB_CHAT_PROXY_LOOP` | `AGENTFLOWHUB_URL` = dominio de la landing | Separar URLs landing / hub |
| `AGENT_COOLDOWN` | Rate limit / cooldown del agente | Esperar o revisar límites del plan |
| `502` en non-stream | Timeout o hub no responde | Logs AgentFlowhub + AIBackHub |

## Inspección en Mongo

Base **landing**: `agentflowhub_landing`  
Base **hub / motor**: `agentflow`

```powershell
cd agent-flow-landing
node scripts/inspect-widget.mjs 6a03a54c4f69fa7fa9027170
```

El script muestra widget, agente landing, agente hub y si los modelos coinciden (`modelMatch`).

**Importante:** el token del widget es **`afhubToken`** (prefijo `wt_`), no `publicToken`.

### Widget de referencia: MatIAs Auto Sales Hub

| Campo | Valor |
|-------|-------|
| Widget ID | `6a03a54c4f69fa7fa9027170` |
| Agente | `69d5084c78e0af3d5536fe95` |
| Hub ID | `ventas` |
| Modelo esperado | `vx/gemini-3.1-pro-preview` |
| RAG | habilitado en agente landing |

Estado verificado en Mongo (2026-05): landing y hub alineados en modelo; chat en prod fallaba porque AIBackHub seguía invocando `gemini-3.1-flash-lite-preview` vía fallback de entorno/código desplegado, no por desincronización del documento del agente.

## Checklist rápido

- [ ] `AGENTFLOWHUB_URL` accesible desde el servidor de la landing
- [ ] AIBackHub responde (`GET /api/models/available`)
- [ ] `VERTEX_GEMINI_API_KEY` válida en AIBackHub prod
- [ ] `VERTEX_GEMINI_MODEL` ≠ previews retirados
- [ ] Agente landing `syncStatus: synced` y `model` = hub `agents.model`
- [ ] Widget `active: true` y origen permitido si `allowedOrigins` está definido
- [ ] Tras cambiar modelo: guardar agente en dashboard o `npm run migrate:vertex-models`

## Listar modelos Gemini (API)

Desde terminal (la consola del navegador en quinini.online puede bloquearse por CSP):

```powershell
$key = (Get-Content .env | Where-Object { $_ -match '^VERTEX_GEMINI_API_KEY=' }) -replace '^VERTEX_GEMINI_API_KEY=',''
curl.exe -s "https://generativelanguage.googleapis.com/v1beta/models?key=$key"
```

Alternativa en la app autenticada: `GET /api/models/available`.

## Tests automatizados

Guía completa: **[docs/widget-testing.md](./widget-testing.md)**.

```powershell
# Smoke rápido (JSON + SSE)
npm run test:widget:smoke

# Solo motor AIBackHub
npm run test:aibackhub:model

# Suite E2E (22 casos)
$env:BASE_URL = "https://quinini.online"
npm run test:widget
```
