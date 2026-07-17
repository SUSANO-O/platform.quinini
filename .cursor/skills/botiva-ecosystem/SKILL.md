---
name: botiva-ecosystem
description: >-
  Playbook operativo del ecosistema BotIvA (platform.quinini, AgentFlowhub,
  matias-backend/AIBackHub, API-REST-AGENT-FLOW, CLI @botiva/cli). Mapa de
  repos, URLs de producción, puertos locales, flujos widget→landing→hub→motor,
  dónde tocar bugs, CLI Team+, deploy y gotchas. Usar siempre en el workspace
  agentes y en cualquiera de esos repos; también cuando el usuario mencione
  BotIvA, MatIAs, widget, agent-farm, afapi_, o botiva CLI.
---

# BotIvA — ecosistema (interno)

> **INTERNO — NO PUBLICAR.** Sin secretos: solo nombres de env, URLs públicas y flujos.
> Valores de keys/JWT/Mongo viven en `.env` locales o Secret Manager — no copiarlos aquí.

## Instrucciones para el agente

1. Leer este skill al trabajar en `agentes/` o en cualquiera de los 4 repos.
2. Antes de cambiar código: identificar **qué capa** es (landing / hub / motor / API).
3. No inventar URLs ni puertos; usar la tabla de abajo. Si falta un dato crítico, **preguntar una sola cosa** y esperar.
4. Nunca pegar secretos en commits, PRs, skills ni chat público.
5. Detalle ampliado: [reference.md](reference.md).

## Mapa de repos

| Carpeta | npm / producto | Rol |
|---------|----------------|-----|
| `platform.quinini` | `agent-flow-landing` | SaaS: landing, dashboard, widget embed, billing, Mongo usuarios |
| `AgentFlowhub` | AgentFlow / hub | UI admin + gateway chat/SDK; proxy a AIBackHub |
| `matias-backend` | `aibackhub` | Motor IA: Genkit, farm, MCP, embeddings, modelos |
| `API-REST-AGENT-FLOW` | `agent-flow-api` + `cli/` → `@botiva/cli` | API REST externa Team+ y CLI `botiva` |

Cada uno es **git independiente** (versionado, `.env`, deploy propios). No es un monorepo npm.

## Producción (URLs públicas)

| Servicio | URL |
|----------|-----|
| Landing / dashboard | `https://botiva.space` (ES: `/es`) · también `https://www.botiva.space` |
| Vercel proyecto | `https://vercel.com/susano-os-projects/platform-quinini` |
| AgentFlowhub | `https://control-matias-528082765109.europe-west1.run.app` |
| AIBackHub | `https://matias-backend-528082765109.europe-west1.run.app` |
| API REST | `https://api-rest-agent-flow-528082765109.europe-west1.run.app` |
| API docs | `{API}/docs/` |
| Widget host | `https://botiva.space` (`/widget.js`) |
| CLI npm | `https://www.npmjs.com/package/@botiva/cli` (`@beta`, cmd `botiva`) |

Otras URLs de integraciones (n8n, Upstash, etc.) → ver `.env` / `.env.example` del repo; no duplicar secretos.

## Local (puertos)

| Servicio | Puerto |
|----------|--------|
| Landing | `3201` |
| AgentFlowhub UI (`npm run dev`) | `9010` |
| AgentFlowhub API (docs/smoke a menudo) | `9002` |
| AIBackHub | `9003` |
| API REST | `4000` (Docker/Cloud Run escucha `8080`) |

**Gotcha:** README/smoke suelen decir **9002**; `package.json` de AgentFlowhub arranca en **9010**. Confirmar qué proceso está vivo antes de apuntar `AGENTFLOWHUB_URL`.

## Cadena de chat (punto a punto)

```
Visitante / embed
  → widget.js (botiva.space)
  → landing POST /api/widget/chat (:3201)
  → AgentFlowhub /api/widget/chat
  → AIBackHub (modelos / agent-farm / MCP)
  → LLM (Gemini, etc.)
```

API/CLI (Team+) habla con **API-REST** → Mongo compartido con landing + sync agentes a AIBackHub (`AIBACKHUB_URL` + key interna).

