# Base de conocimiento — Camino trial y onboarding guiado del dashboard (MatIAs)

Documento operativo para **soporte técnico a clientes** sobre el onboarding guiado (“Camino trial”), rutas, almacenamiento y comportamiento esperado. Basado en la implementación actual del panel (`/dashboard`).

---

## 1. Qué es el “Camino trial”

- Es un **roadmap guiado en 7 etapas** dentro del dashboard, pensado sobre todo para usuarios con **trial activo**.
- Usa la librería **`driver.js`** (popovers, overlay, pasos anclados en el DOM mediante atributos de datos en componentes).
- El progreso se guarda en el **navegador del cliente** (no sustituye validación en servidor).

**Objetivo para el cliente:** recorrer inicio → crear agente → agentes → MCP → widget builder → widgets → ajustes, con ayuda contextual.

---

## 2. Orden fijo de las 7 etapas

| Orden | ID interno        | Nombre en UI (aprox.) | Ruta por defecto              | Ancla menú lateral (DOM) |
|------:|--------------------|------------------------|--------------------------------|---------------------------|
| 1     | `inicio`           | Inicio                 | `/dashboard`                   | `sidebar-inicio`          |
| 2     | `crear-agente`     | Crear agente           | `/dashboard/agents/new`        | `sidebar-agentes`         |
| 3     | `mis-agentes`      | Mis agentes            | `/dashboard/agents`            | `sidebar-agentes`         |
| 4     | `mcp`              | Integraciones MCP      | `/dashboard/mcp`               | `sidebar-mcp`             |
| 5     | `widget-builder`   | Widget Builder         | `/dashboard/widget-builder`    | `sidebar-widget-builder`  |
| 6     | `mis-widgets`      | Mis widgets            | `/dashboard/widgets`           | `sidebar-widgets`         |
| 7     | `ajustes`          | Ajustes                | `/dashboard/settings`          | `sidebar-ajustes`         |

La primera etapa **no completada** en `localStorage` es la que el sistema intenta impulsar (redirección + arranque automático de la guía si aplica).

---

## 3. Cuándo el sistema **cambia la ruta** (listas vacías)

Tras consultar **`GET /api/agents`** y **`GET /api/widgets`**:

| Etapa           | Si…                         | Ruta efectiva del paso (en lugar de la tabla) |
|-----------------|-----------------------------|-----------------------------------------------|
| `mis-agentes`   | **0 agentes** en API        | `/dashboard/agents/new` (alta directa)       |
| `mis-widgets`   | **0 widgets** en API       | `/dashboard/widget-builder` (crear primero)  |

**Mensaje al cliente:** “Si aún no tienes agentes/widgets, el camino te lleva directo a crear el primero en lugar de quedarte solo en la lista vacía.”

**Soporte:** si el cliente ve un salto a “nuevo agente” o “widget builder” sin haber pasado por la lista, puede ser **normal** por esta regla.

---

## 4. Etapa especial `inicio` (clics reales + navegación)

- Parte de la guía **no usa “Siguiente”**: hay que **hacer clic** en el menú (p. ej. Mis agentes, luego Inicio).
- Al navegar, se usa **`sessionStorage`** para **reanudar** la guía en el paso correcto; la clave es el **valor string** de la constante `INTERACTIVE_RESUME_KEY` en el módulo de onboarding principal bajo `src/components/onboarding/`.
- Hay un flag en **`localStorage`**: `afhub_inicio_agents_flow_v1` mientras el flujo permite estar en `/dashboard/agents` sin que el roadmap te devuelva a la fuerza a `/dashboard` en medio del tutorial.

Si el cliente dice “me saca de Mis agentes al volver al inicio” o “la guía no continúa”, revisar que no tengan bloqueadores de **sessionStorage** / **localStorage** (modo incógnito estricto, extensiones, políticas IT).

---

## 5. Almacenamiento (qué borrar para “empezar de cero”)

