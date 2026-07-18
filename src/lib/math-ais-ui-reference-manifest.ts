/**
 * Manifest de capturas de referencia del dashboard BotIvA para Math-ais.
 * Archivos: public/assets/platform-ui-ref/
 *
 * Tras cambios: npx tsx --env-file=.env scripts/patch-math-ais-onboarding.mts
 */

export type MathAisUiReferenceEntry = {
  id: string;
  file: string;
  title: string;
  screen: string;
  ragDescription: string;
};

const PUBLIC_PATH_PREFIX = '/assets/platform-ui-ref';

export const MATH_AIS_UI_REFERENCE_MANIFEST: MathAisUiReferenceEntry[] = [
  {
    id: 'dashboard-home',
    file: 'dashboard-home.png',
    title: 'Home dashboard',
    screen: '/dashboard',
    ragDescription:
      'Referencia UI BotIvA — Home del panel. Sidebar izquierda (BotIvA logo, Dashboard, Quick Start, Inbox, Chats, Agentes y widgets, Cuenta). Saludo "Hola, Mati", fecha, badge PANEL DE CONTROL, filtro Últimos 30 días, plan Business. Tarjetas: Conversaciones, Mensajes en rango, Agentes (19), Widgets (10). Uso del mes, Estado del sistema (verde "Todo funciona correctamente"), Suscripción y cuenta, Analítica de widgets. Burbuja Math-ais abajo a la derecha con POWERED BY BOTIVA.',
  },
  {
    id: 'login',
    file: 'login.png',
    title: 'Login BotIvA',
    screen: '/login',
    ragDescription:
      'Referencia UI BotIvA — Pantalla de inicio de sesión. Logo BotIvA (icono orb), título "BotIvA", subtítulo "Inicia sesión en tu cuenta". Campos Email y Contraseña, verificación Cloudflare "Operación exitosa", botón teal "Iniciar sesión", enlaces olvidé contraseña y crear cuenta. NO es el dashboard; es auth previo al panel.',
  },
  {
    id: 'quick-start',
    file: 'quick-start.png',
    title: 'Quick Start',
    screen: '/dashboard/quick-start',
    ragDescription:
      'Referencia UI BotIvA — Quick Start. Título con icono sparkle. Texto: sube hasta 3 PDFs para widget embebible en menos de 2 minutos. Zona drag-and-drop PDF (máx 10 MB, hasta 3 archivos). Botón "Crear widget en 1 clic".',
  },
  {
    id: 'inbox',
    file: 'inbox.png',
    title: 'Bandeja de entrada (Inbox)',
    screen: '/dashboard/inbox',
    ragDescription:
      'Referencia UI BotIvA — Bandeja de Entrada. Subtítulo conversaciones widgets y WhatsApp. Tabs Sin responder / Respondida, Abiertas (con contador) / Resueltas. Tarjetas de conversación con avatar, nombre visitante, badges Sin responder y En vivo, preview mensaje, botones Ver y responder, Resolver, Eliminar.',
  },
  {
    id: 'chats',
    file: 'chats.png',
    title: 'Chats (historial)',
    screen: '/dashboard/chats',
    ragDescription:
      'Referencia UI BotIvA — Chats. Historial de conversaciones de widgets. Tabs Activos / Todos / Cerrados, buscador, filtro por widget. Lista lateral con sesiones (Sesión xxx, ivan), timestamps, preview, tags Asesor Taller, Positivo, Escalado, Humano, contador msg. Panel derecho vacío hasta seleccionar chat.',
  },
  {
    id: 'agents',
    file: 'agents.png',
    title: 'Mis agentes',
    screen: '/dashboard/agents',
    ragDescription:
      'Referencia UI BotIvA — Mis agentes. Barra de cuota (19 agentes, plan Business ilimitados). Botón Nuevo agente. Grilla de tarjetas de agentes con nombre, descripción, modelo (Gemini), badge ACTIVO, Hub sincronizado, fecha actualización, botones Configurar y Pausar.',
  },
  {
    id: 'widgets',
    file: 'widgets.png',
    title: 'Mis widgets',
    screen: '/dashboard/widgets',
    ragDescription:
      'Referencia UI BotIvA — Mis widgets. Barra multiagente (widgets activos, derivaciones, paralelo, sesiones routing). Grilla de widgets con avatar, nombre, descripción agente, ACTIVO, posición, tema claro, Editar y Probar.',
  },
  {
    id: 'widget-builder',
    file: 'widget-builder.png',
    title: 'Widget builder',
    screen: '/dashboard/widget-builder',
    ragDescription:
      'Referencia UI BotIvA — Widget Builder paso 1 Identidad. Pasos 1-4 (Identidad, Apariencia, Comportamiento, Publicar). Campo nombre del widget, toggle multiagente Business/Enterprise. Grilla de agentes para elegir cuál alimenta el widget.',
  },
];

export function mathAisUiReferencePublicPath(file: string): string {
  return `${PUBLIC_PATH_PREFIX}/${file}`;
}

export function mathAisUiReferencePublicUrl(file: string, appOrigin?: string): string {
  const path = mathAisUiReferencePublicPath(file);
  const base = (appOrigin || process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
  return base ? `${base}${path}` : path;
}

export function mathAisUiReferenceRagBlocks(appOrigin?: string): Array<{
  name: string;
  content: string;
}> {
  return MATH_AIS_UI_REFERENCE_MANIFEST.map((entry) => {
    const url = mathAisUiReferencePublicUrl(entry.file, appOrigin);
    return {
      name: `Ref. UI BotIvA — ${entry.title}`,
      content: [
        `# ${entry.title}`,
        `Pantalla: ${entry.screen}`,
        `URL referencia: ${url}`,
        `Archivo: public/assets/platform-ui-ref/${entry.file}`,
        '',
        entry.ragDescription,
        '',
        'Usar para comparar si una captura del usuario coincide con UI BotIvA o es contenido externo.',
      ].join('\n'),
    };
  });
}

/** Mapa id → URL pública (útil en logs y scripts). */
export function mathAisUiReferenceUrlMap(appOrigin?: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of MATH_AIS_UI_REFERENCE_MANIFEST) {
    out[entry.id] = mathAisUiReferencePublicUrl(entry.file, appOrigin);
  }
  return out;
}
