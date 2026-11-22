/**
 * URL de la UI de AgentFlowhub para enlaces del admin ("Granja en Hub ↗").
 * Devuelve null cuando no hay una URL utilizable: en producción, una dirección local apuntaría a la
 * máquina del visitante, así que el enlace se oculta en vez de mostrarse roto.
 */
const LOCAL_DEFAULT = 'http://127.0.0.1:9010';

function isLocal(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
  } catch {
    return true;
  }
}

export function getHubUiBase(
  raw: string | undefined = process.env.NEXT_PUBLIC_AGENTFLOWHUB_URL,
  production: boolean = process.env.NODE_ENV === 'production',
): string | null {
  const url = (raw?.trim() || (production ? '' : LOCAL_DEFAULT)).replace(/\/$/, '');
  if (!url) return null;
  if (production && isLocal(url)) return null;
  return url;
}
