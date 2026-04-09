/**
 * URL base del agent-flow-gateway para el proxy del landing.
 * Debe coincidir con el puerto donde ejecutas `npm run dev` en agent-flow-gateway (por defecto 3100).
 */
export function getGatewayBaseUrl(): string {
  const raw = (process.env.GATEWAY_URL || 'http://127.0.0.1:3100').replace(/\/$/, '');
  try {
    const u = new URL(raw);
    if (u.hostname === 'localhost') {
      u.hostname = '127.0.0.1';
    }
    return u.origin;
  } catch {
    return raw;
  }
}
