# Base de conocimiento — MatIAs (dashboard): uso del producto y camino trial

Documento para **soporte al cliente** sobre qué puede hacer un usuario en el panel, límites por plan y la **guía del camino trial**.  

**Cómo leerlo:** las secciones **1–6** son la base diaria (respuestas en lenguaje llano). La sección **7 (Anexo técnico)** solo sirve para incidencias raras, bucles o escalación a ingeniería; **no** es material para evaluar al cliente ni para un “examen” de implementación interna.

---

## 1. Agentes: cuántos puedo crear, cómo los creo y qué hago después

### 1.1 Cuántos agentes (y subagentes) según el plan

Los números concretos pueden cambiar con el producto; la referencia viva está en la lógica de planes del repositorio. Orientación típica:

| Plan (nombre en producto) | Agentes principales (máx.) | Subagentes por agente (máx.) | Herramientas nativas por agente (máx.) | RAG (conocimiento en documentos) |
|---------------------------|----------------------------|------------------------------|----------------------------------------|----------------------------------|
| **Free** | 1 | 0 | 2 | No |
| **Starter** | 2 | 1 | 3 | Sí |
| **Growth** | 5 | 3 | 5 | Sí |
| **Business** | 15 | 10 | 10 | Sí |
| **Enterprise** | Muy alto (según contrato) | Muy alto | Muy alto | Sí |

Si el cliente “no puede crear más agentes”, suele ser **tope del plan**, no un fallo: debe **mejorar plan** o borrar/agentar recursos.

### 1.2 Cómo crear un agente (pasos en pantalla)

1. Entrar en **Mis agentes** → **Nuevo agente** (`/dashboard/agents/new`).
2. Rellenar **nombre** (obligatorio).
3. Elegir **modelo** de la lista (se puede buscar por nombre o proveedor).
4. Opcional: **temperatura** y **máximo de tokens de salida** si quieren afinar el comportamiento; si no, dejar vacío y usa el valor por defecto del catálogo.
5. Opcional: **token público del widget** si integran el SDK con validación por token; si solo usan widgets creados en **Mis widgets** con su propio token, muchas veces pueden dejarlo vacío.
6. Escribir el **system prompt** (obligatorio): define personalidad, límites, idioma y cuándo escalar a humanos.
7. Pulsar **Crear agente**.

En la misma pantalla puede indicarse una **integración MCP** para conectar después; lo habitual es terminar el alta y seguir en la **ficha del agente**.

### 1.3 Después de crear el agente: qué puede hacer el cliente

Abriendo el agente en **Mis agentes** (`/dashboard/agents/[id]`):

| Pestaña | Qué hace el usuario aquí |
|---------|---------------------------|
| **General** | Cambiar nombre, descripción, modelo, system prompt, token público del widget, temperatura y tokens de salida. |
| **Herramientas** | Activar herramientas nativas permitidas por su plan (búsqueda web, webhook, Gmail, Slack, calendario, CRM, etc., según plan). Conectar **MCP** con credenciales **por este agente**, revisar sincronización y marcar qué herramientas remotas usa el modelo. |
| **RAG** | Activar conocimiento a partir de **URLs**, **texto** o **archivos** subidos; ideal para FAQs, manuales y políticas internas. En **plan free** el RAG del producto no está habilitado. |
| **Subagentes** | Crear “mini agentes” especializados bajo el principal, hasta el máximo que permita el plan. |

**Herramientas típicas en plan free:** búsqueda web y webhook. A partir de **starter** suelen sumarse más (p. ej. subida de archivos, Gmail, Slack); en planes superiores entran calendario, HubSpot, WhatsApp, Notion, etc.

### 1.4 Widgets: cuántos y relación con el agente

También dependen del plan (referencia en código: límites por plan en la misma librería de planes que los agentes). Regla práctica: **un widget se asocia a un agente** en el **Widget Builder**; el cliente configura aspecto, textos, posición y snippet, y puede probar la vista previa antes de publicar.

---

## 2. Camino trial (guía): qué es para el usuario

- Es un **recorrido guiado en 7 pasos** dentro del dashboard (mensajes encima de la pantalla con **Siguiente**, **Atrás** y **cerrar con X** en cualquier momento).
- Orden habitual: **Inicio** → **Crear agente** → **Mis agentes** → **Integraciones MCP** → **Widget Builder** → **Mis widgets** → **Ajustes**.
- **No crea** el agente ni el widget solo: al terminar cada bloque el usuario debe haber usado los formularios reales si quiere esos recursos.
- Si **aún no tiene agentes**, en el paso de “Mis agentes” el sistema puede llevarle directo a **crear el primero** (evita una lista vacía sin acción). Igual si **no tiene widgets** en el paso de widgets: puede abrirse el **constructor** para crear el primero.
- **Reiniciar guía** en el menú lateral borra el progreso del recorrido y vuelve a empezar. **Iniciar guía** solo tiene sentido mientras no haya completado el 100%.
- Cuando llega al **100%**, la tarjeta de progreso del camino trial **desaparece**; puede seguir usando **Reiniciar guía** si quiere repetir el recorrido.

