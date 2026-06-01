# n8n — Noticias mundiales (webhook in / webhook out, gratis)

Flujo importable: [`n8n-noticias-mundiales-workflow.json`](./n8n-noticias-mundiales-workflow.json)

## Qué hace

1. **Entrada:** `POST` al webhook `noticias-mundiales`
2. **Consulta:** lee RSS público (sin API key ni coste)
3. **Salida:** responde en el mismo HTTP con `Respond to Webhook` (patrón AgentFlow / skill webhook)

Fuentes por defecto:

| `source` (payload) | Feed |
|--------------------|------|
| `google` (default) | Google News por tema (WORLD, BUSINESS, etc.) |
| `bbc` / `bbc_world` | BBC World |
| `bbc_latam` / `latam` | BBC Latinoamérica |
| `bbc_business` | BBC Business |
| `bbc_tech` | BBC Technology |

## Instalación en n8n

1. **Workflows → Import from file** → elige `n8n-noticias-mundiales-workflow.json`
2. Activa el workflow
3. Copia la **Production URL** del nodo **Webhook entrada** (termina en `/webhook/noticias-mundiales` o `/webhook-test/...` en modo test)
4. En BotIvA / AgentFlow: configura el skill o webhook entrante con esa URL

## Payload de entrada (opcional)

```json
{
  "payload": {
    "limit": 8,
    "topic": "world",
    "lang": "es",
    "source": "google"
  }
}
```

| Campo | Valores | Default |
|-------|---------|---------|
| `limit` | 1–25 | `8` |
| `topic` | `world`, `mundo`, `business`, `negocios`, `technology`, `tech`, `science`, `health`, `salud` | `world` |
| `lang` | `es`, `en` | `es` |
| `source` | `google`, `bbc`, `bbc_latam`, `bbc_business`, `bbc_tech` | `google` |

También acepta el body plano (sin `payload`) y el formato AgentFlow (`body.payload`).

## Ejemplo de respuesta (salida webhook)

```json
{
  "ok": true,
  "action": "noticias_mundiales",
  "total": 8,
  "summary": "Top 8 noticias (world, es, fuente google).",
  "resumenTexto": "1. Título…\n2. Título…",
  "noticias": [
    {
      "rank": 1,
      "titulo": "...",
      "enlace": "https://...",
      "fecha": "...",
      "resumen": "...",
      "fuente": "..."
    }
  ]
}
```

El LLM puede usar `resumenTexto` para hablar al usuario o `noticias` para citar enlaces.

## URL en producción (bewe)

```
https://n8n.bewe.co/webhook/noticias-mundiales
```

Probado: responde `200` con `ok: true` y array `noticias`.

## Probar con curl

```bash
curl -X POST "https://n8n.bewe.co/webhook/noticias-mundiales" \
  -H "Content-Type: application/json" \
  -d "{\"payload\":{\"limit\":5,\"topic\":\"world\",\"lang\":\"es\"}}"
```

## Notas

- **100% gratis:** solo RSS; no hace falta NewsAPI ni claves.
- Google News RSS a veces redirige; si falla en tu instancia, usa `"source": "bbc"`.
- Límites de rate dependen de tu hosting n8n y del proveedor RSS, no del flujo.
- Si necesitas **callback asíncrono** a otra URL (segundo webhook externo), añade un nodo **HTTP Request** después de “Formatear respuesta” en paralelo con “Webhook salida”; este template prioriza respuesta síncrona al agente.
