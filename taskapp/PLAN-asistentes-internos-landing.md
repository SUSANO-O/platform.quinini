# Plan seguro: Math y Math-ais como widgets de cliente

**Objetivo:** Gestionar los asistentes internos de BotIvA (marketing + dashboard) desde la landing, igual que un cliente, **sin cambiar código de sync**, **sin sync bidireccional nuevo** y **sin tocar widgets de clientes existentes**.

**Repo:** `agent-flow-landing` (GitHub `SUSANO-O/platform.quinini`, Vercel `platform-quinini` / botiva.space). El motor sigue en AIBackHub (Render).

**Principio:** una cuenta dueña → dos agentes normales → dos widgets → dos variables en Vercel. Todo lo demás se edita en el dashboard.

---

## Qué NO se modifica (cero riesgo arquitectura)

| Área | Acción |
|------|--------|
| `sync-from-hub`, `pushClientAgentToHubCatalog` | No tocar |
| Bloqueo PATCH agentes `isPlatform` | Mantener |
| Rutas `/api/widget/chat`, OCR, widgets clientes | No tocar |
| AgentFlowhub / UI del hub | No obligatorio para operar |
| Código de `assist.js` / `internal-assist-config.ts` | No obligatorio (solo env) |

---

## Arquitectura objetivo

```text
Visitante marketing          Usuario logueado dashboard
        │                              │
        ▼                              ▼
   assist.js (Math)              assist.js (Math-ais)
        │                              │
        └──────────┬───────────────────┘
                   ▼
        botiva.space/api/widget/chat
                   ▼
              AIBackHub (motor)
```

**Config:** Widget Builder + Agentes (cuenta plataforma) → Mongo `agentflowhub_landing`  
**Enlace:** `INTERNAL_MARKETING_ASSIST_WIDGET_ID` + `INTERNAL_APP_ASSIST_WIDGET_ID` en Vercel

---

## Fase 0 — Cuenta dueña plataforma

**Duración estimada:** 30 min  
**Riesgo:** ninguno

### Pasos

1. Crear (o elegir) un usuario dedicado, por ejemplo:
   - Email: `platform@botiva.space` o cuenta admin secundaria
   - Plan: **Business** (o el que necesites para MCP, visión, multi-agente)
2. Verificar email y completar onboarding si aplica.
3. Anotar el `_id` del usuario en Mongo (`users`) — opcional, para auditoría.

### Criterio de éxito

- Login en `https://botiva.space/dashboard` funciona.
- Puedes crear agentes y widgets sin límite del plan Solo.

### No hacer

- No marcar agentes como `isPlatform` desde el admin (salvo que sepas que quedarán solo lectura en landing).

---

## Fase 1 — Agentes (cerebro)

**Duración estimada:** 1–2 h por agente  
**Riesgo:** ninguno (flujo estándar de cliente)

### 1A — Agente **Math** (marketing / web pública)

1. Dashboard → **Agentes** → **Crear agente**
2. Nombre sugerido: `Math — Marketing`
3. Configurar:
   - System prompt (soporte comercial / producto)
   - Modelo (ej. `gemini-2.5-flash`)
   - Visión ON si usan capturas
   - MCP / Sheets / webhooks según necesidad
   - Modo estricto según política
4. Guardar → comprobar `syncStatus: synced` (sync landing → hub automático al guardar).
5. Copiar **`_id` del agente** (24 hex): `________________________`

### 1B — Agente **Math-ais** (dashboard / usuarios logueados)

1. Repetir con nombre: `Math-ais — App`
2. Prompt orientado a uso de la plataforma (builder, agentes, billing, etc.).
3. Copiar **`_id` del agente**: `________________________`

### Verificación

```powershell
# Local o contra prod (con sesión/cookie si aplica)
# En dashboard: abrir agente → guardar cambio menor → recargar → persiste
```

| Check | Math | Math-ais |
|-------|:----:|:--------:|
| `isPlatform` = false | ☐ | ☐ |
| `agentHubId` presente tras guardar | ☐ | ☐ |
| MCP/tools probados (si aplica) | ☐ | ☐ |

---

## Fase 2 — Widgets (orb + chat)

**Duración estimada:** 45 min por widget  
**Riesgo:** ninguno

### 2A — Widget marketing (Math)