---

## 3. Preguntas frecuentes del cliente (lenguaje llano)

**P: ¿La guía crea solo mi agente o mi widget?**  
R: **No.** Solo enseña dónde pulsar; tú rellenas y guardas en cada pantalla.

**P: ¿Por qué me manda a “nuevo agente” si el paso decía “Mis agentes”?**  
R: Porque **todavía no tienes ningún agente**; el producto te lleva a crearlos primero.

**P: ¿Por qué me abre el constructor de widgets si iba a “Mis widgets”?**  
R: Porque **no tienes widgets guardados**; te ayuda a crear el primero.

**P: Completé el recorrido y no veo agente nuevo.**  
R: Hay que **crearlo** en **Nuevo agente** y guardar; la guía no sustituye ese paso.

**P: Perdí la barra de progreso del camino trial.**  
R: Si ya completaste todos los pasos, **es normal** que desaparezca. Puedes usar **Reiniciar guía** si quieres repetir.

**P: ¿Cuántos agentes puedo tener?**  
R: Depende de tu **plan** (tabla de la §1.1). Si no te deja crear más, has llegado al límite o necesitas subir de plan.

**P: ¿Puedo ponerle documentación a mi agente?**  
R: Sí, en la ficha del agente, pestaña **RAG**, si tu plan lo incluye (desde **starter** en la tabla típica). En **free** no suele estar disponible el RAG del producto.

**P: ¿Dónde conecto Gmail o Slack?**  
R: En la ficha del agente → **Herramientas**, si tu plan incluye esa herramienta.

---

## 4. Tono recomendado con el cliente

- Hablar de **“tu plan”**, **“la ficha del agente”** y **“la guía”**, no de APIs ni de almacenamiento del navegador salvo que el cliente sea técnico.
- Si algo “salta de pantalla”, explicar la intención: **ayudar a crear el primer recurso** o **seguir el orden del recorrido**.
- No prometer comportamiento que dependa del **modelo externo** o del **hub**; sí prometer lo que hace el **panel** (formularios, límites, dónde se guarda al pulsar Guardar).

---

## 5. Comprobar conocimiento del soporte (solo uso del producto)

Usar preguntas como estas **no** exige saber nombres de archivos ni endpoints.

**Agentes y planes**

1. ¿Cuántos agentes principales puede tener, por lo general, un usuario en plan **free**?
2. ¿En qué plan suele estar disponible el **RAG** según la tabla de referencia del documento?
3. Nombra **dos** herramientas que suelen estar disponibles en el plan **free**.
4. Tras pulsar “Crear agente”, ¿en qué **cuatro pestañas** puede seguir configurando el usuario el mismo agente?

**Flujo y expectativas**

5. ¿La guía del camino trial **crea** sola el agente al llegar al último mensaje de un paso?
6. Un usuario sin agentes está en el paso “Mis agentes” del recorrido. ¿Qué es lo más probable que vea en pantalla y por qué?
7. ¿Qué botón del menú lateral puede usar si quiere **volver a cero** el recorrido guiado?

**Criterio / consejo**

8. Un cliente quiere un bot **muy creativo** para inventar slogans y otro **muy fijo** para políticas legales. ¿Qué le sugieres que diferencie entre ambos además del modelo (piensa en system prompt y temperatura)?

**Respuestas breves (clave interna):** 1 → Uno. 2 → Desde starter (según tabla). 3 → Por ejemplo búsqueda web y webhook. 4 → General, Herramientas, RAG, Subagentes. 5 → No. 6 → Pantalla de **crear agente** / alta, porque no hay agentes aún. 7 → **Reiniciar guía**. 8 → Distintos **system prompts** y **temperatura** más baja para el legal; más alta para slogans, siempre acorde al riesgo.

---

## 6. Consejos breves para que el cliente saque partido al agente

- **System prompt** concreto: rol, tono, idioma, límites y cuándo pasar a un humano.
- **RAG** (si su plan lo tiene): subir PDFs o pegar políticas y decir en el prompt que **priorice** esa información.
- **Herramientas**: activar solo las que vayan a usar; menos ruido = respuestas más estables.
- **MCP**: revisar que la integración muestre estado correcto tras poner credenciales; si falla, reintentar credenciales antes de culpar al modelo.
- **Widgets**: probar en vista previa; copiar el snippet solo cuando la configuración esté lista.

---

## 7. Anexo técnico (incidencias y escalación)

