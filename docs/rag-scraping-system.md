# RAG — Sistema de Scraping de URLs

El módulo de scraping permite a los usuarios extraer contenido de cualquier URL pública y añadirlo como fuente de conocimiento al RAG de un agente. Está diseñado con principios SOLID para poder convertirse en un microservicio independiente.

---

## Arquitectura (SOLID)

```
src/lib/scraper/
├── types.ts        — interfaces (IPageScraper, IExtractor, ISegmenter, ScrapeBlock, ScrapeResult)
├── browser.ts      — scrapers de página (JinaScraper, PuppeteerScraper)
├── extractor.ts    — conversores HTML→Markdown (MarkdownExtractor, PassthroughExtractor)
├── segmenter.ts    — segmentadores de contenido (GeminiSegmenter, ChunkSegmenter, ComposedSegmenter)
└── index.ts        — punto de entrada público: función scrape()
```

Cada capa es independiente e intercambiable. El `index.ts` auto-detecta el entorno y ensambla el stack correcto.

---

## Pipeline de datos

```
URL
 │
 ▼  1. IPageScraper.scrape()
 │     → devuelve { title, html, isMarkdown? }
 │
 ▼  2. IExtractor.extract()
 │     → devuelve { title, text }   (Markdown limpio)
 │
 ▼  3. ISegmenter.segment()
 │     → devuelve ScrapeBlock[]
 │
 ▼
ScrapeResult { url, title, charCount, extractedBy, blocks }
```

---

## Implementaciones por capa

### Capa 1 — Scrapers de página (`browser.ts`)

| Clase | Cuándo se usa | Descripción |
|-------|--------------|-------------|
| `JinaScraper` | Producción / Vercel | `GET https://r.jina.ai/{url}` → Markdown limpio. Gratis, sin cuenta, sin Chrome. Devuelve `isMarkdown: true`. |
| `PuppeteerScraper` | Desarrollo local | `puppeteer-core` + Chrome del sistema (auto-detectado en 10 rutas). No funciona en Vercel Hobby (timeout 10s). |

**Selección automática en `index.ts`:**
```ts
const isProduction = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;
// producción → JinaScraper + PassthroughExtractor
// local      → PuppeteerScraper + MarkdownExtractor
```

**Chrome auto-detect (local):** busca en `PUPPETEER_EXECUTABLE_PATH` → `@sparticuz/chromium` → 10 rutas conocidas de Windows/Linux/Mac.

### Capa 2 — Extractores (`extractor.ts`)

| Clase | Entrada | Salida |
|-------|---------|--------|
| `PassthroughExtractor` | Markdown de Jina | Limpia metadatos Jina (`URL Source:`, `Markdown Content:`, `![Image N...]`), normaliza whitespace |
| `MarkdownExtractor` | HTML crudo (Puppeteer) | Strips `<script>/<style>/<svg>`, convierte con Turndown (tablas, sin imágenes, links solo texto) |

**Limpieza que aplica `PassthroughExtractor`:**
- Elimina bloques de metadatos: `Title:`, `URL Source:`, `Markdown Content:`, `Published Time:`, `Description:`
- Elimina separadores `===` y `---`
- Elimina imágenes markdown: `![Image N: ...](url)`
- Elimina líneas que son solo URLs

### Capa 3 — Segmentadores (`segmenter.ts`)

| Clase | Descripción |
|-------|-------------|
| `GeminiSegmenter` | Llama a `gemini-2.0-flash`. Identifica tipo de página, filtra ruido semántico (nav, footer, CTAs), segmenta en bloques de máx. 500 palabras. Requiere `GEMINI_API_KEY`. |
| `ChunkSegmenter` | Fallback determinístico. Parte por párrafos (`\n\n`) en chunks de 2000 chars. Sin IA. |
| `ComposedSegmenter` | Prueba `GeminiSegmenter`; si falla o devuelve `[]`, usa `ChunkSegmenter`. |

**Tipos de bloque que genera Gemini:** `general`, `faq`, `product`, `policy`, `docs`, `news`.

**Prompt de Gemini descarta:** navegación, footer, CTAs aislados, imágenes, URLs sueltas, contadores genéricos.

**Prompt de Gemini preserva:** descripciones con características, precios/planes, instrucciones paso a paso, FAQs completas, políticas con condiciones, datos de contacto.

---

## API Route

**Endpoint:** `POST /api/agents/[id]/rag/scrape`

**Auth:** sesión de usuario requerida; el agente debe pertenecer al usuario.

**Body:** `{ url: string }`

**Response:**
```json
{
  "ok": true,
  "url": "https://...",
  "title": "Título de la página",
  "charCount": 12500,
  "extractedBy": "ai",
  "blocks": [
    { "title": "...", "content": "...", "type": "product", "order": 1 }
  ]
}
```

**Configuración Vercel (`vercel.json`):**
```json
{
  "functions": {
    "src/app/api/agents/[id]/rag/scrape/route.ts": {
      "memory": 1024,
      "maxDuration": 60
    }
  }
}
```

---

## UI — Pestaña RAG (`/dashboard/agents/[id]`)

### Estados del flujo

```
idle → running → done
              ↘ error
```

### Barra de progreso

Animación continua con 5 fases temporales y curva ease-out por fase. Cada fase tiene un `label` descriptivo que se muestra al usuario.