1. Dashboard → **Widget Builder** → crear widget
2. Nombre: `Asistente marketing (Math)`
3. **Agente:** el de Fase 1A
4. Ajustar:
   - Color, título, welcome, avatar (`/assets/marketing/math-avatar-cutout.webp` si aplica)
   - Funcionalidades extra: adjuntar, micrófono, voz, auto-open
   - WhatsApp / handoff según política
5. Guardar y copiar:
   - **`_id` del widget**: `________________________`
   - **`wt_` token** (embed): `________________________` (referencia; assist usa widgetId)

### 2B — Widget app (Math-ais)

1. Widget: `Asistente dashboard (Math-ais)`
2. Agente: Fase 1B
3. Avatar sugerido: `/assets/assist/botivaorbe.webp`
4. Copiar **`_id` del widget**: `________________________`

### Verificación preview

- Dashboard → preview del widget (si usas esa ruta)
- Confirmar agente correcto en identidad del builder

---

## Fase 3 — Variables Vercel (solo enlace)

**Duración estimada:** 15 min + redeploy  
**Riesgo:** bajo (solo afecta assist interno, no embeds de clientes)

Proyecto: **platform-quinini** → Settings → Environment Variables → **Production**

### Variables obligatorias (nuevas o actualizar)

| Variable | Valor | Notas |
|----------|-------|-------|
| `INTERNAL_MARKETING_ASSIST_WIDGET_ID` | `_id` widget Fase 2A | Solo ObjectId Mongo |
| `INTERNAL_APP_ASSIST_WIDGET_ID` | `_id` widget Fase 2B | Solo ObjectId Mongo |

### Variables recomendadas (OCR imágenes en widget)

| Variable | Valor |
|----------|-------|
| `VERTEX_GEMINI_API_KEY` | API key Google AI / Gemini (misma familia que local) |

### Variables a **eliminar o dejar vacías** (para que mande el Widget Builder)

Si existen, **pisan** la config remota del widget. Para paridad con clientes, quitar o no definir:

- `INTERNAL_MARKETING_ASSIST_AGENT_ID`
- `INTERNAL_APP_ASSIST_AGENT_ID`
- `INTERNAL_MARKETING_ASSIST_COLOR`
- `INTERNAL_MARKETING_ASSIST_TITLE`
- `INTERNAL_MARKETING_ASSIST_SUBTITLE`
- `INTERNAL_MARKETING_ASSIST_WELCOME`
- `INTERNAL_MARKETING_ASSIST_FAB_HINT`
- `INTERNAL_MARKETING_ASSIST_AVATAR`
- `INTERNAL_APP_ASSIST_COLOR`
- `INTERNAL_APP_ASSIST_TITLE`
- `INTERNAL_APP_ASSIST_SUBTITLE`
- `INTERNAL_APP_ASSIST_WELCOME`
- `INTERNAL_APP_ASSIST_FAB_HINT`
- `INTERNAL_APP_ASSIST_AVATAR`

### Variables opcionales (posición / WhatsApp global)

Pueden quedarse si no están en el widget:

- `INTERNAL_ASSIST_EDGE_INSET` (default 20)
- `INTERNAL_ASSIST_OFFSET_BOTTOM` / `OFFSET_TOP`
- `INTERNAL_ASSIST_HUMAN_PHONE`

### Deploy

```powershell
cd agent-flow-landing
vercel link --project platform-quinini   # si no está enlazado
vercel deploy --prod --yes
```

**No hace falta** `npm run build:widget` salvo que hayas cambiado `scripts/widget/core.js`.

---

## Fase 4 — Pruebas en producción

**Duración estimada:** 30–45 min

### 4.1 Marketing (Math)

| # | Prueba | OK |
|---|--------|:--:|
| 1 | Abrir `https://botiva.space` (home) → aparece orb | ☐ |
| 2 | Abrir chat → título/color del widget builder | ☐ |
| 3 | Mensaje texto → respuesta coherente | ☐ |
| 4 | Adjuntar imagen → OCR (log Vercel `[widget-image-vision]` sin error de API key) | ☐ |
| 5 | Cambio en builder (ej. welcome) → en ~30 s se refleja en sitio | ☐ |

### 4.2 Dashboard (Math-ais)

| # | Prueba | OK |
|---|--------|:--:|
| 1 | Login → `/dashboard` → orb (no en `/admin`) | ☐ |
| 2 | Chat responde con contexto plataforma | ☐ |
| 3 | Navegar `/dashboard/inbox` → orb no desaparece (mismo contexto app) | ☐ |

### 4.3 Regresión clientes