Usar solo si el caso es **bucle**, **sesión**, **datos que no cargan** o **bug sospechoso**.

### 7.1 Orden interno de las 7 etapas (IDs)

| Orden | ID interno | Nombre en UI (aprox.) | Ruta por defecto |
|------:|------------|------------------------|------------------|
| 1 | `inicio` | Inicio | `/dashboard` |
| 2 | `crear-agente` | Crear agente | `/dashboard/agents/new` |
| 3 | `mis-agentes` | Mis agentes | `/dashboard/agents` |
| 4 | `mcp` | Integraciones MCP | `/dashboard/mcp` |
| 5 | `widget-builder` | Widget Builder | `/dashboard/widget-builder` |
| 6 | `mis-widgets` | Mis widgets | `/dashboard/widgets` |
| 7 | `ajustes` | Ajustes | `/dashboard/settings` |

La primera etapa no marcada como hecha en almacenamiento local es la que el cliente intenta mostrar; puede combinarse con redirección automática de la guía si hay trial activo.

### 7.2 Listas vacías (comportamiento en cliente)

Tras cargar listas de agentes y widgets desde el panel:

- Si la etapa es **mis-agentes** y **no hay agentes**, la ruta efectiva puede ser **`/dashboard/agents/new`**.
- Si la etapa es **mis-widgets** y **no hay widgets**, la ruta efectiva puede ser **`/dashboard/widget-builder`**.

### 7.3 Etapa inicio (clics en menú)

Parte del recorrido pide **clic real** en el menú (no solo “Siguiente”). Hay reanudación en **sessionStorage** y un flag en **localStorage** para el flujo inicio ↔ agentes. Si “se corta” la guía, revisar bloqueo de almacenamiento del sitio (modo privado estricto, políticas IT).

### 7.4 Almacenamiento y “empezar de cero”

| Concepto | Dónde | Dónde ver el literal en código |
|----------|--------|--------------------------------|
| Progreso del camino | `localStorage` | `JOURNEY_STORAGE_KEY` en `src/components/onboarding/` |
| Legacy trial | `localStorage` | `trial-onboarding.tsx` y constantes adyacentes en el módulo principal |
| Reanudación entre rutas | `sessionStorage` | `INTERACTIVE_RESUME_KEY` |
| Flujo inicio ↔ agentes | `localStorage` | `INICIO_AGENTS_FLOW_KEY` |

**Reiniciar guía** limpia lo necesario y relanza el asistente. Alternativa: parámetros de URL documentados en el código (valores típicos `1` y `reset` sobre el mismo nombre de query).

### 7.5 APIs de conteo y errores

El cliente consulta agentes/widgets para saber si hay listas vacías. Respuesta **no OK** (p. ej. 401) puede tratarse como listas vacías y disparar la lógica de “ir a crear”. **Excepción de red** en `fetch` puede hacer que el código asuma datos presentes para no bloquear la guía. Ante 401: cerrar sesión y volver a entrar.

### 7.6 Asistente (Driver.js)

Espera breve al DOM entre pasos; overlay oscurece el fondo a propósito; botón **cerrar (X)** disponible en el popover.

### 7.7 Archivos de referencia (equipo)

- Onboarding: `src/components/onboarding/`
- Sidebar del dashboard: `src/app/dashboard/layout.tsx`
- Estilos del popover: `src/app/globals.css`
- Límites de planes (agentes, herramientas, RAG): `src/lib/agent-plans.ts`
- Alta de agente: `src/app/dashboard/agents/new/page.tsx`
- Ficha de agente: `src/app/dashboard/agents/[id]/page.tsx`

### 7.8 Matriz síntoma → acción (técnico)

| Síntoma | Acción |
|---------|--------|
| Redirecciones solas con trial | Explicar roadmap; **Reiniciar guía** o completar pasos. |
| Bucles | Reset por URL según código o **Reiniciar guía**; limpiar session del sitio. |
| Guía no arranca sin trial | Arranque automático del recorrido largo no aplica; revisar plan o botón de guía. |
| Pantalla atenuada | Overlay del asistente; no es fallo de monitor. |

### 7.9 Escalación a ingeniería

Incluir: usuario (sin contraseñas), URL, navegador, plan/trial, pasos para reproducir, capturas de **Ajustes** si aplica, y si usaron **Reiniciar guía** o reset por URL. Solo si hace falta: listado de claves de almacenamiento según §7.4 y estado HTTP de las peticiones de listado (sin pegar datos sensibles).

### 7.10 Límites de este documento

No cubre precios legales ni runbooks de base de datos. Los números de plan deben contrastarse con `agent-plans` y producto si hay duda.

---

*Última revisión alineada con el panel MatIAs (dashboard). Prioridad: secciones 1–6 para soporte al cliente; sección 7 para incidencias.*
