# Análisis económico — LLM, planes y márgenes BotIvA

> Documento de referencia para decisiones de producto, pricing y guardrails técnicos.  
> **Fecha:** mayo 2026 · **Dominio prod:** botiva.space  
> **Estado:** recomendaciones estratégicas — **no implementadas** en código (salvo política parcial existente).

---

## 1. Resumen ejecutivo

BotIvA opera hoy con **coste LLM efectivo ~$0** por créditos de Google Cloud Platform (GCP). Eso oculta el **coste bruto real** y puede llevar a subestimar riesgo en planes bajos (Basic, Team, Starter) si los clientes usan modelos premium (Gemini 2.5 Pro, Gemini 3 Flash) con RAG al 100% de cuota.

**Prioridad inmediata:** medir coste real por tenant, cerrar fugas de modelos caros en planes baratos, y calibrar finanzas internas **antes** de que expiren los créditos GCP.

**Regla de oro para pricing:**

```
precio_plan ≥ (cuota × coste_real_por_conv) + infra_mensual + 30% margen bruto mínimo
```

---

## 2. Datos de facturación GCP (abr–may 2026)

| Métrica | Valor |
|---------|-------|
| Factura bruta | ~**$48,78 USD** |
| Tokens procesados | ~**13,9 M** |
| Neto pagado (créditos GCP) | ~**$0** |
| Coste real estimado / conversación | ~**$0,017** (mix Pro + Flash) |
| Modelos dominantes | **Gemini 3 Flash** (~$21) + **Gemini 2.5 Pro** (~$20) |

> ⚠️ Los créditos GCP son un **subsidio temporal**. El P&L real empieza cuando se agoten. Usar siempre la factura **bruta** como escenario pesimista.

---

## 3. Unit economics por plan (referencia)

Fuentes de verdad en código:

- `src/lib/plan-catalog.ts` — precios y cuotas
- `src/lib/plan-economics.ts` — COGS estimado por plan
- `src/lib/finance-rates.ts` — tasas USD/msg (defaults admin)
- `src/lib/model-plan-policy.ts` — techo de tier por plan

### 3.1 Precios y cuotas actuales (may 2026)

| Plan | Precio/mes | Conversaciones/mes |
|------|------------|-------------------|
| Solo | $7 | 300 |
| Basic | $17 | 1.500 |
| Team | $29 | 2.000 |
| Plus | $42 | 3.000 |
| Starter | $69 | 6.000 |
| Growth | $189 | — |
| Business | $749 | — |

### 3.2 Márgenes estimados (escenario 100% cuota)

| Plan | Situación | Notas |
|------|-----------|-------|
| **Solo** | Pérdida leve aceptable | OK como plan de entrada; forzar Flash |
| **Basic / Team** | Apretado o en pérdida | Si 100% cuota + Pro + RAG → rojo |
| **Plus** | Margen más sano | Sweet spot comercial |
| **Starter** | Riesgo alto con Pro | 6.000 × $0,017 ≈ **$102** LLM vs $69 ingreso |
| **Growth / Business** | Sanos | Pro + RAG completo justificado aquí |

### 3.3 Ejemplo numérico — Starter con Pro

```
6.000 conv × $0,017/conv ≈ $102/mes solo LLM
Ingreso plan Starter = $69/mes
→ Pérdida LLM ≈ $33/mes (sin contar infra)
```

---

## 4. Desalineación: admin vs realidad

| Concepto | Valor admin (default) | Valor real observado |
|----------|----------------------|----------------------|
| `FINANCE_EST_USD_PER_MESSAGE` | **$0,003** | ~**$0,017** (mix actual) |
| Tier Flash (2.5 Flash) | ~$0,0005/msg | Coherente |
| Tier Premium (Pro) | ~$0,004/msg | Subestimado (~$0,012–0,018) |
| Gemini 3 Flash | Clasificado como `flash` | Cuesta ~6× más que 2.5 Flash → debería ser `default` |

**Consecuencia:** panel admin/finance subestima COGS → decisiones de pricing y alertas incorrectas.

---

## 5. Guardrails técnicos existentes y gaps

### 5.1 Lo que ya existe

`src/lib/model-plan-policy.ts`:

| Plan | Tier máximo permitido |
|------|----------------------|
| free, solo, basic | `flash` |
| team, plus, starter | `default` |
| growth, business, enterprise | `premium` |

Validación en:

- `POST /api/agents` — crear agente
- `PUT /api/agents/[id]` — editar agente

### 5.2 Gaps críticos (may 2026)

1. **No hay validación en runtime** — `/api/widget/chat` no llama a `validateModelForPlan`. Agentes ya guardados con Pro siguen facturando aunque el plan baje.
2. **Clasificación incorrecta de Gemini 3 Flash** — `classifyModelTier()` trata cualquier modelo con `"flash"` en el ID como tier barato; Gemini 3 Flash no es equivalente a 2.5 Flash.
3. **Orquestador MCP (AIBackHub)** — `MCP_ORCHESTRATOR_MODEL` / `GEMINI_MCP_ORCHESTRATOR_MODEL` puede forzar Pro en todo tráfico MCP independientemente del plan del widget.
4. **Tarifas Gemini 3 ausentes** en `plan-economics.ts` (`GEMINI_API_USD_PER_1M` solo tiene 2.5 Flash y 2.5 Pro).

---

## 6. Plan de acción recomendado