## Dónde tocar qué

| Síntoma / tarea | Repo principal |
|-----------------|----------------|
| Landing, dashboard, billing, registro, i18n | `platform.quinini` |
| Widget embed, CORS origen, `widget.js` / `assist.js` | `platform.quinini` (+ build widget) |
| Proxy chat hub, SDK hub, telemetría widget hub | `AgentFlowhub` |
| Modelos, farm, MCP, embeddings, vision, rate Gemini | `matias-backend` |
| API keys `afapi_`, endpoints `/api/v1`, plan Team+ | `API-REST-AGENT-FLOW` |
| CLI `botiva` | `API-REST-AGENT-FLOW/cli` |

## Variables puente (solo nombres)

- Landing ↔ hub: `AGENTFLOWHUB_URL`, `HUB_TO_LANDING_SECRET`, `LANDING_INTERNAL_URL`
- Landing/hub ↔ motor: `BACKEND_URL`, `AIBACKHUB_API_KEY` / `API_KEY`, `AIBACKHUB_TENANT_ID`
- Landing ↔ API: `NEXT_PUBLIC_AGENTFLOW_API_URL`
- API ↔ motor: `AIBACKHUB_URL`, `AIBACKHUB_INTERNAL_KEY`
- CLI: `BOTIVA_API_URL`, `BOTIVA_API_KEY`, `BOTIVA_WIDGET_HOST`
- App pública: `NEXT_PUBLIC_APP_URL` / `APP_URL` → botiva.space

Checklist prod landing: `platform.quinini/docs/prod-env-checklist.md`.

## CLI (`botiva`)

```bash
npm install -g @botiva/cli@beta
botiva doctor
botiva login
botiva agents list
botiva widgets embed <id>
```

Credenciales locales: `~/.botiva/` (no commitear). Plan **Team+** o override `api_access`.

## Arranque local típico

1. `matias-backend` → `:9003` (`npm run dev`)
2. `AgentFlowhub` → `:9010` (o el puerto que uses) con `BACKEND_URL` al motor
3. `platform.quinini` → `:3201` con `AGENTFLOWHUB_URL` + `BACKEND_URL`
4. Opcional: `API-REST-AGENT-FLOW` → `:4000` + `botiva doctor --api-url http://127.0.0.1:4000`

## Gotchas frecuentes

- `HUB_CHAT_PROXY_LOOP`: `AGENTFLOWHUB_URL` apunta a la landing.
- Modelo “no longer available”: `VERTEX_GEMINI_MODEL` en AIBackHub obsoleto → `gemini-2.5-flash` + migrate.
- Stream + webhooks agente → `STREAM_NOT_SUPPORTED` / fallback non-stream.
- Token widget: `wt_*` (`afhubToken`), no confundir con `publicToken`.
- API `/auth/token` no reemite raw key si ya existen claves → `keys create` o `login --key`.
- README de matias-backend puede decir imports a AgentFlowhub; el código actual vive en el propio repo.
- Docs internas; encoding roto en algunos README no invalida el resto.

## Rules del proyecto

Hay `.cursor/rules/botiva-ecosystem.mdc` (alwaysApply) en el workspace y en cada repo. Complementan este skill; no las contradigas.

## Mantenimiento del skill

Fuente de verdad: `agentes/.cursor/skills/botiva-ecosystem/`.

```bash
./scripts/sync-botiva-skill.sh --personal
```

Copia a los 4 repos y a `~/.cursor/skills/botiva-ecosystem/`. No editar solo una copia hija.

## Smoke prod

```bash
./scripts/smoke-botiva-prod.sh
./scripts/sync-botiva-skill.sh --personal
```

Estado verificado con red (2026-07-17):
- API `/api/v1/health` → 200 (Mongo + JWT OK), servicio `agent-flow-api` v2.0.0
- AIBackHub `/health` → 200
- Hub root → 307 (redirect login; esperado)
- Landing: a veces timeout desde CLI; reintentar `www.botiva.space/es` (200 cuando responde)
- `botiva doctor` → API OK; avisa sin API key hasta `botiva login`
