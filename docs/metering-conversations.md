# Medición de conversaciones (metering)

> **Estado:** implementado en `platform.quinini` (jul 2026).  
> Capa desacoplada para pesos por canal, promos y descuentos sin tocar rutas de chat ni `RequestLog`.

---

## 1. Resumen

Cada respuesta exitosa del agente puede **descontar una fracción** del cupo mensual del usuario. La lógica vive en `src/lib/metering/`, no en `/api/widget/chat`.

| Concepto | Dónde |
|----------|--------|
| Clasificar origen (preview vs producción) | `metering/channel-weights.ts` |
| Calcular unidades + promos | `metering/engine.ts` + `metering/policies/` |
| Persistir en Mongo | `platform-agent-utils.ts` → `RequestLog` |
| Comprobar cupo antes del chat | `quota.ts` → `checkConversationQuota` |
| Exponer uso al cliente | API REST `GET /account/usage` (lee mismo `RequestLog`) |

---

## 2. Flujo

```
POST /api/widget/chat
  │
  ├─ detectWidgetMeteringChannel(req)     → 'widget_preview' | 'widget_production'
  ├─ checkConversationQuota(userId)       → allowed / used / limit
  │     └─ resolveConversationMetering()   → limitMultiplier (promos de cupo)
  │
  └─ (tras respuesta OK)
        trackWidgetChatUsage(..., { channel })
          └─ resolveConversationMetering()
                └─ RequestLog.count += billableUnits
```

**Regla de oro:** las rutas solo pasan el **canal**. El peso lo resuelve el motor.

---

## 3. Canales y pesos base

Definidos en `METERING_CHANNEL_BASE_UNITS` (`channel-weights.ts`):

| Canal | Peso | Cómo se detecta |
|-------|------|-----------------|
| `widget_production` | **1** | Widget embebido en sitio del cliente (default) |
| `widget_preview` | **0.5** | `Referer` → `/dashboard/widget-preview` o header `X-Botiva-Preview: 1` |
| `cron` | **1** | Tareas programadas (`cron-schendule`, `widgetId: cron:<agentId>`) |
| `api` | **1** | Reservado — chat vía API REST (hoy no incrementa `RequestLog`; ver §8) |
| `whatsapp` | **1** | Reservado — mismo pipeline que widget |

**No cuentan como conversación:** subida RAG, editar prompt/skills, configuración. Tienen límites propios en `plan-catalog.ts` (`PLAN_RAG_LIMITS`).

---

## 4. Motor de políticas

### Tipos (`metering/types.ts`)

- **`MeteringContext`** — canal, `userId`, plan, `subscriptionFeatures`, etc.
- **`MeteringDecision`** — `billableUnits`, `limitMultiplier`, `appliedRules` (auditoría).
- **`MeteringPolicy`** — función plugable `{ id, priority, apply(ctx) }`.

### Orden de evaluación

1. **`channel-base`** (priority 0) — fija unidades según canal.
2. **`subscription-promo`** (priority 200) — lee `subscription.features`.
3. Futuras políticas — registrar en `policies/index.ts`.

El motor es **puro** (`resolveMetering`) — sin I/O, testeable con vitest.

`resolveConversationMetering` enriquece el contexto con la suscripción desde Mongo antes de llamar al motor.

---

## 5. Promos y descuentos (admin)

Sin deploy: agregar claves en **`subscription.features`** (panel admin / override por usuario).

| Feature | Efecto |
|---------|--------|
| `promo:conv_weight:0.8` | Cada chat cuenta **80%** del cupo |
| `promo:conv_weight:0.5` | Cuenta **media** conversación |
| `promo:conv_weight:0` | **No descuenta** cupo (campana gratis) |
| `promo:limit_mult:1.2` | **+20%** sobre el límite del plan (ej. 45.000 → 54.000) |

**Combinación:** preview (0.5) × promo `conv_weight:0.8` = **0.4** unidades por respuesta.

`checkConversationQuota` ya aplica `limitMultiplier` al calcular el tope efectivo.

---

## 6. Nueva política (código)

Ejemplo campaña por fechas:

```typescript
// src/lib/metering/policies/black-friday.policy.ts
import type { MeteringPolicy } from '../types';

export const blackFridayPolicy: MeteringPolicy = {
  id: 'black-friday',
  priority: 150,
  apply(ctx) {
    const month = (ctx.at ?? new Date()).getUTCMonth(); // 10 = noviembre
    if (month !== 10) return null;
    return { billableUnitsMultiplier: 0.5 };
  },
};
```

Registrar en `policies/index.ts`:

```typescript
export const DEFAULT_METERING_POLICIES = [
  channelBasePolicy,
  blackFridayPolicy,      // ← nueva
  subscriptionPromoPolicy,
];
```

No hace falta tocar `widget/chat`, `RequestLog` ni el dashboard.

---

## 7. Persistencia (`RequestLog`)

Colección Mongo compartida con API REST y cron.

- **Clave:** `(userId, widgetId, month)` donde `month` = ciclo de facturación (`sub_end:<timestamp>`, `trial_end:…`, o `lifetime`).
- **Campo:** `count` (Number, admite decimales — ej. 0.5).
- **Cron:** `cron-schendule` usa `widgetId: cron:<agentId>` y hoy incrementa **1** (no pasa por el motor de landing).

---

## 8. Tests

```bash
cd platform.quinini
npm test -- src/lib/__tests__/metering.test.ts
```

Cubre: detección de canal, pesos base, promos, combinaciones preview+promo, `limit_mult`.

---

## 9. UI y API pública

- **Widget preview:** texto en `/dashboard/widget-preview` — *"Cada respuesta aquí cuenta como media conversación"*.
- **OpenAPI:** descripción de `GET /account/usage` menciona preview al 50%.
- **Pendiente opcional:** exponer `appliedRules` / desglose preview vs producción en `/account/usage`.

---

## 10. Archivos clave

```
src/lib/metering/
  index.ts
  types.ts
  channel-weights.ts
  engine.ts
  resolve-conversation-metering.ts
  policies/
    index.ts
    channel-base.policy.ts
    subscription-promo.policy.ts

src/lib/platform-agent-utils.ts   → trackWidgetChatUsage
src/lib/quota.ts                  → checkConversationQuota
src/app/api/widget/chat/route.ts
src/app/api/widget/chat/stream/route.ts
```

---

## 11. Deuda conocida / próximos pasos de desacople

Ver también la sección **"Qué más desacoplar"** en respuesta de producto — prioridades:

1. **Unificar quota** landing + API REST (`usage-quota.ts` duplicado).
2. **Metering en cron** — que `cron-schendule` use el mismo contrato de políticas.
3. **API chat** — hoy verifica cupo pero no incrementa `RequestLog`; alinear o documentar.
4. **Paquete compartido** `@botiva/metering` si API y landing deben compartir reglas en runtime.

---

## 12. Referencias

- Cuotas por plan: `src/lib/plan-catalog.ts` → `PLAN_AGENT_CONVERSATION_LIMITS`, `PLAN_API_CONVERSATION_LIMITS`
- Modelo comercial API: `docs/pricing-api-addon.md`
- Economía / márgenes: `docs/analisis-economico-llm-planes.md`
- Agentes plataforma (90 gratis/mes): `src/lib/agent-plans.ts` → `PLATFORM_AGENT_FREE_REQUESTS_PER_USER_MONTH`