### Fase 1 — Esta semana (sin tocar precios públicos)

- [ ] **Auditoría de modelos en producción** — admin/model-stats o Mongo: agentes con Pro, Gemini 3, cuentas internas vs clientes de pago.
- [ ] **Runtime guardrail** — validar modelo en `/api/widget/chat` y `/api/widget/chat/stream`.
- [ ] **Fix `classifyModelTier`** — Gemini 3 Flash → `default`; solo `flash-lite` / 2.5 Flash → `flash`.
- [ ] **Revisar `MCP_ORCHESTRATOR_MODEL`** en AIBackHub — default Flash en planes bajos.
- [ ] **Default comercial** — agentes nuevos en Basic/Team/Plus → Gemini 2.5 Flash (o 3 Flash Lite).
- [ ] **Calibrar `finance-rates.ts`** — defaults alineados con factura real:
  - Flash: ~$0,001/msg
  - Default (Gemini 3 Flash): ~$0,004–0,006/msg
  - Premium (Pro): ~$0,012–0,018/msg

### Fase 2 — 30 días (antes de fin de créditos GCP)

- [ ] Medir burn rate 2–4 semanas con factura bruta (sin asumir créditos).
- [ ] Decidir por plan Basic/Team/Starter:
  - Opción A: −20% cuota conversaciones
  - Opción B: +$3–5/mes precio
  - Opción C: RAG más limitado en Basic
- [ ] **Pro solo desde Growth+** como feature explícita (“modelos avanzados”).
- [ ] Verificar packs de conversación extra → precio > $0,02/conv (coste + 25–40% margen).

### Fase 3 — Producto y retención

- [ ] Alertas al cliente al 80% de cuota (Flash vs pack extra).
- [ ] RAG como multiplicador de consumo en planes bajos (ej. 1 conv RAG = 1,5 conv contabilizada).
- [ ] Dashboard coste vs ingreso por tenant (manual semanal → automatizar).
- [ ] Revisar `scripts/pricing-audit.mjs` con tarifas Gemini 3.

---

## 7. Palancas de producto (preferibles a subida general de precios)

| Palanca | Descripción |
|---------|-------------|
| **Overage con margen** | Packs extra por encima del coste marginal |
| **RAG limitado en Basic** | Menos MB/fuentes o multiplicador de conv |
| **Model tier por plan** | Flash default; Pro = upsell Growth+ |
| **Alertas proactivas** | 80% cuota → sugerir Flash o pack |
| **Empujar Plus/Growth** | Márgenes sanos; no competir solo por precio en Basic |

---

## 8. Qué NO hacer

- ❌ Bajar calidad en Business/Growth (pagan el margen del negocio).
- ❌ Subir Growth/Business solo por subida de Google — el problema está en Basic–Starter con Pro.
- ❌ Confiar en créditos GCP para decisiones de pricing.
- ❌ Competir solo por precio vs Chatbase/SiteGPT en la cola baja.

---

## 9. Benchmark de mercado (referencia mayo 2026)

Ver `MARKET_BENCHMARKS` en `src/lib/plan-economics.ts`:

- **RAG widget:** Chatbase, SiteGPT, DocsBot, CustomGPT
- **Agent builder:** Botpress, Landbot
- **Live chat + IA:** Lyro, Crisp
- **Helpdesk:** Intercom Fin, Zendesk AI, Gorgias

BotIvA compite bien en **Plus/Growth** por conversación; el riesgo está en **Starter con Pro** vs competidores que cobran por crédito/mensaje con modelos premium explícitos.

---

## 10. Implementación técnica pendiente (ROI alto)

Si se prioriza código, este orden maximiza impacto:

1. **`classifyModelTier`** — Gemini 3 Flash ≠ tier barato (`model-plan-policy.ts`)
2. **Validación runtime** — widget chat (`route.ts`, `stream/route.ts`)
3. **`finance-rates.ts`** — defaults desde factura GCP real
4. **`GEMINI_API_USD_PER_1M`** — añadir Gemini 3 Flash/Pro en `plan-economics.ts`
5. **Tests** — unit tests para clasificación de modelos y política por plan

---

## 11. Referencias en el monorepo

| Archivo | Propósito |
|---------|-----------|
| `agent-flow-landing/src/lib/plan-catalog.ts` | Precios, cuotas, features |
| `agent-flow-landing/src/lib/plan-economics.ts` | COGS y benchmarks |
| `agent-flow-landing/src/lib/finance-rates.ts` | Tasas USD/msg admin |
| `agent-flow-landing/src/lib/model-plan-policy.ts` | Techo tier por plan |
| `agent-flow-landing/scripts/pricing-audit.mjs` | Auditoría pricing |
| `AIBackHub/src/lib/gemini-mcp-widget-chat.ts` | Orquestador MCP |
| `agent-flow-landing/src/app/admin/model-stats/` | Stats de uso por modelo |

---

## 12. Próxima revisión sugerida

- **Trigger:** fin de créditos GCP o factura bruta > $100/mes sostenido 4 semanas.
- **Acción:** recalcular tabla §3.2 con datos reales post-créditos y decidir ajuste Basic/Team/Starter.
- **Responsable:** producto + revisión factura GCP mensual vs `admin/model-stats`.

---

*Generado a partir del análisis de conversación mayo 2026. Actualizar cuando cambien precios GCP, planes BotIvA o política de modelos.*
