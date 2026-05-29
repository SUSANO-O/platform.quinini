# Multi-webhook por agente — arquitectura completa

Este documento cubre cómo funciona la feature multi-webhook (que cada agente pueda tener N webhooks, cada uno expuesto como una herramienta independiente al LLM), qué archivos se tocaron, los bugs encontrados en el camino y los flujos end-to-end.

---

## 1. Resumen

Antes: un agente tenía **un único webhook** (`tools[].config.url`) y el LLM no sabía cuándo invocarlo más allá de su system prompt.

Ahora: un agente tiene **N webhooks** en `tools[].config.webhooks[]`, cada uno con `{id, name, description, url, secret}`. Cada webhook se expone a Gemini como una **función LLM separada** (`wh_<name>`) con la **descripción que el usuario escribe** — Gemini elige cuál llamar según el contexto de la conversación. Cada llamada dispara un POST JSON real al endpoint correspondiente (típicamente un flow de n8n / Zapier / API propia).

---

## 2. Schema en MongoDB

```js
// agent.tools (Schema.Types.Mixed — acepta cualquier estructura)
[{
  toolId: 'webhook',
  config: {
    webhooks: [
      {
        id: 'wh_xxxx',                // ID estable interno
        name: 'leer_correos',         // snake_case, sanitizado, único por agente
        description: 'Cuando el usuario pida …', // lo que Gemini lee para decidir
        url: 'https://n8n.../webhook/abc',
        secret: 'opcional'            // Bearer token o HMAC
      },
      { id: 'wh_yyyy', name: 'guardar_sheet', description: '…', url: '…' }
    ]
  }
}]
```

**Compatibilidad legacy:** si solo existe `config.url` (formato viejo de un único webhook), el helper `extractWebhookEntries()` lo normaliza como una entrada única con `name='webhook'`.

---

## 3. Tool IDs y exposición al LLM (AIBackHub)

Cada entrada del array genera:

| | |
|---|---|
| **Tool ID MCP** | `mcp:landing:wh:<name>` (constante `LANDING_WEBHOOK_TOOL_PREFIX`) |
| **Function name Gemini** | `wh_<name>` (max 60 chars) |
| **Description** | la que escribió el usuario + nota "Argumento: payload (objeto JSON)" |
| **Input schema** | `{ payload: object (required) }` |

Cuando Gemini llama `wh_leer_correos({payload: {...}})`, AIBackHub:
1. Mapea la función al `toolId`
2. Resuelve el webhook entry desde `landing.clientagents` (vía `resolveLandingWebhookEntryByName`)
3. Ejecuta `executeLandingWebhookPost()` → POST JSON real
4. El response JSON del webhook vuelve a Gemini como `tool result`
5. Gemini sintetiza una respuesta natural para el usuario

---

## 4. Archivos modificados

### `agent-flow-landing`

| Archivo | Cambio |
|---|---|
| `src/lib/agent-webhooks.ts` *(nuevo)* | Tipo `WebhookEntry`, helpers `extractWebhookEntries`, `extractAgentWebhooks`, `agentHasAnyWebhook`, `sanitizeWebhookName`, `generateWebhookId` |
| `src/lib/widget-chat-direct-mcp.ts` | `clientAgentHasWebhookUrl` usa `agentHasAnyWebhook` (detecta ambos formatos) |
| `src/lib/aibackhub-sync.ts` | `normalizeLandingTools` preserva `config` sin aplastar (era el bug que rompía webhooks[] al sync al hub) |
| `src/app/api/agents/[id]/route.ts` | GET sync from hub: merge con tools existentes (preserva webhooks aunque el hub no los tenga). PATCH: añadido `agent.markModified('tools')` para Mixed schema |
| `src/app/api/agents/route.ts` | GET list endpoint: mismo merge pattern |
| `src/app/api/internal/sync-from-hub/route.ts` | Endpoint que recibe push desde AgentFlowhub: mismo merge pattern |
| `src/app/api/agents/[id]/test-webhook/route.ts` | Acepta `{webhookId}` en body para probar un webhook específico |
| `src/app/dashboard/agents/[id]/page.tsx` | UI nueva en pestaña Herramientas — cards de webhook con name/description/URL/secret + botón "Probar" individual. Tipo `ToolConfig.config` cambió a `Record<string, unknown>` |
| `src/app/api/widget/chat/stream/route.ts` | **Crítico**: detecta agentes con webhooks → devuelve HTTP 503 → widget cae al non-stream automáticamente (ver §6) |
| `scripts/widget/core.js` | Botón **⋮ Ajustes** en header con dropdown **🗑️ Borrar conversación** (confirma antes de limpiar) |
| `public/widget.js`, `public/assist.js` | Builds generados por `npm run build:widget` |
| `docs/n8n-webhook-test.json` *(nuevo)* | Workflow n8n importable para validar el pipeline end-to-end |

### `AIBackHub`