| Concepto | Dónde | Cómo obtener el literal exacto |
|----------|--------|--------------------------------|
| Progreso del camino (journey v2) | `localStorage` | Valor de `JOURNEY_STORAGE_KEY` en el módulo principal de onboarding (`src/components/onboarding/`). |
| Persistencia legacy (trial) | `localStorage` | Constante en `trial-onboarding.tsx` del mismo directorio; el botón “Reiniciar guía” también la limpia. |
| Reanudación entre rutas | `sessionStorage` | Valor de `INTERACTIVE_RESUME_KEY` en el módulo principal de onboarding. |
| Flujo inicio ↔ agentes | `localStorage` | Valor de `INICIO_AGENTS_FLOW_KEY` en el módulo principal de onboarding. |

**Reiniciar guía** en el sidebar ejecuta la limpieza de journey + reanudación + flag inicio y relanza el asistente visual desde la primera etapa pendiente.

**Soporte remoto (instrucciones al cliente):**  
DevTools → Application → Local Storage / Session Storage → borrar las entradas anteriores (usar los literales definidos en las constantes del código) para el origen del sitio, recargar.

---

## 6. Arranque automático de la guía

- El auto-arranque del camino depende de **`isTrialActive`** (hook de suscripción en el cliente).
- Si **no** hay trial activo, el recorrido largo **no** se dispara solo (salvo forzar con URL, ver §8).
- Tras **completar una etapa** (último paso “Listo”), se marca la etapa en `localStorage` y el efecto puede **redirigir** a la siguiente ruta y **abrir** el siguiente bloque de pasos de Driver.js.

---

## 7. Interfaz en el sidebar

- **Camino trial:** barra de % y texto de etapa **solo mientras el camino no está al 100%**. Completado todo, la tarjeta **se oculta** (no queda fijo “100%” en pantalla).
- **Iniciar guía:** visible **solo si el camino no está al 100%**.
- **Reiniciar guía:** **siempre** visible; resetea progreso y vuelve a lanzar el asistente desde la primera etapa pendiente.

---

## 8. Parámetros de URL (forzar o resetear)

El efecto de onboarding lee **un nombre de parámetro en la query string** (el literal del nombre está en el mismo archivo donde se comparan los valores `'1'` y `'reset'` contra `searchParams` / `URLSearchParams`).

- **Forzar:** añadir `?<nombre>=1` (nombre según fuente).
- **Reset:** añadir `?<nombre>=reset` — borra journey v2, estado de reanudación (`INTERACTIVE_RESUME_KEY`), flag `INICIO_AGENTS_FLOW_KEY` y elimina ese parámetro de la URL para evitar bucles.

Quien depure sin abrir el repositorio puede inspeccionar en Network o en la barra de direcciones qué parámetro desaparece tras un reset exitoso.

Útil si el cliente quedó en un estado raro y soporte quiere un reset limpio sin tocar DevTools a mano (aunque el botón Reiniciar suele bastar).

---

## 9. Comportamiento técnico del asistente (Driver.js) — para explicar síntomas

- **Espera al DOM:** antes de avanzar de paso o al iniciar, se espera a que exista el selector del paso (polling breve). Si la página carga lento, puede haber un **retraso corto** antes del siguiente popover.
- **Pasos “solo clic”:** en algunos pasos se oculta “Siguiente”; hay que hacer clic en el elemento resaltado.
- **Overlay:** velo semitransparente sobre el resto de la pantalla; es intencional para foco (no es un “bug de pantalla negra”).
- **Tras 100% del camino:** “Iniciar guía” abre una **guía corta contextual** de la página actual (`postJourneyPageSteps`), no el roadmap completo de 7 etapas.

---

## 10. Archivos de referencia (equipo técnico)

- Lógica principal del onboarding y journey: directorio `src/components/onboarding/` (constantes `JOURNEY_STORAGE_KEY`, `INTERACTIVE_RESUME_KEY`, `INICIO_AGENTS_FLOW_KEY`, integración con `driver.js`).
- Sidebar, barra de progreso y botones: `src/app/dashboard/layout.tsx`
- Estilos popover / overlay / indicador de clic: `src/app/globals.css` (clases `afhub-*`, `driver-*`)
- Anclas en páginas: atributos de datos en componentes (buscar en el código el patrón de selectores usado por Driver en formularios y sidebar).

---

## 11. Preguntas frecuentes (respuestas cortas)

**P: ¿Completar la guía crea el agente o el widget automáticamente?**  
R: **No.** Marcar etapa “hecha” es al **terminar los pasos** (último “Listo”). Crear agente/widget sigue siendo acción del usuario en los formularios.