| # | Prueba | OK |
|---|--------|:--:|
| 1 | Widget cliente existente (ej. Asesor Taller) sin cambios | ☐ |
| 2 | Otro usuario / otro `wt_` sigue funcionando | ☐ |

### Logs Vercel (OCR)

Filtrar: `[widget-image-vision]`

- **Bien:** `Respuesta Vision (N chars): Camión...`
- **Mal:** `configura VERTEX_GEMINI_API_KEY`

---

## Fase 5 — Limpieza opcional (sin prisa)

**Solo cuando Fase 4 esté verde.**

1. Documentar en este archivo los IDs finales (tabla abajo).
2. Si existían agentes viejos `math` / `math-ais` solo en hub o `isPlatform`:
   - **No borrar** hasta confirmar tráfico cero
   - Desactivar (`status: disabled`) en hub si ya no se usan
3. Actualizar `.env` local de referencia (sin commitear secretos).

### Registro de producción (rellenar al terminar)

| Recurso | Nombre | Mongo `_id` | Notas |
|---------|--------|-------------|-------|
| Usuario dueño | | | |
| Agente marketing | Math | | |
| Agente app | Math-ais | | |
| Widget marketing | | | |
| Widget app | | | |
| `agentHubId` Math | | | catálogo AIBackHub |
| `agentHubId` Math-ais | | | |

---

## Rollback (volver atrás en minutos)

Si algo falla tras Fase 3:

1. Vercel → restaurar valores **anteriores** de `INTERNAL_*_WIDGET_ID` (o vaciar para volver a env legacy).
2. Redeploy prod.
3. Los widgets nuevos en Mongo **no afectan** a clientes; puedes dejarlos inactivos (`active: false`).

No hay migración de datos destructiva en este plan.

---

## Operación día a día (post-plan)

| Quiero cambiar… | Dónde |
|-----------------|--------|
| Prompt, MCP, RAG, reglas, visión | Dashboard → Agentes (cuenta plataforma) |
| Color, textos, toggles del chat | Dashboard → Widget Builder |
| Qué widget usa marketing vs app | Solo Vercel `INTERNAL_*_WIDGET_ID` |
| Motor / modelos globales | AIBackHub + admin landing (sin cambiar este plan) |

**Login:** cuenta plataforma dedicada, o admin → `/admin/users` → impersonar al dueño.

---

## Checklist resumen

```
Fase 0  ☐ Cuenta plataforma creada y con plan adecuado
Fase 1  ☐ Agente Math creado (no isPlatform)
Fase 1  ☐ Agente Math-ais creado (no isPlatform)
Fase 2  ☐ Widget marketing ligado a Math
Fase 2  ☐ Widget app ligado a Math-ais
Fase 3  ☐ INTERNAL_*_WIDGET_ID en Vercel Production
Fase 3  ☐ VERTEX_GEMINI_API_KEY en Vercel (si hay imágenes)
Fase 3  ☐ Quitadas env que pisan color/título (opcional recomendado)
Fase 3  ☐ Redeploy prod
Fase 4  ☐ Pruebas marketing + dashboard + regresión clientes
Fase 5  ☐ IDs documentados en tabla de este doc
```

---

## Referencias en código

| Tema | Archivo |
|------|---------|
| Boot assist | `src/lib/internal-assist-config.ts` |
| Enlace widget → token | `src/lib/internal-assist-widget.ts` |
| API boot | `src/app/api/internal/assist/boot/route.ts` |
| Script en páginas | `src/components/landing/landing-widget-script.tsx` |
| Rutas marketing vs app | `src/lib/landing-widget-paths.ts` |
| Ejemplo env | `.env.example` (sección asistente interno) |
| Sync agente → hub (automático al guardar) | `src/lib/aibackhub-sync.ts` |

---

## FAQ

**¿Hay que tocar AgentFlowhub?**  
No para operar. Al guardar agente en landing, el sync actual empuja al catálogo AIBackHub.

**¿Los clientes ven mis widgets de plataforma?**  
No. Solo tu cuenta ve sus widgets en el dashboard. El assist usa IDs fijos en env.

**¿Puedo usar la misma cuenta que ya tengo?**  
Sí, si creas ahí los widgets. Cuenta dedicada es más limpio para permisos y facturación.

**¿Esto implementa sync bidireccional?**  
No. Es el flujo seguro: **landing → hub** al guardar, igual que cualquier cliente.

---

*Documento creado: 2026-06-07 · `agent-flow-landing/taskapp` · Sin cambios de código requeridos.*
