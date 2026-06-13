import type { WidgetConfig } from './types';

export function generateWidgetSnippet(_cfg: WidgetConfig, token: string = 'YOUR_TOKEN'): string {
  const host =
    typeof window !== 'undefined' ? window.location.origin : 'https://tudominio.com';
  return [
    `<script src="${host}/widget.js"></script>`,
    `<script>`,
    `  window.AgentFlowhub.init({`,
    `    token: '${token}',`,
    `    host:  '${host}',`,
    `  });`,
    `</script>`,
  ].join('\n');
}
