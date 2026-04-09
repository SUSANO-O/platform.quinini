import { NextRequest, NextResponse } from 'next/server';
import { getGatewayBaseUrl } from '@/lib/gateway-url';

function describeErr(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const bits = [err.message];
  const c = err.cause;
  if (c instanceof Error) bits.push(c.message);
  else if (c && typeof c === 'object' && 'code' in c) bits.push(`code=${String((c as { code?: string }).code)}`);
  return bits.join(' — ');
}

async function proxy(req: NextRequest) {
  const url = new URL(`${getGatewayBaseUrl()}/api/keys`);
  req.nextUrl.searchParams.forEach((v, k) => url.searchParams.set(k, v));

  const init: RequestInit = {
    method: req.method,
    headers: { 'Content-Type': 'application/json' },
  };

  if (!['GET', 'HEAD'].includes(req.method)) {
    init.body = await req.text();
  }

  try {
    const res = await fetch(url.toString(), init);
    const data = await res.text();
    return new NextResponse(data, {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    const configured = process.env.GATEWAY_URL || 'http://127.0.0.1:3100';
    return NextResponse.json(
      {
        error: 'Gateway unreachable',
        details: describeErr(err),
        hint:
          'Arranca agent-flow-gateway (npm run dev en agent-flow-gateway, puerto 3100 por defecto) y alinea GATEWAY_URL en .env.local.',
        gatewayConfigured: configured,
        gatewayResolved: getGatewayBaseUrl(),
      },
      { status: 502 },
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const DELETE = proxy;
