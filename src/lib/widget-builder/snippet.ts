import type { WidgetConfig } from './types';
import { WIDGET_SDK_VERSION } from '@/lib/internal-assist-config';

export function generateWidgetSnippet(_cfg: WidgetConfig, token: string = 'YOUR_TOKEN'): string {
  const host =
    typeof window !== 'undefined' ? window.location.origin : 'https://tudominio.com';
  return [
    `<script src="${host}/widget.js?v=${WIDGET_SDK_VERSION}"></script>`,
    `<script>`,
    `  window.AgentFlowhub.init({`,
    `    token: '${token}',`,
    `    host:  '${host}',`,
    `  });`,
    `</script>`,
  ].join('\n');
}