**P: ¿Por qué me manda a “nuevo agente” si la etapa es “Mis agentes”?**  
R: Porque **no hay ningún agente** en la API; el camino prioriza **alta** en `/dashboard/agents/new`.

**P: ¿Por qué abre Widget Builder si la etapa es “Mis widgets”?**  
R: Porque **no hay widgets** guardados; el camino prioriza **crear el primero** en el builder.

**P: La guía no arranca en Mis agentes / Mis widgets.**  
R: Puede estar **esperando** el conteo de API (`/api/agents`, `/api/widgets`). Si la petición **no es OK** (p. ej. 401), el cuerpo se ignora y se cuenta como **0 agentes / 0 widgets** → puede activarse la ruta de “lista vacía”. Si **falla la red** (excepción al `fetch`), el código marca **“hay datos”** para no bloquear el flujo. Revisar sesión, Network y consola.

**P: ¿Cómo vuelvo al inicio del recorrido?**  
R: **Reiniciar guía** en el sidebar (o limpiar `afhub_onboarding_journey_v2` + recargar).

**P: Completé todo y desapareció la barra de progreso.**  
R: **Esperado.** Al 100% se oculta la tarjeta “Camino trial”; sigue **Reiniciar guía** si quieren repetir.

---

## 12. Tono recomendado con el cliente

- Enfatizar que el camino es una **ayuda guiada**, no un reemplazo de la documentación ni de la creación real de recursos.
- Si hay confusión con **redirecciones**, explicar las rutas **efectivas** con listas vacías (§3).
- Si hay bloqueos, preguntar por **navegador privado**, **extensiones** y **cookies/almacenamiento** del sitio.
- No prometer que la **guía asistida** corrija datos en servidor; solo orienta la UI.

---

## 13. Glosario y ejemplo de `afhub_onboarding_journey_v2`

**IDs de etapa** (clave en `done`): `inicio` | `crear-agente` | `mis-agentes` | `mcp` | `widget-builder` | `mis-widgets` | `ajustes`.

**Ejemplo de valor en `localStorage`:**

```json
{
  "v": 2,
  "done": {
    "inicio": true,
    "crear-agente": true,
    "mis-agentes": false
  }
}
```

La siguiente etapa pendiente es la **primera** de la lista fija (§2) cuya clave no está en `true`. Si falta una clave, se considera pendiente.

---

## 14. Inventario de anclas de paso en el DOM (referencia rápida)

Los valores siguientes son los **literales** usados en selectores del onboarding (coinciden con el atributo de datos en JSX del repositorio).

| Área | Valores típicos | Notas |
|------|-----------------|--------|
| Sidebar | `sidebar-inicio`, `sidebar-agentes`, `sidebar-mcp`, `sidebar-widget-builder`, `sidebar-widgets`, `sidebar-ajustes` | Enlaces del `layout` del dashboard. |
| Inicio | `dashboard-quick-actions`, `dashboard-upgrade` | Atajos y bloque de plan. |
| Alta / edición agente | `agent-name`, `agent-model`, `agent-create-submit`, `agent-edit-model`, `agent-edit-save` | `agents/new` y `agents/[id]`. |
| Lista agentes | `agents-new`, `agents-list` | Lista vacía puede llevar ancla de paso en el estado vacío (tarjeta). |
| MCP | `mcp-catalog` | Página catálogo. |
| Widget builder | `widget-builder-header`, `widget-builder-name`, `widget-builder-agent`, `widget-builder-branding`, `widget-builder-chat-texts`, `widget-builder-support`, `widget-builder-look`, `widget-builder-position`, `widget-builder-embed-options`, `widget-builder-preview`, `widget-builder-snippet-panel`, `widget-builder-save`, `widget-builder-copy` | El mismo bloque de formulario se reutiliza en etapa `mis-widgets` vacía. |
| Lista widgets | `widgets-new`, `widgets-list` | |
| Ajustes | `settings-account`, `settings-billing` | |

Si un paso “no aparece”, suele ser porque **falta el nodo** en el DOM (condición de carga, ruta distinta o ancla renombrada en código).

---

## 15. Cómo se calculan “hay agentes” y “hay widgets”

En cliente se llama a:

