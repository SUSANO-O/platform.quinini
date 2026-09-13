import type { WidgetConfig } from './types';
import { WIDGET_SDK_VERSION } from '@/lib/internal-assist-config';

/**
 * El token viaja entre comillas simples dentro de un `<script>` que el cliente
 * pega en su propia web. Sin escapar, una comilla cierra la cadena y una
 * secuencia `</script>` cierra la etiqueta entera: en ambos casos el que se
 * queda con la página rota es el cliente.
 */
function escaparToken(token: string): string {
  return token
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    // El navegador corta el <script> ante cualquier "</script>", esté o no
    // dentro de una cadena; partir la barra lo evita sin cambiar el valor.
    .replace(/<\//g, '<\\/');
}

export function generateWidgetSnippet(_cfg: WidgetConfig, token: string = 'YOUR_TOKEN'): string {
  const host =
    typeof window !== 'undefined' ? window.location.origin : 'https://tudominio.com';
  const seguro = escaparToken(token || 'YOUR_TOKEN');

  return [
    `<script src="${host}/widget.js?v=${WIDGET_SDK_VERSION}"></script>`,
    `<script>`,
    `  window.AgentFlowhub.init({`,
    `    token: '${seguro}',`,
    `    host:  '${host}',`,
    `  });`,
    `</script>`,
  ].join('\n');
}
