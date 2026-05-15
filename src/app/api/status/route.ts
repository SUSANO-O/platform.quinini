/**
 * GET /api/status
 *
 * Verifica la salud de todos los servicios del ecosistema.
 * Público — no requiere autenticación. Cache desactivado.
 */

import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { getAgentflowhubBaseUrl, getAibackhubBaseUrl } from '@/lib/aibackhub-sync';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type ServiceStatus = 'operational' | 'degraded' | 'down';

export interface ServiceCheck {
  name: string;
  status: ServiceStatus;
  latencyMs: number | null;
  message?: string;
}

function classifyError(err: unknown, elapsed: number, timeoutMs: number): { message: string; timedOut: boolean } {
  const msg = err instanceof Error ? err.message : String(err);
  const timedOut = elapsed >= timeoutMs - 100 || msg.includes('TimeoutError') || msg.includes('AbortError');
  if (timedOut) return { message: 'timeout', timedOut: true };
  if (msg.includes('ECONNREFUSED')) return { message: 'connection refused', timedOut: false };
  if (msg.includes('ENOTFOUND')) return { message: 'DNS not found', timedOut: false };
  if (msg.includes('ECONNRESET')) return { message: 'connection reset', timedOut: false };
  return { message: 'unreachable', timedOut: false };
}

async function checkHttp(name: string, url: string, timeoutMs = 5000): Promise<ServiceCheck> {
  if (!url) {
    return { name, status: 'down', latencyMs: null, message: 'URL not configured' };
  }
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
    });
    const latencyMs = Date.now() - start;
    if (res.ok) return { name, status: 'operational', latencyMs };
    const status = res.status >= 500 ? 'down' : 'degraded';
    return { name, status, latencyMs, message: `HTTP ${res.status}` };
  } catch (err) {
    const elapsed = Date.now() - start;
    const { message } = classifyError(err, elapsed, timeoutMs);
    return { name, status: 'down', latencyMs: null, message };
  }
}

async function checkMongo(): Promise<ServiceCheck> {
  const start = Date.now();
  try {
    const mongoose = await connectDB();
    // isConnected es suficiente — evita el overhead de admin().ping()
    const ready = mongoose.connection.readyState === 1;
    const latencyMs = Date.now() - start;
    if (ready) return { name: 'Base de datos (MongoDB)', status: 'operational', latencyMs };
    return { name: 'Base de datos (MongoDB)', status: 'degraded', latencyMs, message: 'connecting' };
  } catch (err) {
    const msg = err instanceof Error ? err.message.slice(0, 80) : 'connection failed';
    return { name: 'Base de datos (MongoDB)', status: 'down', latencyMs: null, message: msg };
  }
}

export async function GET() {
  const hubBase  = getAgentflowhubBaseUrl();
  const aiBase   = getAibackhubBaseUrl();

  const [mongoCheck, hubCheck, aiCheck] = await Promise.all([
    checkMongo(),
    checkHttp('AgentFlowhub (Hub)',     hubBase ? `${hubBase}/api/health` : '', 5000),
    checkHttp('AIBackHub (AI Engine)', aiBase  ? `${aiBase}/health`      : '', 5000),
  ]);

  // Landing itself is always operational if we're executing
  const selfCheck: ServiceCheck = {
    name: 'Landing (plataforma)',
    status: 'operational',
    latencyMs: 0,
  };

  const services: ServiceCheck[] = [selfCheck, mongoCheck, hubCheck, aiCheck];

  const allOk   = services.every((s) => s.status === 'operational');
  const anyDown = services.some((s) => s.status === 'down');
  const overall: ServiceStatus = allOk ? 'operational' : anyDown ? 'down' : 'degraded';

  return NextResponse.json(
    { status: overall, timestamp: new Date().toISOString(), services },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}
