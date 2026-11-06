# Banco de pruebas de agentes

Preguntas reales de usuarios con la respuesta que **deben** dar según las fuentes del agente
(instrucciones y documentos). Un juez (Gemini, temperatura 0) compara cada respuesta con el caso y
con esas fuentes. Sirve para medir antes/después de cada cambio que toque la calidad del agente.

```bash
# Hub con modo de prueba (el banco se niega a correr si /health no anuncia "widget-chat-sandbox").
BACKEND_URL=https://…  AIBACKHUB_API_KEY=…  AIBACKHUB_TENANT_ID=default \
  npx tsx --env-file=.env scripts/eval/run-agent-eval.mts evals/navi-app.json [--only id1,id2] [--concurrency 3]
```

- **Nada sale del sistema:** no se guarda la conversación ni se cuenta uso; el hub corre en modo de
  prueba (las herramientas que escriben —tickets, webhooks, contactos— se simulan y no se capturan
  leads) y los casos no pueden llevar emails ni teléfonos en lo que escribe el usuario.
- **Veredictos:** `correct`, `partial`, `incorrect`, `hallucination` (dato que no está en las fuentes)
  y `wrong_refusal` ("no sé" cuando sí sabía). Puntuación = (correctas + ½ parciales) / total.
- **Resultados:** `evals/results/<agente>/<fecha>.{json,md}` (no se versionan). Cada corrida se
  compara con la anterior: empeoramientos y mejoras caso a caso.
- **Añadir un caso:** pregunta real (sin datos de contacto), `expect.behavior`, `expect.facts` con lo
  que debe decir, `mustNot` con lo que no debe inventar y `source` con la sección de la que sale.
