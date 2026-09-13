/**
 * Etiquetas y fragmento de instalación del listado de widgets.
 *
 * Estaban dentro de los componentes, sin pruebas, y la fecha era una tercera
 * copia literal del mismo `formatUpdatedLabel` que ya vivía en la tarjeta de
 * agentes — con el fallo de zona horaria incluido. Aquí se reutiliza el de
 * `panel-dates`, que ya mide en la zona del panel.
 */

const POSICIONES: Record<string, string> = {
  'bottom-right': 'Abajo der.',
  'bottom-left': 'Abajo izq.',
  'top-right': 'Arriba der.',
  'top-left': 'Arriba izq.',
};

export function formatPosition(position: string): string {
  return POSICIONES[position] ?? position.replace(/-/g, ' ');
}

export function formatTheme(theme: string): string {
  if (theme === 'dark') return 'Oscuro';
  if (theme === 'light') return 'Claro';
  return theme;
}

export function multiAgentLabel(mode?: string): string {
  if (mode === 'parallel') return 'Paralelo';
  if (mode === 'pipeline') return 'Pipeline';
  return 'Triaje';
}

/**
 * Fragmento que el cliente pega en su web.
 *
 * El token se escapa: viaja dentro de comillas simples en un `<script>`, y una
 * comilla suelta rompería la página de quien lo pegue.
 */
export function buildEmbedSnippet(token: string, origin: string): string {
  const base = origin.replace(/\/+$/, '');
  const seguro = (token || 'wt_…').replace(/\\/g, '\\\\').replace(/'/g, "\\'");

  return [
    `<script src="${base}/widget.js"></script>`,
    `<script>`,
    `  window.AgentFlowhub.init({`,
    `    token: '${seguro}',`,
    `    host:  '${base}',`,
    `  });`,
    `</script>`,
  ].join('\n');
}