- **`GET /api/agents`** — si la respuesta incluye un array `agents` con **longitud > 0**, `hasAgents = true`.
- **`GET /api/widgets`** — si `widgets` tiene **longitud > 0**, `hasWidgets = true`.

Hasta que esas peticiones terminen, las etapas `mis-agentes` y `mis-widgets` **esperan** (`loaded`) antes de decidir redirección “lista vacía → alta/builder”.

**Si `fetch` lanza error** (red caída, CORS raro, etc.): se marca `loaded: true` y `hasAgents` / `hasWidgets` en **true** para no dejar el flujo colgado.

**Si la respuesta no es `ok`** (p. ej. **401** no autorizado, **500**): el JSON no se usa; los arrays se tratan como vacíos → `hasAgents` / `hasWidgets` pueden quedar en **false** y aplicarse la lógica de **lista vacía** (redirección a alta / builder aunque en servidor “existiera” sesión válida en otro contexto).

**Soporte:** cookie caducada o 401 en Network → **cerrar sesión y volver a entrar**; comprobar que `/api/agents` y `/api/widgets` devuelvan **200** con el payload esperado.

---

## 16. Matriz síntoma → causa probable → qué hacer

| Síntoma | Causa probable | Acción sugerida |
|---------|----------------|------------------|
| Me redirige solo de una página a otra | Trial activo + etapa pendiente del camino | Normal; explicar roadmap. Si molesta: Reiniciar guía o completar etapa. |
| Bucle de redirecciones | Estado corrupto en storage + reanudación | Parámetro de reset en URL (§8) o Reiniciar guía; borrar `sessionStorage` del sitio. |
| “Siguiente” no hace nada al instante | Espera al DOM del siguiente paso | Esperar 1–3 s; si página pesada, más. |
| No ve botón Siguiente | Paso “solo clic” (etapa inicio) | Debe hacer clic en el menú indicado. |
| La guía no arranca | Sin trial activo | El arranque automático del recorrido no corre; puede usar guía manual si está el botón o revisar suscripción. |
| La guía no arranca en Mis agentes/widgets | Conteo aún cargando | Esperar; recargar. Revisar Network a `/api/agents` y `/api/widgets`. |
| Lista vacía pero no me lleva a “nuevo” | API devuelve agentes o widgets que el cliente no “ve” | Explicar que el **criterio es el array de la API**, no solo la UI. |
| Pantalla atenuada | Overlay de `driver.js` | Es el foco del paso; no es error de monitor. |
| Perdí el progreso del camino | Otro navegador / borró datos / otro dispositivo | `localStorage` es por origen + navegador; es esperado. |

---

## 17. Trial, suscripción y sesión

- **`isTrialActive`** viene del contexto de suscripción del dashboard (no duplicar lógica aquí): si el producto considera que el trial **no** está activo, el **arranque automático del recorrido** no debe dispararse como en trial.
- **Sesión:** las APIs del conteo y del panel suelen depender de cookie de sesión (p. ej. `afhub_session` en rutas API). Sin sesión válida, no hay datos fiables para el onboarding guiado.
- **Plan y límites** (agentes, widgets, conversaciones) son reglas de **negocio** aparte del camino; el roadmap no valida cupos al marcar una etapa hecha.

---

## 18. Privacidad y datos locales

- El progreso del camino (`journey_v2`) y flags asociados viven en el **navegador del usuario**.
- **No** sustituye auditoría ni historial en servidor.
- Cumplimiento / borrar datos: orientar a **limpiar sitio** en el navegador o usar Reiniciar guía según política interna.

---

## 19. Admin en suplantación (“impersonate”)

Si un administrador navega el dashboard **actuando como otro usuario**, el cliente “ve” el mismo panel y el mismo camino trial **en contexto de esa cuenta**. El soporte debe tener claro si el ticket es del **usuario final** o de una **sesión de depuración** de admin para no mezclar expectativas.

---

## 20. Accesibilidad y controles del asistente (Driver.js)

