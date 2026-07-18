/**
 * Verifica que SECRET_ENCRYPTION_KEY (o JWT fallback) descifre tokens WhatsApp en Mongo.
 * No imprime secretos ni colas de tokens — solo OK/FAIL por agente.
 *
 * Uso: npx tsx --env-file=.env scripts/probe-whatsapp-decrypt.mts
 */
import crypto from 'crypto';
import { createConnection } from 'mongoose';

function getKeyInfo(): { buf: Buffer | null; source: string } {
  const raw = process.env.SECRET_ENCRYPTION_KEY?.trim();
  if (raw) {
    try {
      const asHex = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : null;
      const buf = asHex || Buffer.from(raw, 'base64');
      if (buf.length === 32) return { buf, source: 'SECRET_ENCRYPTION_KEY' };
    } catch {
      /* fallthrough */
    }
  }
  const jwt = process.env.JWT_SECRET?.trim();
  if (jwt) {
    return {
      buf: crypto.createHash('sha256').update('whatsapp-secret-v1:' + jwt).digest(),
      source: 'JWT_SECRET-derived',
    };
  }
  return { buf: null, source: 'none' };
}

function decryptOk(payload: string | undefined, keyBuf: Buffer | null): boolean {
  if (!keyBuf || !payload) return false;
  const parts = String(payload).split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') return false;
  try {
    const iv = Buffer.from(parts[1], 'base64');
    const tag = Buffer.from(parts[2], 'base64');
    const enc = Buffer.from(parts[3], 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuf, iv);
    decipher.setAuthTag(tag);
    decipher.update(enc);
    decipher.final();
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    console.error('Falta MONGODB_URI');
    process.exit(1);
  }

  const { buf, source } = getKeyInfo();
  console.log('key_source:', source);

  const conn = await createConnection(uri).asPromise();
  const agents = await conn
    .collection('clientagents')
    .find(
      { 'whatsapp.accessTokenEnc': { $exists: true, $type: 'string', $ne: '' } },
      { projection: { name: 1, 'whatsapp.displayPhone': 1, 'whatsapp.accessTokenEnc': 1 } },
    )
    .toArray();

  if (!agents.length) {
    console.log('wa_agents_with_token: 0');
    await conn.close();
    process.exit(0);
  }

  let okCount = 0;
  for (const agent of agents) {
    const ok = decryptOk(agent.whatsapp?.accessTokenEnc, buf);
    if (ok) okCount += 1;
    console.log(
      `- ${agent.name || 'sin nombre'} | ${agent.whatsapp?.displayPhone || 'sin tel'} | decrypt_ok: ${ok}`,
    );
  }

  await conn.close();

  if (source === 'JWT_SECRET-derived' && okCount === 0) {
    console.log('\nHINT: copia SECRET_ENCRYPTION_KEY de Vercel a .env y reinicia el dev server.');
  }

  console.log(`\nSUMMARY: ${okCount}/${agents.length} tokens descifrables`);
  process.exit(okCount > 0 ? 0 : 2);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
