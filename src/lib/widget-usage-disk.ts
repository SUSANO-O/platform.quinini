import fs from 'node:fs/promises';
import path from 'node:path';
import { ensureWritableDataDir } from '@/lib/server-writable-data-dir';

/**
 * Opcional: una línea JSONL en `widget-usage.jsonl` para depuración local.
 * Requiere `WIDGET_USAGE_DISK_LOG=1`. En Vercel/Lambda el directorio es escribible vía `ensureWritableDataDir()`.
 */
export function scheduleWidgetUsageDiskLog(record: Record<string, unknown>): void {
  if (process.env.WIDGET_USAGE_DISK_LOG?.trim() !== '1') return;
  void (async () => {
    try {
      const dir = await ensureWritableDataDir();
      const file = path.join(dir, 'widget-usage.jsonl');
      await fs.appendFile(file, `${JSON.stringify({ t: new Date().toISOString(), ...record })}\n`, 'utf8');
    } catch (e) {
      console.error('[widget-usage]', e);
    }
  })();
}
