/**
 * GET /api/status — estado de salud de todos los servicios del ecosistema.
 * Usado por la página pública /status para mostrar uptime y latencia.
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { getAgentflowhubBaseUrl, getAibackhubBaseUrl } from '@/lib/aibackhub-sync';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type ServiceStatus = 'operational' | 'degraded' | 'down';

interface ServiceCheck {
  name: string;
  status: ServiceStatus;
  latencyMs: number | null;
  message?: string;
}

async function checkUrl(name: string, url: string, timeoutMs = 5000): Promise<ServiceCheck> {
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
    });
    const latencyMs = Date.now() - start;
    if (res.ok) return { name, status: 'operational', latencyMs };
    return { name, status: 'degraded', latencyMs, message: `HTTP ${res.status}` };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : 'connection failed';
    return { name, status: 'down', latencyMs: latencyMs > timeoutMs ? null : latencyMs, message: msg };
  }
}

async function checkMongo(): Promise<ServiceCheck> {
  const start = Date.now();
  try {
    await connectDB();
    return { name: 'Database (MongoDB)', status: 'operational', latencyMs: Date.now() - start };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'connection failed';
    return { name: 'Database (MongoDB)', status: 'down', latencyMs: null, message: msg };
  }
}

export async function GET(_req: NextRequest) {
  const hubBase = getAgentflowhubBaseUrl();
  const aiBase = getAibackhubBaseUrl();

  const [mongoCheck, hubCheck, aiCheck] = await Promise.all([
    checkMongo(),
    checkUrl('AgentFlowhub (Hub)', `${hubBase}/api/health`.replace(/\/+/, '/').replace('://', '://'), 5000),
    checkUrl('AIBackHub (AI Engine)', `${aiBase}/api/health`.replace(/\/+/, '/').replace('://', '://'), 5000),
  ]);

  // Landing itself
  const landingCheck: ServiceCheck = { name: 'Landing (this service)', status: 'operational', latencyMs: 0 };

  const services = [landingCheck, mongoCheck, hubCheck, aiCheck];
  const allOk = services.every(s => s.status === 'operational');
  const anyDown = services.some(s => s.status === 'down');
  const overall: ServiceStatus = allOk ? 'operational' : anyDown ? 'down' : 'degraded';

  return NextResponse.json(
    {
      status: overall,
      timestamp: new Date().toISOString(),
      services,
    },
    {
      status: 200,
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    },
  );
}
