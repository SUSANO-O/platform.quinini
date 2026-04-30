import fs from 'node:fs/promises';
import path from 'node:path';

/** Lambda, algunos runtimes Vercel/Netlify: solo es fiable escribir bajo `/tmp`. */
function useTmpForLocalFiles(): boolean {
  return Boolean(
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.AWS_EXECUTION_ENV ||
      process.env.VERCEL ||
      process.env.NETLIFY,
  );
}

/**
 * Directorio para logs/caché opcional en disco.
 * No usar `path.join(process.cwd(), 'data')` en serverless: suele resolverse a `/var/task/data` y falla.
 */
export function getWritableDataDir(): string {
  if (useTmpForLocalFiles()) {
    return path.join('/tmp', 'agent-flow-landing-data');
  }
  return path.join(process.cwd(), 'data');
}

export async function ensureWritableDataDir(): Promise<string> {
  const dir = getWritableDataDir();
  await fs.mkdir(dir, { recursive: true });
  return dir;
}
