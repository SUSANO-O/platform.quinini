# agent-flow-landing — BotIvA / MatIAs

Landing pública y dashboard de BotIvA (botiva.space). SDK embebible (`public/widget.js`), proxy de chat hacia AgentFlowhub y panel de agentes/widgets.

## Arranque

```bash
cp .env.example .env
npm install
npm run dev    # http://localhost:3201
```

## Variables clave

| Variable | Uso |
|----------|-----|
| `MONGODB_URI` | Base **`agentflowhub_landing`** |
| `AGENTFLOWHUB_URL` | Proxy widget chat → AgentFlowhub |
| `BACKEND_URL` | AIBackHub |

## Scripts

| Comando | Descripción |
|---------|-------------|
| `npm run inspect:widget -- <id>` | Inspección Mongo widget + agente + hub |
| `npm run test:widget` | Test E2E chat |
| `npm run migrate:vertex-models` | Migrar modelos Vertex obsoletos |
| `npm run build:widget` | Rebuild `widget.js` / `assist.js` |

## Docs

- [docs/widget-troubleshooting.md](./docs/widget-troubleshooting.md)
- [../ARCHITECTURE.md](../ARCHITECTURE.md)