| Archivo | Cambio |
|---|---|
| `src/lib/landing-webhook-config.ts` | Nuevo tipo `LandingWebhookEntry`, función `resolveLandingWebhookEntries()` (devuelve array), `resolveLandingWebhookEntryByName()`, helper `webhookEntryToolId()`, constante `LANDING_WEBHOOK_TOOL_PREFIX`. La legacy `resolveLandingWebhookConfig` envuelve la nueva |
| `src/lib/gemini-mcp-widget-chat.ts` | `mergeEnabledToolIdsWithMcpConnections` añade un tool-id por webhook; `toolDefs` expone cada webhook como función LLM independiente con su descripción; ejecución enruta por prefijo `mcp:landing:wh:<name>` al webhook correcto |

---

## 5. Flujos de usuario

### 5.1 Configurar webhooks en un agente

```
Dashboard → Agentes → [agente] → pestaña Herramientas
  └─ activa Webhook
  └─ "Añadir webhook"
       ├─ Nombre interno (snake_case auto-sanitizado)
       ├─ Descripción de la tarea (lo que Gemini lee)
       ├─ URL del webhook
       └─ Secret (opcional)
  └─ "Probar" individual → POST de prueba inmediato
  └─ Repetir N veces
  └─ "Guardar herramientas"
```

### 5.2 Cliente conversa con el widget

```
Cliente escribe "haz un test del webhook"
  └─ Widget → POST /api/widget/chat/stream
       └─ Stream route detecta webhooks configurados → HTTP 503
       └─ Widget catch → fallback automático a /api/widget/chat
  └─ /api/widget/chat → tryServeWidgetChatViaHubMcp → AIBackHub MCP
       └─ Resuelve webhooks → expone cada uno como tool LLM
       └─ Gemini decide invocar wh_prueba_n8n basándose en la descripción
       └─ AIBackHub ejecuta POST real al webhook URL
       └─ Webhook (n8n) responde con JSON
       └─ Gemini sintetiza respuesta natural
  └─ Widget muestra la respuesta
```

Verificación: la respuesta del API incluye `toolsUsed: ["mcp:landing:wh:prueba_n8n"]` y en n8n aparece la ejecución en su pestaña Ejecuciones.

### 5.3 Limpiar conversación desde móvil (sin DevTools)

```
Widget (panel abierto) → header → botón ⋮
  └─ Dropdown se abre
  └─ Tap 🗑️ Borrar conversación
  └─ Diálogo nativo: ¿confirmar?
  └─ OK → vacía historial in-memory, rota sessionId, limpia sessionStorage, muestra welcome
```

**Limitación actual:** solo limpia client-side. Si el agente tiene `persistConversationHistory: true`, el server-side sigue rehidratando el historial desde MongoDB. Ver §7.

---

## 6. El bug del stream endpoint (causa raíz #1 de halucinación)

El widget intenta primero `POST /api/widget/chat/stream` (SSE) y solo cae a `/api/widget/chat` si el stream da error.

**El problema:** `/stream` proxyaba directo a AgentFlowhub vía `fetchHubWidgetChat`. **No pasaba por AIBackHub MCP**. Los webhooks (que son tools MCP) NUNCA llegaban al LLM, así que Gemini hacía role-play: respondía como si hubiera llamado un webhook pero inventaba el URL y el JSON.

**Síntomas típicos:**
- Tests desde curl/PowerShell golpeaban el non-stream → funcionaba (`toolsUsed: [...]` real)
- El widget en el browser halucinaba (`mode: "direct"`, `mcpSkipped: true` en la respuesta)
- El LLM inventaba placeholders tipo `[URL_DEL_WEBHOOK]`, `executionId: "wf_exec_xxx"`, `{"message": "Workflow triggered successfully"}` (← respuesta default de n8n sin "Respond to Webhook" node)

**Fix:** en `/api/widget/chat/stream/route.ts`, antes del streaming, detectar si `agentHasAnyWebhook(ca)` → si sí → devolver HTTP 503 con código `STREAM_NOT_SUPPORTED` → el `catch` del widget cae al non-stream automáticamente, que sí tiene la integración MCP.

---

## 7. El bug del config aplastado (causa raíz #2 — data corruption)

`agent.tools[].config` está declarado como `Schema.Types.Mixed`. Pero 4 rutas distintas que sincronizaban tools tenían el mismo patrón roto:

```ts
for (const [k, v] of Object.entries(x.config)) {
  if (typeof v === 'string') cfg[k] = v;
  else if (v != null) cfg[k] = String(v);  // ← destruye arrays/objetos
}
```

`webhooks: [{...}, {...}]` quedaba como `webhooks: "[object Object]"` (string literal). En cada GET o sync, el array se aplastaba a string y AIBackHub no podía leerlo → no exponía tools → halucinación.

**Las 4 rutas (todas arregladas):**