- En pasos del **camino trial** (modo journey) suele desactivarse el cierre fácil con teclado para forzar el flujo; en guías **post-100%** suele permitirse más libertad (cerrar, etc.), según implementación actual.
- Los botones **Siguiente / Atrás** pueden deshabilitarse brevemente mientras se **espera al DOM** del siguiente paso (`aria-busy` en botones del popover).
- Si el cliente usa **lector de pantalla** o **navegación solo teclado**, puede haber fricción en pasos “solo clic” en el menú lateral; valorar ofrecer **Reiniciar guía** + enlace directo a la ruta de la etapa (URLs de §2 y §3).

---

## 21. Producto: agente y widget (contexto mínimo para soporte)

- **Agente:** el panel crea/edita **agentes de cliente** en la landing; la guía de alta usa nombre, modelo y envío del formulario. La integración con hub/MCP es tema aparte del solo onboarding visual.
- **Widget:** el **Widget Builder** configura apariencia, textos, posición, token en snippet opcional, etc. Guardar persiste en API; copiar pone el HTML en el portapapeles.
- **Documentación pública del embed:** en la UI del builder suele existir enlace tipo **`/widget`** (SDK); útil si el cliente pregunta por integración fuera del panel guiado.

---

## 22. Escalación a ingeniería (plantilla de ticket)

Incluir siempre:

1. **Usuario / cuenta** (sin contraseñas).  
2. **URL exacta** y **navegador**.  
3. **¿Trial activo?** (lo que vean en Ajustes / facturación).  
4. **Captura o lista** de `localStorage` / `sessionStorage`: claves cuyos literales salen de `JOURNEY_STORAGE_KEY`, `INICIO_AGENTS_FLOW_KEY`, `INTERACTIVE_RESUME_KEY` y la constante legacy en `trial-onboarding.tsx`.  
5. **Respuestas** de `/api/agents` y `/api/widgets` (solo status y tamaño del array, sin pegar datos sensibles completos).  
6. **Pasos para reproducir** (clics desde inicio).  
7. Si usaron el **reset por URL** (§8) o **Reiniciar guía** y el resultado.

---

## 23. Límites de lo que cubre este documento

- No describe **precios**, **facturación Stripe/Lemon** ni **políticas legales** del producto.
- No sustituye **runbooks de incidentes** de backend o base de datos.
- Cualquier cambio en el módulo de onboarding (`src/components/onboarding/`) o en las rutas del dashboard puede **desalinear** este texto: conviene revisar el código al cerrar sprints que toquen onboarding.

---

## 24. Consejos para agentes potentes (lo que ofrece la herramienta)

La **alta** (`/dashboard/agents/new`) pide lo esencial: nombre, modelo, **system prompt obligatorio**, y opciones como temperatura / máximo de tokens de salida y token público del widget. El mensaje en pantalla indica que **RAG y herramientas** se afinan en la **ficha del agente** tras crearlo: conviene explicar ese flujo en dos fases (crear → editar pestañas).

### 24.1 System prompt (base del comportamiento)

- Es **obligatorio** en el alta; sin él no se crea el agente.
- Recomendar **estructura clara**: rol, público objetivo, tono, qué puede y no puede hacer, **idioma** de respuesta, cómo manejar datos sensibles y **cuándo derivar a humanos**.
- Si más adelante activan **RAG** o **MCP**, alinear el texto: “prioriza la documentación indexada”, “usa herramientas solo cuando aporten”, “si falta contexto, dilo”.

### 24.2 Modelo de IA y parámetros de inferencia

- El catálogo viene del **hub** (`useClientModels` según plan); en la UI se puede **buscar** por nombre, proveedor o capacidad y ver **proveedor**, **badge** (p. ej. rápido vs potente) y **tamaño de contexto** cuando el catálogo lo expone.
- Evitar modelos marcados como **deprecados** salvo migración temporal.
- Algunos modelos exigen un **plan mínimo** (`planMeetsModelMin` en código): si el cliente no ve un modelo, revisar suscripción.
- **Temperatura** (0–2) y **máx. tokens de salida** son opcionales; vacío deja el **comportamiento por defecto del catálogo**. Orientación general: temperatura **baja** para soporte, políticas y hechos; **más alta** para lluvia de ideas o redacción creativa (siempre dentro del marco del system prompt).

### 24.3 Pestañas de la ficha del agente (`/dashboard/agents/[id]`)

