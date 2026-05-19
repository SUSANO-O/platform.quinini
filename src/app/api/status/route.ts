/**
 * GET /api/status
 * Público — no requiere autenticación. Cache desactivado.
 */

import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { getAibackhubBaseUrl, getAgentflowhubBaseUrl } from '@/lib/aibackhub-sync';
import { redis } from '@/lib/redis';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type ServiceStatus = 'operational' | 'degraded' | 'down';

export interface ServiceCheck {
  name: string;
  status: ServiceStatus;
  latencyMs: number | null;
  message?: string;
}

async function checkHttp(name: string, url: string, timeoutMs = 5000): Promise<ServiceCheck> {
  if (!url) return { name, status: 'degraded', latencyMs: null };
  const start = Date.now();
  try {
    const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' });
    const latencyMs = Date.now() - start;
    if (res.ok) return { name, status: 'operational', latencyMs };
    return { name, status: res.status >= 500 ? 'down' : 'degraded', latencyMs };
  } catch {
    return { name, status: 'down', latencyMs: null };
  }
}

async function checkBaseDatos(): Promise<ServiceCheck> {
  const start = Date.now();
  try {
    const mongoose = await connectDB();
    const ready = mongoose.connection.readyState === 1;
    const latencyMs = Date.now() - start;
    return { name: 'Base de datos', status: ready ? 'operational' : 'degraded', latencyMs };
  } catch {
    return { name: 'Base de datos', status: 'down', latencyMs: null };
  }
}

async function checkCache(): Promise<ServiceCheck> {
  const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL ?? process.env.REDIS_URL;
  if (!REDIS_URL) return { name: 'Caché', status: 'degraded', latencyMs: null, message: 'No configurado' };
  const start = Date.now();
  try {
    await redis.set('__status_ping', '1', { ex: 10 });
    const val = await redis.get('__status_ping');
    const latencyMs = Date.now() - start;
    return { name: 'Caché', status: val === '1' ? 'operational' : 'degraded', latencyMs };
  } catch {
    return { name: 'Caché', status: 'down', latencyMs: null };
  }
}

async function checkCoordenacion(): Promise<ServiceCheck> {
  const explicit = (process.env.AGENTFLOWHUB_URL ?? '').trim();
  // Si no hay URL explícita configurada, el servicio es co-ubicado — no monitoreamos externamente.
  if (!explicit) return { name: 'Coordinación', status: 'operational', latencyMs: null };
  const base = getAgentflowhubBaseUrl();
  const check = await checkHttp('Coordinación', `${base}/api/health`, 4000);
  // Conexión rechazada (proceso no disponible en este entorno) = degraded, no down.
  if (check.status === 'down') return { ...check, status: 'degraded' };
  return check;
}

export async function GET() {
  const aiBase = getAibackhubBaseUrl();

  const [dbCheck, procesamiento, coordinacion, cacheCheck] = await Promise.all([
    checkBaseDatos(),
    checkHttp('Procesamiento', aiBase ? `${aiBase}/health` : '', 5000),
    checkCoordenacion(),
    checkCache(),
  ]);

  const plataforma: ServiceCheck = { name: 'Plataforma', status: 'operational', latencyMs: 0 };

  const services: ServiceCheck[] = [plataforma, dbCheck, procesamiento, coordinacion, cacheCheck];

  const allOk   = services.every((s) => s.status === 'operational');
  const anyDown = services.some((s) => s.status === 'down');
  const overall: ServiceStatus = allOk ? 'operational' : anyDown ? 'down' : 'degraded';

  return NextResponse.json(
    { status: overall, timestamp: new Date().toISOString(), services },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}
