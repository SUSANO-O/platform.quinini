import { NextRequest, NextResponse } from 'next/server';
import { getGatewayBaseUrl } from '@/lib/gateway-url';
import { getCorsHeaders, handlePreflight } from '@/lib/cors';

function describeErr(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const bits = [err.message];
  const c = err.cause;
  if (c instanceof Error) bits.push(c.message);
  else if (c && typeof c === 'object' && 'code' in c) bits.push(`code=${String((c as { code?: string }).code)}`);
  return bits.join(' — ');
}

/**
 * Fire-and-forget: increment request counter for the widget identified by
 * the Bearer token in the Authorization header.
 */
async function trackRequest(token: string | null) {
  if (!token) return;
  try {
    const { connectDB } = await import('@/lib/db/connection');
    const { Widget, RequestLog } = await import('@/lib/db/models');
    await connectDB();
    const widget = await Widget.findOne({ afhubToken: token }, { _id: 1, userId: 1 }).lean() as { _id: { toString(): string }; userId: string } | null;
    if (!widget) return;
    const month = new Date().toISOString().slice(0, 7); // "YYYY-MM"
    await RequestLog.updateOne(
      { userId: widget.userId, widgetId: widget._id.toString(), month },
      { $inc: { count: 1 } },
      { upsert: true },
    );
  } catch {
    // Non-critical — never fail the proxy request
  }
}

/**
 * Proxy to the API Gateway — used in development to avoid CORS.
 * In production, the landing app calls the gateway directly.
 */
async function proxy(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }): Promise<NextResponse> {
  // Handle CORS preflight
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  const { path } = await params;
  const base = getGatewayBaseUrl();
  const target = `${base}/api/gateway/${path.join('/')}`;
  const url = new URL(target);

  // Forward query params
  req.nextUrl.searchParams.forEach((v, k) => url.searchParams.set(k, v));

  const headers: Record<string, string> = {};
  let widgetToken: string | null = null;

  req.headers.forEach((v, k) => {
    if (!['host', 'connection', 'content-length'].includes(k.toLowerCase())) {
      headers[k] = v;
    }
    if (k.toLowerCase() === 'authorization') {
      const match = v.match(/^Bearer\s+(wt_.+)$/i);
      if (match) widgetToken = match[1];
    }
  });

  // Also check query param fallback
  if (!widgetToken) {
    const qt = req.nextUrl.searchParams.get('wt') ?? req.nextUrl.searchParams.get('widget_token');
    if (qt?.startsWith('wt_')) widgetToken = qt;
  }

  const init: RequestInit = {
    method: req.method,
    headers,
  };

  if (!['GET', 'HEAD'].includes(req.method)) {
    init.body = await req.text();
  }

  try {
    const res = await fetch(url.toString(), init);
    const data = await res.text();

    const responseHeaders = new Headers();
    res.headers.forEach((v, k) => {
      if (!['content-encoding', 'transfer-encoding', 'connection'].includes(k.toLowerCase())) {
        responseHeaders.set(k, v);
      }
    });

    // Track successful requests (non-blocking)
    if (res.ok && widgetToken) {
      trackRequest(widgetToken).catch(() => {});
    }

    const corsHeaders = getCorsHeaders(req);
    Object.entries(corsHeaders).forEach(([k, v]) => responseHeaders.set(k, v));

    return new NextResponse(data, {
      status: res.status,
      headers: responseHeaders,
    });
  } catch (err: unknown) {
    const configured = process.env.GATEWAY_URL || 'http://127.0.0.1:3100';
    return NextResponse.json(
      {
        error: 'Gateway unreachable',
        details: describeErr(err),
        hint:
          'Arranca agent-flow-gateway en el mismo puerto que GATEWAY_URL (por defecto: cd agent-flow-gateway && npm run dev → 3100). Ajusta GATEWAY_URL en .env.local si usas otro puerto.',
        gatewayConfigured: configured,
        gatewayResolved: getGatewayBaseUrl(),
      },
      { status: 502 },
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const DELETE = proxy;
export const PATCH = proxy;
export const OPTIONS = proxy;