| Pestaña | Para qué sirve |
|---------|----------------|
| **General** | Nombre, descripción, modelo, system prompt, token público del widget, parámetros de inferencia. |
| **Herramientas** | Herramientas nativas del producto (catálogo `TOOLS` en `src/lib/agent-plans.ts`), límites por plan, y **integraciones MCP** (conexiones por agente, sincronización, activación de herramientas expuestas por el servidor). |
| **RAG** | Activar conocimiento contextual; fuentes por **URL**, **texto** o **archivo** (subida vía API de la ficha). |
| **Subagentes** | Agentes auxiliares bajo el orquestador (límites según plan). |

### 24.4 Herramientas nativas y planes (resumen operativo)

Los límites numéricos y la lista exacta viven en **`AGENT_PLAN_LIMITS`** / **`getAgentLimits`** en `src/lib/agent-plans.ts`. Resumen orientativo para soporte:

| Plan (típico) | Agentes | Subagentes / agente | Herramientas / agente | RAG |
|---------------|---------|----------------------|------------------------|-----|
| **free** | 1 | 0 | 2 | Desactivado |
| **starter** | 2 | 1 | 3 | Activado |
| **growth** | 5 | 3 | 5 | Activado |
| **business** | 15 | 10 | 10 | Activado |
| **enterprise** | amplio | amplio | amplio | Activado |

**Herramientas disponibles por plan** (identificadores en código): en **free** suelen ser **Web Search** y **Webhook**; en **starter** se suman entre otras **File Upload**, **Gmail**, **Slack**; en **growth** entran **Google Calendar**, **HubSpot**, **WhatsApp Business**, **Notion**; **Zapier** aparece a nivel **business**. Si el cliente “no ve” una herramienta, casi siempre es **plan** o tope `toolsPerAgent`.

**Consejos de uso:** Web Search para datos **actualizados**; Webhook para **integrar APIs propias** o backends internos con secret opcional; File Upload cuando el flujo necesita **documentos del usuario**; el resto según el stack real del cliente (CRM, calendario, mensajería).

### 24.5 RAG (conocimiento propio)

- Solo tiene sentido en planes con **`ragEnabled: true`** (desde **starter** en la tabla anterior).
- Activar RAG **y** cargar fuentes; en la lista de agentes se distingue “RAG activo sin fuentes” vs “RAG cargado”.
- En el **system prompt**, pedir que **cite o se base** en la documentación cuando exista, y que indique **lagunas** si la fuente no cubre la pregunta.
- Subir **archivos** relevantes y nombres de fuente **descriptivos** mejora trazabilidad en soporte al cliente.

### 24.6 MCP (Model Context Protocol)

- Las credenciales son **por agente**; el mismo conector puede usar **login distinto** en otro agente.
- Revisar **estado de sincronización** (OK / pendiente / error) y **re-sincronizar** o corregir credenciales antes de dar por fallido el modelo.
- Tras sync OK, el cliente puede **elegir qué herramientas MCP** entran en el contexto (no hace falta habilitar todas si generan ruido o coste).

### 24.7 Subagentes

- Útiles para **separar especialidades** (p. ej. un subagente técnico y otro de redacción) bajo un orquestador.
- Respetar el tope **`subAgentsPerAgent`** del plan; si no pueden crear más, es límite de producto, no un bug.

### 24.8 Token público del widget (alta / General)

- Opcional en el formulario de alta. Si se define, el SDK debe enviar el mismo valor en **`token`** y la API puede validarlo con cabecera **`X-Widget-Token`** (como indica la propia UI).
- Si solo usan widgets creados en **Mis widgets** con token `wt_…`, suele ser razonable **dejarlo vacío** en el agente.

### 24.9 Cierre operativo

- **Nombre y descripción** claros ayudan en equipos con muchos agentes y al vincular **widgets**.
- Tras cambios importantes, probar el agente desde el **widget** o el canal que usen y comprobar **sincronización con AIBackHub** (`agentHubId`, estado de sync) si el ticket es de “no actualiza en el hub”.

---

*Última revisión: onboarding en `src/components/onboarding/`, layout `src/app/dashboard/layout.tsx`, estilos `src/app/globals.css`, límites y herramientas en `src/lib/agent-plans.ts`, fichas de agente en `src/app/dashboard/agents/`. Actualizar si cambian claves de storage, planes, catálogo de herramientas o reglas de RAG/MCP.*
