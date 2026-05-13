import { MongoClient } from 'mongodb';
import { Client } from 'pg';

const CONNECT_MS = 10_000;

export type DataSourcePingResult =
  | { ok: true; detail: string }
  | { ok: false; error: string };

export async function testMongodbConnectionString(uri: string): Promise<DataSourcePingResult> {
  const trimmed = uri.trim();
  if (!trimmed.startsWith('mongodb://') && !trimmed.startsWith('mongodb+srv://')) {
    return { ok: false, error: 'La URI debe comenzar con mongodb:// o mongodb+srv://' };
  }
  let client: MongoClient | undefined;
  try {
    client = new MongoClient(trimmed, {
      serverSelectionTimeoutMS: CONNECT_MS,
      connectTimeoutMS: CONNECT_MS,
      appName: 'agent-flow-landing-mcp-test',
    });
    await client.connect();
    const admin = client.db().admin();
    const ping = await admin.ping();
    if (!ping?.ok) {
      return { ok: false, error: 'Ping administrativo no devolvió ok.' };
    }
    let extra = '';
    try {
      const names = await client.db().admin().listDatabases();
      const n = Array.isArray(names?.databases) ? names.databases.length : 0;
      extra = ` (${n} bases listables).`;
    } catch {
      extra = ' (ping OK; listDatabases no permitido para este usuario).';
    }
    return { ok: true, detail: `Conexión MongoDB OK${extra}` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg.slice(0, 500) };
  } finally {
    try {
      await client?.close();
    } catch {
      /* ignore */
    }
  }
}

export async function testPostgresConnectionString(uri: string): Promise<DataSourcePingResult> {
  const trimmed = uri.trim();
  if (!trimmed.startsWith('postgres://') && !trimmed.startsWith('postgresql://')) {
    return { ok: false, error: 'La URI debe comenzar con postgres:// o postgresql://' };
  }
  const client = new Client({
    connectionString: trimmed,
    connectionTimeoutMillis: CONNECT_MS,
    application_name: 'agent-flow-landing-mcp-test',
  });
  try {
    await client.connect();
    const r = await client.query<{ ok: number }>('SELECT 1::int AS ok');
    const ok = r.rows?.[0]?.ok === 1;
    if (!ok) {
      return { ok: false, error: 'SELECT 1 no devolvió el resultado esperado.' };
    }
    return { ok: true, detail: 'Conexión OK (SELECT 1).' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg.slice(0, 500) };
  } finally {
    try {
      await client.end();
    } catch {
      /* ignore */
    }
  }
}
