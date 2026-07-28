# Pricing API — modelo híbrido (opción 2)

> **Estado:** implementado en código (jul 2026). Checkout del add-on pendiente en Paddle/Lemon.

## Resumen

Dos **pools de conversaciones independientes**:

| Pool | Uso | Quién lo tiene |
|------|-----|----------------|
| **Agentes** | Widget, WhatsApp, cron, preview (0,5) | Todos los planes con panel |
| **API** | `POST /agents/:id/chat` vía API REST | Solo **API Develop** o **add-on** `api_access` |

**Ningún plan de panel incluye API por defecto** (Team/Plus/Business ya no).

---

## Productos

### API Develop — $29/mes
- 2.000 conversaciones/mes **solo API**
- 0 conversaciones widget (plan sin panel operativo)
- Documentación + API keys

### Panel Team+ — desde $29/mes
- 2.000–45.000 conv **solo agentes/widget** según plan
- **API:** add-on opcional **+$19/mes** → +2.000 conv API (`subscription.features: api_access`)

### Packs overflow
- Siguen aplicando al **pool agentes** (packs API dedicados: futuro)

---

## Activar add-on hoy (admin)

En la suscripción del usuario, agregar feature:

```json
{ "features": ["api_access"] }
```

Eso habilita:
- Acceso a `/dashboard/api` y API REST
- Cupo **2.000** conv API/mes separado del widget

---

## Técnico

- RequestLog `widgetId = api:rest` → pool API
- Resto de `widgetId` (widgets reales, `cron:…`) → pool agentes
- `GET /account/usage` expone `usage.conversations` (agentes) y `usage.conversationsApi`
- Medición/promos: `docs/metering-conversations.md`

---

## Pendiente comercial

- [ ] Variante Lemon/Paddle `API_ACCESS_ADDON` ($19/mes)
- [ ] Packs solo API (precio > pack widget genérico)
- [ ] UI checkout “Agregar API” en Team+