### Lista de bloques

Cada bloque muestra:
- **Checkbox** — selecciona/deselecciona para incluir en RAG
- **Título** del bloque
- **Badge de tipo** (`general`, `faq`, `product`, etc.)
- **Contador de caracteres**
- **Botón "Ver"** — abre el modal de preview/edición

Badge visual en el header: `🤖 IA` si usó Gemini, `📄 Chunk` si usó el fallback determinístico.

### Modal de preview y edición

El modal se renderiza con **React Portal** (`createPortal(..., document.body)`) para evitar el bug de `position: fixed` dentro de contenedores con `transform` o `overflow`.

Funcionalidades dentro del modal:
- **Textarea editable** — el usuario puede limpiar, recortar o corregir el contenido antes de añadirlo
- **Badge "editado"** — aparece en amarillo cuando el contenido difiere del original
- **"Restaurar original"** — vuelve al texto de Jina/Puppeteer
- **Contador de chars en tiempo real** — actualiza al editar
- **Navegación Anterior / Siguiente** — cambia de bloque sin cerrar el modal
- **Toggle "Incluir en RAG" / "Incluido ✓"** — actualiza el checkbox de la lista

### Estados de React involucrados

| Estado | Tipo | Propósito |
|--------|------|-----------|
| `scrapeUrl` | `string` | URL introducida por el usuario |
| `scrapeStatus` | `'idle'\|'running'\|'done'\|'error'` | Fase del scraping |
| `scrapeStep` | `string` | Texto descriptivo de la fase actual |
| `scrapeProgress` | `number` | 0–100 para la barra |
| `scrapeBlocks` | `ScrapeBlock[] \| null` | Bloques devueltos por la API |
| `scrapeTitle` | `string` | Título de la página scrapeada |
| `scrapeExtractedBy` | `'ai'\|'chunk'\|null` | Qué segmentador se usó |
| `scrapeSelected` | `Set<number>` | Índices de bloques seleccionados |
| `scrapePreviewBlock` | `number \| null` | Índice del bloque abierto en modal |
| `scrapeEdits` | `Map<number, string>` | Ediciones por índice de bloque |

Al hacer "Agregar al RAG", se usan los contenidos de `scrapeEdits` (si existen) en lugar del `block.content` original.

---

## Variables de entorno relevantes

| Variable | Requerida | Descripción |
|----------|-----------|-------------|
| `GEMINI_API_KEY` | Recomendada | Sin esta variable, el segmentador cae a `ChunkSegmenter` (chunks mecánicos, sin filtrado de ruido). Obtener en [Google AI Studio](https://aistudio.google.com). |
| `PUPPETEER_EXECUTABLE_PATH` | Solo local | Ruta manual a Chrome si no está en las rutas estándar. |

> **Si los bloques muestran `📄 Chunk` en producción**, es señal de que `GEMINI_API_KEY` no está configurada en las variables de entorno de Vercel.

---

## Decisiones de diseño

### Por qué Jina AI Reader en lugar de Puppeteer en producción
Vercel Hobby tiene un timeout de 10 segundos por función — demasiado poco para lanzar Chrome. Jina (`r.jina.ai`) es una API externa gratuita sin cuenta que devuelve Markdown limpio de cualquier URL en < 5s.

### Por qué no Firecrawl
Firecrawl requiere plan de pago para uso regular. Jina ofrece la misma funcionalidad de forma gratuita.

### Por qué React Portal para el modal
Si el modal se renderiza dentro del árbol de divs del panel (que puede tener `overflow: hidden` o `transform`), `position: fixed` pierde su referencia y el modal queda "atrapado" dentro del contenedor. `createPortal` lo inyecta directamente en `<body>`, garantizando posicionamiento correcto siempre.

### Por qué SOLID en la capa scraper
El módulo puede extraerse a un microservicio Express/Fastify sin cambiar ninguna interfaz. Solo habría que exponer `scrape()` como endpoint HTTP. Los consumidores (landing, hub, gateway) llamarían a ese servicio en lugar de importar el módulo.

---

## Cómo extender a microservicio

1. Crear repo `scraper-service` con Express
2. Importar `src/lib/scraper/` (mismas interfaces, cero cambios)
3. Exponer `POST /scrape` que llame a `scrape(url)`
4. En la landing, reemplazar el import por un `fetch` al nuevo servicio
5. El resto de la UI no cambia

---

## Archivos de referencia

| Archivo | Rol |
|---------|-----|
| `src/lib/scraper/types.ts` | Contratos / interfaces |
| `src/lib/scraper/browser.ts` | JinaScraper, PuppeteerScraper |
| `src/lib/scraper/extractor.ts` | MarkdownExtractor, PassthroughExtractor |
| `src/lib/scraper/segmenter.ts` | GeminiSegmenter, ChunkSegmenter, ComposedSegmenter |
| `src/lib/scraper/index.ts` | Entrada pública: `scrape(url)` |
| `src/app/api/agents/[id]/rag/scrape/route.ts` | API route (adaptador delgado) |
| `src/app/dashboard/agents/[id]/page.tsx` | UI del panel RAG |
| `vercel.json` | Configuración de memoria y timeout de la función |
| `.env.example` | Variables requeridas documentadas |
