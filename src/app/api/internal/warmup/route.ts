/**
 * GET /api/internal/warmup — calienta los backends de generación para evitar el
 * cold start del PRIMER mensaje de WhatsApp/widget.
 *
 * Hace ping a los endpoints de salud de AIBackHub (`/health`) y AgentFlowhub
 * (`/api/health`), que son los servicios que el webhook de WhatsApp usa para
 * generar la respuesta del agente. Se invoca por cron de Vercel cada 3 horas.
 *
 * Protegido con CRON_SECRET (igual que las demás rutas internas). Vercel Cron
 * envía automáticamente `Authorization: Bearer <CRON_SECRET>` cuando la env var
 * está configurada.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAibackhubBaseUrl, getAgentflowhubBaseUrl } from '@/lib/aibackhub-sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function getSecret(req: NextRequest): string | null {
  return (
    req.headers.get('x-cron-secret')?.trim() ||
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ||
    null
  );
}

async function ping(name: string, url: string): Promise<{ target: string; url: string; ok: boolean; status?: number; ms: number; error?: string }> {
  const start = Date.now();
  try {
    const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(20_000), cache: 'no-store' });
    return { target: name, url, ok: res.ok, status: res.status, ms: Date.now() - start };
  } catch (e) {
    return { target: name, url, ok: false, ms: Date.now() - start, error: e instanceof Error ? e.message : 'error' };
  }
}

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) return NextResponse.json({ error: 'CRON_SECRET no configurado.' }, { status: 503 });

  const got = getSecret(req);
  if (!got || got !== expected) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  const aibackhubBase = getAibackhubBaseUrl().replace(/\/$/, '');
  const hubBase = getAgentflowhubBaseUrl().replace(/\/$/, '');

  const targets: { name: string; url: string }[] = [];
  if (/^https?:\/\//.test(aibackhubBase)) targets.push({ name: 'aibackhub', url: `${aibackhubBase}/health` });
  if (/^https?:\/\//.test(hubBase)) targets.push({ name: 'agentflowhub', url: `${hubBase}/api/health` });

  const results = await Promise.all(targets.map((t) => ping(t.name, t.url)));

  const allOk = results.every((r) => r.ok);
  console.log('[warmup] backends', JSON.stringify(results));

  return NextResponse.json({ ok: allOk, warmedAt: new Date().toISOString(), results }, { status: allOk ? 200 : 207 });
}
