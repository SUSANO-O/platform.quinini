# Checklist de variables de entorno — producción (botiva.space)

Lista de **nombres** de variables por servicio. **No incluye valores** — revísalas en el panel de cada hosting (Vercel, Railway, Render, etc.).

## 1. Landing (`agent-flow-landing` → Vercel)

Proyecto: dominio público **https://botiva.space**

### Obligatorias para widget chat

| Variable | Para qué |
|----------|----------|
| `MONGODB_URI` | Base `agentflowhub_landing` (widgets, agentes, tokens `wt_*`) |
| `JWT_SECRET` | Sesiones del dashboard |
| `NEXT_PUBLIC_APP_URL` | Origen público (`https://botiva.space`) |
| `AGENTFLOWHUB_URL` | URL **server-side** del proxy de chat → AgentFlowhub (no la landing) |
| `HUB_TO_LANDING_SECRET` | HMAC landing ↔ AgentFlowhub; mismo valor en AgentFlowhub |
| `BACKEND_URL` | URL pública de AIBackHub (inferencia directa, MCP, catálogo) |
| `AIBACKHUB_API_KEY` | Debe coincidir con `API_KEY` en AIBackHub |
| `AIBACKHUB_TENANT_ID` | Típico: `default` |

### Recomendadas en producción

| Variable | Para qué |
|----------|----------|
| `REDIS_URL` + `REDIS_TOKEN` | Rate limit distribuido (Upstash); sin esto, límites solo por instancia |
| `TRUSTED_PROXY_COUNT` | `1` en Vercel/Cloudflare |
| `VERTEX_GEMINI_API_KEY` | RAG/embeddings en landing si procesas documentos aquí |
| `GEMINI_API_KEY` | Alternativa Google AI si no usas solo Vertex key |
| `BLOB_READ_WRITE_TOKEN` | Subida RAG >4 MB en Vercel |
| `CRON_SECRET` | Jobs internos (`/api/internal/*`) |

### Pagos / email (si aplica)

| Variable |
|----------|
| `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` |
| `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_GROWTH`, `STRIPE_PRICE_BUSINESS` |
| `LEMONSQUEEZY_*` (si checkout COP) |
| `RESEND_API_KEY`, `EMAIL_FROM` |

### Cómo verificar en Vercel

1. Project → **Settings** → **Environment Variables**
2. Filtra por `AGENTFLOWHUB`, `BACKEND`, `HUB_TO`, `AIBACKHUB`, `MONGODB`
3. Confirma que existen en **Production** (no solo Preview)
4. Tras cambios: **Redeploy** sin cache

### Smoke test post-deploy

```bash
cd agent-flow-landing
BASE_URL=https://botiva.space node --env-file=.env scripts/widget-chat-smoke.mjs
```

Respuesta OK = `reply` con texto real y **sin** `code: AGENT_COOLDOWN`.

---

## 2. AIBackHub (motor IA, Express)

Puerto local `9003`. En prod: URL que apunta `BACKEND_URL` de landing y AgentFlowhub.

### Críticas para Gemini / widget

| Variable | Valor recomendado | Notas |
|----------|-------------------|-------|
| `MONGODB_URI` | Base `agentflow` | Agentes hub, `model_catalog`, RAG |
| `API_KEY` | (secreto) | Mismo que `AIBACKHUB_API_KEY` en landing |
| `VERTEX_GEMINI_API_KEY` | (secreto) | API Google AI; prueba `gemini-2.5-flash` |
| `VERTEX_GEMINI_MODEL` | `gemini-2.5-flash` | **No** usar `*-flash-lite-preview` retirados |
| `MCP_ORCHESTRATOR_MODEL` | `gemini-2.5-flash` | Orquestador MCP / triaje |
| `GEMINI_MCP_ORCHESTRATOR_MODEL` | `gemini-2.5-flash` | Alias en algunos despliegues |

### Otras habituales

| Variable |
|----------|
| `PINECONE_API_KEY`, `PINECONE_INDEX_NAME`, `PINECONE_HOST` |
| `GEMINI_EMBEDDING_MODEL`, `GEMINI_EMBEDDING_DIMENSIONS` |
| `ADMIN_API_KEY` (admin catálogo; landing puede usar `AIBACKHUB_ADMIN_KEY`) |
| `HUB_TO_LANDING_SECRET` (sync agentes → landing) |
| `MCP_ENABLED_INTEGRATIONS`, presets HubSpot/Gmail/Slack |

### Verificación rápida

```bash
# Desde agent-flow-landing con BACKEND_URL apuntando a prod o local
MODEL=gemini-2.5-flash node --env-file=.env scripts/test-aibackhub-model.mjs
```

Debe responder **HTTP 200** con texto en `data.reply`.

---

## 3. AgentFlowhub (proxy widget → AIBackHub)

Puerto local `9002` (API) / `9010` (UI).

| Variable | Para qué |
|----------|----------|
| `MONGODB_URI` | Misma base `agentflow` que AIBackHub |
| `BACKEND_URL` | URL de AIBackHub |
| `HUB_TO_LANDING_SECRET` | Igual que landing |
| `LANDING_INTERNAL_URL` | URL base landing (`https://botiva.space`) para validar `wt_*` |
| `VERTEX_GEMINI_API_KEY` | Si el hub llama Gemini directamente en algún path |

El mensaje **“servicio limitado o saturado”** con `cooldownKind: backend_error_rate_limited` viene de **AgentFlowhub** cuando Google devuelve 429/errores repetidos — no es rate limit de la landing.

---

## 4. Catálogo de modelos (`model_catalog`)

Si `inspect-widget` muestra `catalog.enabled: false` para el modelo del agente:

```bash
cd agent-flow-landing
npm run enable:model-catalog
# o solo dry-run:
DRY_RUN=1 npm run enable:model-catalog
```

Modelos típicos a habilitar: `gemini-2.5-flash` (y `vx/gemini-2.5-flash` si usas prefijo Vertex).

---

## 5. Matriz de coherencia (errores frecuentes)

| Síntoma | Revisar |
|---------|---------|
| `AGENTFLOWHUB_URL_MISSING` | Falta `AGENTFLOWHUB_URL` en Vercel |
| `HUB_CHAT_PROXY_LOOP` | `AGENTFLOWHUB_URL` = dominio de la landing |
| `WIDGET_CHAT_FAILED` + `no longer available` | `VERTEX_GEMINI_MODEL` obsoleto en AIBackHub prod |
| `AGENT_COOLDOWN` + `backend_error_rate_limited` | Cuota Google / modelo Pro sin billing; esperar cooldown |
| `AGENT_COOLDOWN` + `landing_ip` / `landing_agent` | Rate limit landing; configurar Redis o reducir pruebas |
| Chat OK local, falla prod | Deploy landing sin inferencia directa o env `BACKEND_URL` vacío en Vercel |
| UI muestra modelo distinto a Mongo | Recargar dashboard; GET `/api/agents/:id` fusiona con hub |

---

## 6. Orden de deploy recomendado

1. AIBackHub: env `VERTEX_GEMINI_MODEL` + redeploy
2. Catálogo: `npm run enable:model-catalog`
3. AgentFlowhub: redeploy si cambió secret o BACKEND_URL
4. Landing (Vercel): env + redeploy con código de inferencia directa
5. Smoke: `BASE_URL=https://botiva.space npm run test:widget:smoke`
