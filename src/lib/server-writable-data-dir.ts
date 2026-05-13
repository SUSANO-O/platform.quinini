import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/**
 * Lambda, Vercel, Netlify, etc.: el árbol de despliegue (p. ej. `/var/task`) es de solo lectura;
 * solo es fiable escribir bajo el directorio temporal del runtime.
 *
 * No depender solo de `VERCEL=1`: en algunos bundles/runtimes puede no estar presente aunque
 * `cwd` sea `/var/task` (mismo patrón que AWS Lambda).
 */
function useTmpForLocalFiles(): boolean {
  if (
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.AWS_EXECUTION_ENV ||
    process.env.LAMBDA_TASK_ROOT ||
    process.env.VERCEL ||
    process.env.VERCEL_ENV ||
    process.env.NETLIFY
  ) {
    return true;
  }
  const cwd = process.cwd();
  if (cwd === '/var/task' || cwd.startsWith('/var/task/')) return true;
  return false;
}

/**
 * Directorio para logs/caché opcional en disco.
 * No usar `path.join(process.cwd(), 'data')` en serverless: suele resolverse a `/var/task/data` y falla.
 */
export function getWritableDataDir(): string {
  if (useTmpForLocalFiles()) {
    return path.join(os.tmpdir(), 'agent-flow-landing-data');
  }
  return path.join(process.cwd(), 'data');
}

export async function ensureWritableDataDir(): Promise<string> {
  const primary = getWritableDataDir();
  const fallback = path.join(os.tmpdir(), 'agent-flow-landing-data');
  try {
    await fs.mkdir(primary, { recursive: true });
    return primary;
  } catch (e) {
    if (path.resolve(primary) === path.resolve(fallback)) throw e;
    await fs.mkdir(fallback, { recursive: true });
    return fallback;
  }
}
