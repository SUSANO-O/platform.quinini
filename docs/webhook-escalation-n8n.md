# Webhook `conversation.escalation` — plantilla n8n

Cuando un visitante pulsa **「Hablar con una persona」** en el widget, BotIvA:

1. Marca la sesión como `escalated: true` en MongoDB.
2. Envía push al dueño del widget (si está suscrito).
3. Dispara el webhook saliente **`conversation.escalation`** (plan con webhook saliente activo).
4. Opcionalmente crea ticket en Zendesk/Freshdesk (plan **Growth+** + integración configurada).

Este documento describe cómo enganchar **n8n** mientras no uses la integración nativa de tickets.

## Integración nativa en BotIvA (sin n8n)

En **Dashboard → Cumplimiento → Avisar en Slack al escalar** (plan **Starter+**):

1. En Slack: **Apps → Incoming WebHooks** → añade webhook al canal deseado.
2. Copia la URL `https://hooks.slack.com/services/...`
3. Pégala en BotIvA y pulsa **Guardar** → **Enviar prueba**.

Cada escalación desde el widget publicará contacto + mensaje + transcript en ese canal.

---

## Requisitos (webhook genérico / n8n)

- Plan con **webhook saliente SaaS** configurado en **Dashboard → Cumplimiento → Webhook saliente**.
- URL HTTPS accesible desde BotIvA (tu instancia n8n o túnel en dev).

## Payload del evento

```json
{
  "event": "conversation.escalation",
  "timestamp": "2026-05-22T14:30:00.000Z",
  "userId": "64f…",
  "data": {
    "widgetId": "665…",
    "widgetName": "Widget — Soporte",
    "agentId": "664…",
    "sessionId": "afhub_sess_…",
    "userMessage": "Necesito ayuda con mi pedido",
    "contactInfo": {
      "name": "María García",
      "email": "maria@empresa.com",
      "phone": "+34600000000"
    },
    "humanSupportPhone": "",
    "timestamp": "2026-05-22T14:30:00.000Z"
  }
}
```

### Firma HMAC

Si configuraste secreto en el panel, cada POST incluye:

```
X-BotIvA-Signature: sha256=<hex>
X-BotIvA-Event: conversation.escalation
```

El cuerpo firmado es el JSON **raw** del payload (sin reordenar claves).

## Workflow n8n (mínimo)

### 1. Webhook Trigger

- **HTTP Method:** POST  
- **Path:** `/botiva/escalation` (o el que prefieras)  
- **Response:** 200 OK inmediato  

Copia la **Production URL** del nodo Webhook y pégala en BotIvA como URL del webhook saliente.

### 2. Validar firma (opcional)

Nodo **Function** con el secreto de BotIvA:

```javascript
const crypto = require('crypto');
const secret = $env.BOTIVA_WEBHOOK_SECRET; // mismo que en el panel
const sig = $request.headers['x-botiva-signature'] || '';
const body = JSON.stringify($json);
const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
if (sig !== expected) throw new Error('Firma inválida');
return $input.all();
```

### 3. Crear ticket en Zendesk (ejemplo)

Nodo **HTTP Request**:

| Campo | Valor |
|-------|--------|
| Method | POST |
| URL | `https://{{subdomain}}.zendesk.com/api/v2/tickets.json` |
| Auth | Basic — email/token + API token |
| Body | JSON |

```json
{
  "ticket": {
    "subject": "Escalación BotIvA — {{ $json.data.contactInfo.name }}",
    "comment": {
      "body": "Widget: {{ $json.data.widgetName }}\nSesión: {{ $json.data.sessionId }}\n\nContacto:\n{{ $json.data.contactInfo.name }}\n{{ $json.data.contactInfo.email }}\n{{ $json.data.contactInfo.phone }}\n\nMensaje:\n{{ $json.data.userMessage }}"
    },
    "requester": {
      "email": "{{ $json.data.contactInfo.email }}",
      "name": "{{ $json.data.contactInfo.name }}"
    },
    "tags": ["botiva", "escalation"]
  }
}
```

### 4. Notificar Slack / email

Añade nodos **Slack**, **Gmail** o **Microsoft Teams** con el mismo `$json.data`.

## Integración nativa (sin n8n)

En plan **Growth+**, configura Zendesk o Freshdesk vía API:

```
PUT /api/user/escalation-ticket
{
  "provider": "zendesk",
  "subdomain": "tu-empresa",
  "email": "agente@tu-empresa.com",
  "apiToken": "…"
}
```

BotIvA creará el ticket automáticamente en cada escalación, además del webhook.

## Panel Inbox

Las sesiones escaladas aparecen en **Dashboard → Inbox** con contacto, mensaje y transcript.

## Probar en local

1. Configura webhook apuntando a n8n (`ngrok` / `cloudflared` si hace falta).
2. Embebe el widget con token `wt_…`.
3. Pulsa **Hablar con una persona**, rellena el formulario.
4. Verifica ejecución en n8n y entrada en `/dashboard/inbox`.