| Ruta | Dispara cuando | Fix |
|---|---|---|
| `src/app/api/agents/[id]/route.ts` (GET) | Abrir editor del agente; widget hace fetch del agente | Preservar `config` + merge con tools existentes en Mongo (hub gana, claves ausentes se preservan) |
| `src/app/api/agents/[id]/route.ts` (PATCH) | Guardar herramientas desde dashboard | Añadido `agent.markModified('tools')` para que Mongoose detecte cambios en Mixed |
| `src/app/api/agents/route.ts` (GET list) | Listar agentes en el dashboard | Mismo merge pattern |
| `src/app/api/internal/sync-from-hub/route.ts` | AgentFlowhub empuja cambios al landing | Mismo merge pattern |
| `src/lib/aibackhub-sync.ts` (`normalizeLandingTools`) | Landing empuja cambios a AIBackHub | Preservar config sin aplastar |

**Regla:** cualquier nueva ruta que escriba `agent.tools[]` debe:
1. Preservar `config` tal cual (no flattenar a strings)
2. Hacer merge con la versión en Mongo si el upstream no tiene el campo `webhooks`
3. Si usa Mongoose docs (no `updateOne`), llamar `markModified('tools')` tras la asignación

---

## 8. Persistencia server-side de conversaciones (causa raíz #3)

Si el agente tiene `persistConversationHistory: true`, cada turno se guarda en:
- `widgetmessages` — un doc por mensaje
- `conversationsessions` — metadata de la sesión
- `widgetsessioncontexts` — contexto/resumen de la sesión
- `conversationpacks` — packs comprimidos

En la siguiente llamada al chat, el server **reconstruye el historial desde estas colecciones** y lo añade al payload del LLM aunque el cliente envíe `history: []`.

**Combinado con halucinación previa:** si durante un periodo el LLM inventaba tool calls (porque webhooks no estaban expuestos), esos turnos quedan guardados. Después aunque arreglemos el backend, el LLM ve esos turnos viejos en el contexto y continúa el mismo patrón teatral — *in-context learning anclado en un patrón fallido*.

**Reset manual:**
```js
const filter = { $or: [{ widgetId }, { agentId: landing_id }, { agentId: hub_slug }] };
for (const c of ['conversationsessions','widgetmessages','widgetsessioncontexts','conversationpacks']) {
  await db.collection(c).deleteMany(filter);
}
```

**Pendiente / futuro:** que el botón "Borrar conversación" del widget llame a un endpoint server-side que purgue estas colecciones para `visitorId + widgetId`. Sin esto, los clientes no pueden auto-recuperarse de una sesión polucionada.

---

## 9. Cómo verificar end-to-end

```bash
# 1. n8n responde por sí solo
curl -X POST 'https://bright-wrasse.pikapod.net/webhook/agentflow-test' \
  -H 'Content-Type: application/json' \
  -d '{"webhookName":"prueba_n8n","payload":{"name":"test"}}'
# Esperado: HTTP 200 + JSON con "ok":true, "summary":"n8n recibió …", etc.

# 2. Chat backend (debe llamar tool real)
curl -X POST 'https://www.botiva.space/api/widget/chat' \
  -H 'Content-Type: application/json' \
  -H 'X-Widget-Token: wt_xxx' \
  -d '{"message":"dispara una prueba","agentId":"<hub_slug>","history":[]}'
# Esperado: { "reply": "…", "toolsUsed": ["mcp:landing:wh:<name>"], ... }
# Si ves "mode":"direct" + "mcpSkipped":true → no llamó al tool

# 3. Stream endpoint debe forzar fallback
curl -X POST 'https://www.botiva.space/api/widget/chat/stream' \
  -H 'Content-Type: application/json' \
  -H 'X-Widget-Token: wt_xxx' \
  -d '{"message":"dispara una prueba","agentId":"<hub_slug>","history":[]}'
# Esperado: HTTP 503 con SSE error code "STREAM_NOT_SUPPORTED" (porque agente tiene webhooks)

# 4. Estado en MongoDB
# tools[0].config.webhooks debe ser ARRAY, no string "[object Object]"
```

---

## 10. Caching / deploy notes

- Cloudflare cachea `widget.js` (~10-24 min después de deploy). Para verificar deploy nuevo:
  ```bash
  curl -sL 'https://www.botiva.space/widget.js' | grep -c 'afhub-settings-menu'
  # > 0 = nuevo código deployed; 0 = aún cacheado o no deployed
  ```
- `ChunkLoadError` en la consola del browser indica deploy a medias (HTML referenciando chunks que ya no existen). Solución: redeploy fresh en Vercel + purge Cloudflare cache.
- Después de cambios en `scripts/widget/core.js` SIEMPRE: `npm run build:widget` para regenerar `public/widget.js` y `public/assist.js`.

---

## 11. Glosario

| | |
|---|---|
| `wt_…` | Widget Public Token (`afhubToken`) — identifica al widget en la API pública |
| `mcp:landing:wh:<name>` | Tool ID virtual que expone un webhook como herramienta LLM |
| `wh_<name>` | Function name que Gemini ve para invocar un webhook |
| `webhooks[]` | Array de `WebhookEntry` en `tools[i].config` (formato nuevo) |
| `config.url` | Webhook único legacy (formato viejo, soportado por compat) |
| MCP path | Ruta non-stream `/api/widget/chat` que sí expone tools al LLM |
| Stream path | Ruta SSE `/api/widget/chat/stream` que ahora fuerza fallback si hay webhooks |
