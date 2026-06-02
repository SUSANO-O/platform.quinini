# n8n — Cotizaciones en tiempo real (Solana, Nubank, Google)

Flujo importable: [`n8n-cotizaciones-workflow.json`](./n8n-cotizaciones-workflow.json)

## Qué devuelve

| Activo | Símbolo | Fuente | Tipo |
|--------|---------|--------|------|
| **Solana** | SOL | CoinGecko | Cripto (24h change) |
| **Google** | GOOGL | Yahoo Finance | Acción NASDAQ |
| **Nubank** | NU | Yahoo Finance | Acción NYSE |

**100% gratis**, sin API key.

## Flujo

```
POST webhook → Code (3 consultas) → Respond to Webhook
```

## Instalación

1. **Workflows → Import from file** → `n8n-cotizaciones-workflow.json`
2. Activa el workflow
3. URL producción: `https://TU-N8N/webhook/cotizaciones-bursatiles`

En n8n.bewe.co (ejemplo):

```
https://n8n.bewe.co/webhook/cotizaciones-bursatiles
```

## Payload (opcional)

```json
{
  "payload": {
    "currency": "usd"
  }
}
```

| Campo | Default | Descripción |
|-------|---------|-------------|
| `currency` / `moneda` | `usd` | Moneda para Solana (CoinGecko) |

## Ejemplo de respuesta

```json
{
  "ok": true,
  "action": "cotizaciones_tiempo_real",
  "queriedAt": "2026-06-01T16:00:00.000Z",
  "currency": "usd",
  "summary": "Solana: $80.98 (-2.15%) | Alphabet (Google): $376.37 (-1.04%) | Nubank: $12.99 (-1.07%)",
  "resumenTexto": "Solana: $80.98 (-2.15%)\nAlphabet (Google): $376.37 (-1.04%)\nNubank: $12.99 (-1.07%)",
  "activos": [
    {
      "id": "solana",
      "nombre": "Solana",
      "tipo": "crypto",
      "simbolo": "SOL",
      "precio": 80.98,
      "moneda": "USD",
      "cambio_24h_pct": -2.15,
      "fuente": "CoinGecko"
    },
    {
      "id": "google",
      "nombre": "Alphabet (Google)",
      "tipo": "accion",
      "simbolo": "GOOGL",
      "precio": 376.37,
      "moneda": "USD",
      "cambio_dia_pct": -1.04,
      "mercado": "NasdaqGS",
      "fuente": "Yahoo Finance"
    },
    {
      "id": "nubank",
      "nombre": "Nubank",
      "tipo": "accion",
      "simbolo": "NU",
      "precio": 12.99,
      "moneda": "USD",
      "cambio_dia_pct": -1.07,
      "mercado": "NYSE",
      "fuente": "Yahoo Finance"
    }
  ]
}
```

## Probar con curl

```bash
curl -X POST "https://n8n.bewe.co/webhook/cotizaciones-bursatiles" \
  -H "Content-Type: application/json" \
  -d "{\"payload\":{\"currency\":\"usd\"}}"
```

PowerShell:

```powershell
$body = @{ payload = @{ currency = "usd" } } | ConvertTo-Json -Depth 5
Invoke-RestMethod -Uri "https://n8n.bewe.co/webhook/cotizaciones-bursatiles" -Method POST -ContentType "application/json" -Body $body
```

## Conectar en BotIvA / AgentFlow

Herramienta **Webhook**:

| Campo | Valor |
|-------|--------|
| **Nombre** | `cotizaciones_mercado` |
| **URL** | `https://n8n.bewe.co/webhook/cotizaciones-bursatiles` |
| **Descripción** | Consulta precios actuales de Solana (SOL), Google/Alphabet (GOOGL) y Nubank (NU). Usa cuando el usuario pida cotización, precio de mercado o valor bursátil. Payload opcional: `{ "currency": "usd" }`. |

## Limitaciones

- **Acciones:** Yahoo Finance tiene delay típico de 1–15 min (no es tick en tiempo real de pago).
- **Solana:** CoinGecko free tier tiene rate limit (~10–30 req/min); no abuses en loops.
- **Horario:** GOOGL y NU solo cotizan en horario de mercado US (pre/post con delay).
- **CoinGecko bloqueado:** si falla SOL, el resto sigue; revisa `errores[]` en la respuesta.

## Notas técnicas

- Google = **GOOGL** (Alphabet Class A), no el ticker `GOOG`.
- Nubank = **NU** en NYSE.
- Si Yahoo bloquea tu IP de n8n, añade proxy o usa Finnhub/Alpha Vantage con API key.
