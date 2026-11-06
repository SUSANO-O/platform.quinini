/**
 * Reenvía al widget los tokens en vivo de la inferencia directa (mismo contrato SSE que el MCP
 * directo: `token` / `token_reset`) y marca `infer_direct_first_token` en la traza de latencia.
 */
export function createInferTokenRelay(
  enqueue: (data: Record<string, unknown>) => void,
  trace: { mark(phase: string): void },
) {
  let liveChars = 0;
  let firstMarked = false;
  return {
    onToken(delta: string): void {
      if (!delta) return;
      if (!firstMarked) {
        firstMarked = true;
        trace.mark('infer_direct_first_token');
      }
      liveChars += delta.length;
      enqueue({ type: 'token', text: delta });
    },
    onTokenReset(): void {
      if (liveChars === 0) return;
      liveChars = 0;
      enqueue({ type: 'token_reset' });
    },
    /** La inferencia no dio respuesta: borrar el texto provisional antes del respaldo. */
    clear(): void {
      if (liveChars === 0) return;
      liveChars = 0;
      enqueue({ type: 'token_reset' });
    },
    /** Hay texto en pantalla: no repetirlo con la escritura simulada. */
    streamed(): boolean {
      return liveChars > 0;
    },
  };
}
