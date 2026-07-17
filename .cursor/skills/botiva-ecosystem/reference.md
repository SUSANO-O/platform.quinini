# BotIvA — referencia ampliada (interno, no publicar)

Complemento de `SKILL.md`. Sin valores secretos.

## Docs por repo (fuente)

### platform.quinini
- `README.md`, `docs/prod-env-checklist.md`, `docs/widget-troubleshooting.md`, `docs/widget-testing.md`
- `docs/rag-scraping-system.md`, `docs/multi-webhook.md`, `docs/webhook-escalation-n8n.md`
- `docs/aibackhub-mcp-data-sources.md`, `docs/agente-soporte-camino-trial.md`
- `docs/n8n-*.md`, `docs/analisis-economico-llm-planes.md`
- `taskapp/PLAN-asistentes-internos-landing.md`

### AgentFlowhub
- `README.md` (SDK widget, fases 1–4 Done)
- `docs/api-endpoints.md` (MatIA salud; no es el mapa completo del hub)
- `docs/blueprint.md` (brief producto legacy)

### matias-backend
- `README.md`, `docs/ARCHITECTURE.md` (hexagonal), `docs/FRONTEND.md`
- OpenAPI: `GET /api/openapi`, Swagger `GET /api/docs`
- Health: `GET /health`

### API-REST-AGENT-FLOW
- `README.md`, `docs/API.md`, `docs/BOTIVA-CLI.md`, `docs/DEPLOY_DOCKER_GCP.md`
- `cli/README.md`, `cli/SECURITY.md`, `cli/PUBLISH.md`

## Env críticas por capa (nombres)

### Landing
`MONGODB_URI`, `JWT_SECRET`, `NEXT_PUBLIC_APP_URL`, `AGENTFLOWHUB_URL`, `HUB_TO_LANDING_SECRET`, `BACKEND_URL`, `AIBACKHUB_API_KEY`, `AIBACKHUB_TENANT_ID`, `NEXT_PUBLIC_AGENTFLOW_API_URL`, billing (`STRIPE_*` / `LEMONSQUEEZY_*`), `RESEND_API_KEY`, `GEMINI_API_KEY`, `REDIS_URL` / `REDIS_TOKEN`, Turnstile, `ADMIN_SECRET`

### AgentFlowhub
`BACKEND_URL`, `AUTH_BACKEND_URL`, `JWT_SECRET`, `AIBACKHUB_API_KEY`, `LANDING_INTERNAL_URL`, `HUB_TO_LANDING_SECRET`, `HUB_WIDGET_API_KEY`, `DISABLE_BACKEND_PROXY`

### AIBackHub
`PORT`, `API_KEY`, `ADMIN_API_KEY`, `MONGODB_URI`, `CORS_ORIGIN`, `GEMINI_API_KEY` / `VERTEX_GEMINI_*`, `PINECONE_*`, MCP (`MCP_*`), `PUBLIC_API_BASE_URL`

### API REST
`MONGO_URI`, `JWT_SECRET`, `AIBACKHUB_URL`, `AIBACKHUB_INTERNAL_KEY`, `PLATFORM_APP_URL`

## Endpoints útiles

### Landing
- `POST /api/widget/chat`, `POST /api/widget/chat/stream`
- Auth/billing/webhooks bajo `src/app/api/`

### Hub (vía proxy o locales)
- `/api/widget/chat`, `/api/widget/events`, `/api/widget/usage`
- Rewrite `/api/*` → AIBackHub salvo handlers locales

### AIBackHub
- `/api/agent-farm`, `/api/models`, `/api/mcp`, `/api/agents`, `/api/embeddings`, `/api/auth`, health MatIA

### API v1
- Auth: `/api/v1/auth/token`, `/api/v1/auth/keys`
- CRUD: `/api/v1/agents`, `/widgets`, `/conversations`, `/skills`, `/audit`
- Scopes: `agents:*`, `widgets:*`, `conversations:read`, `keys:*`
- Claves: prefijo `afapi_`

## CLI comandos
`doctor`, `login`, `logout`, `whoami`, `config`, `keys *`, `agents *`, `skills *`, `widgets *` (+ `embed`), `conversations *`, `audit`

Instalado global: `@botiva/cli` → comando `botiva`. Credenciales: `~/.botiva/` (no commitear).

## Deploy
- Landing: Vercel `platform-quinini`
- Hub / AIBackHub / API: Cloud Run (proyecto GCP `528082765109`, región `europe-west1` en URLs prod)
- API: `cloudbuild.yaml`, secrets `agent-flow-api-*`
- CLI publish: `.github/workflows/botiva-cli-publish.yml` → npm `@botiva/cli` + legacy GitHub Packages

## Playbook — smoke prod (sin secretos)

```bash
# API
curl -sS "$BOTIVA_API_URL/api/v1/health"
# default: https://api-rest-agent-flow-528082765109.europe-west1.run.app

# AIBackHub
curl -sS https://matias-backend-528082765109.europe-west1.run.app/health

# Landing
curl -sS -o /dev/null -w "%{http_code}\n" https://botiva.space/es

# CLI (requiere red + sesión Team+)
botiva doctor
botiva login   # si no hay sesión
botiva whoami
botiva agents list
```

Si `doctor` falla con `fetch failed`: red/VPN/firewall o servicio caído — probar curl al health.

## Playbook — debug widget chat

1. ¿Falla en prod o local? Separar.
2. Landing logs / respuesta de `POST /api/widget/chat` (código + `code` JSON).
3. Verificar en landing: `AGENTFLOWHUB_URL` ≠ dominio landing (evita `HUB_CHAT_PROXY_LOOP`).
4. Hub alcanza `BACKEND_URL` (AIBackHub).
5. AIBackHub: modelo (`VERTEX_GEMINI_MODEL`), `API_KEY`, cuotas Gemini (`AGENT_COOLDOWN` / rate limit).
6. Token widget `wt_*`; origins CORS; stream vs webhooks (`STREAM_NOT_SUPPORTED`).
7. Guía: `platform.quinini/docs/widget-troubleshooting.md`.

## Playbook — sync skill

Fuente: `agentes/.cursor/skills/botiva-ecosystem/`

```bash
./scripts/sync-botiva-skill.sh --personal
```

## Troubleshooting rápido
Ver `platform.quinini/docs/widget-troubleshooting.md` y sección Gotchas de `SKILL.md`.
