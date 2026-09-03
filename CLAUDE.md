# platform.quinini — `agent-flow-landing`

Landing pública + **dashboard** de BotIvA (agentes, widgets, inbox, chats, facturación).
Next.js 15 (App Router). Sirve el **SDK embebible** del widget y hace de **proxy de chat**
hacia AgentFlowhub. Parte del ecosistema — ver `../CLAUDE.md` y `../docs/ARCHITECTURE-UML.md`.

## Arranque

```bash
npm run dev            # next dev -p 3201  → http://127.0.0.1:3201
npm run typecheck      # tsc --noEmit  (ver aviso abajo)
npm run test           # vitest run  → 653 tests hoy, deben seguir en verde
npm run build          # build:widget + next build
```

Stack local completo (con AIBackHub + API REST): `../scripts/botiva-local-up.sh`.

## Cosas que NO son obvias

- **`npm run typecheck` falla hoy** con 5 errores, **todos en `src/lib/__tests__/`** — es
  estado preexistente, no lo introdujiste tú. El código de aplicación compila limpio.
  No persigas esos errores salvo que el objetivo sea justamente arreglarlos.
- **Widget SDK**: se edita en **`scripts/widget/core.js`** (+ `flow-mode.js`) y se compila
  a `public/widget.js` con `npm run build:widget`. **Nunca** edites `public/widget.js`,
  `public/assist.js` ni `public/sdk/**` a mano — están minificados y se regeneran.
- **Deploy doble**: un `git push` a `main` despliega **en paralelo** a Vercel (botiva.space)
  y a Cloud Run (`platform-quinini`). Secretos en Secret Manager como `platform-quinini-<nombre>`.
- **Mongo**: modelos en `src/lib/db/models.ts` (colección `agentflowhub_landing`, la misma
  que usan AgentFlowhub, API-REST y cron). `connectDB()` desde `src/lib/db/connection.ts`.
- **Auth de dashboard**: cookie `afhub_session` → `verifySessionToken(token)` de `src/lib/auth.ts`.
  Auth de widgets: token `wt_…` en el campo `afhubToken` del `Widget`.
- **Chat del widget**: `/api/widget/chat` reenvía a AgentFlowhub (`AGENTFLOWHUB_URL`),
  que a su vez reenvía a matias-backend (`BACKEND_URL`). Eventos de telemetría van a
  `/api/widget/events` y de ahí a AIBackHub `/api/widget-events`.
- **Persistencia de transcript**: `respondAndPersist` / `persistWidgetTranscript`
  (`src/lib/widget-transcript.ts`) escriben `WidgetMessage` con `after()` — fire-and-forget
  pero garantizado en serverless.
- En AWS Lambda no se puede crear `./data` bajo `/var/task` → usar
  `ensureWritableDataDir()` de `src/lib/server-writable-data-dir`.

## Convenciones

- `src/lib/dashboard-fetch.ts` + `src/lib/dashboard-query-keys.ts` + `src/stores/dashboard-ui-store.ts`
  concentran fetchers, claves de TanStack Query y estado de UI del dashboard.
- Estilos: Tailwind + clases BEM en `src/app/globals.css` (ej. `chats-page__*`).
- Tests junto al código (`*.test.ts`) o en `src/lib/__tests__/`. BDD en `features/` + `cucumber.mjs`.
- `next lint` no tiene ESLint configurado (pide setup interactivo) — usar `typecheck` + `test`.

## Reglas de trabajo (esta ronda)

- **Solo local. Sin `git push`, sin deploy** salvo OK explícito por acción.
- No romper los 653 tests. No modificar tests existentes.
