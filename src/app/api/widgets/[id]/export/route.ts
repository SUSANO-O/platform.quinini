/**
 * GET /api/widgets/[id]/export
 *
 * ?format=json  — Transcripción completa de conversaciones (mensajes reales)
 * ?format=csv   — Resumen de uso mensual (comportamiento anterior)
 * ?months=N     — Últimos N meses (máx 12, default 3) — afecta ambos formatos
 * ?sessions=N   — Últimas N sesiones para formato json (máx 500, default 200)
 *
 * Solo el dueño del widget puede descargar.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { connectDB } from '@/lib/db/connection';
import { Widget, RequestLog } from '@/lib/db/models';
import { exportWidgetConversations } from '@/lib/widget-conversation-export';

function auth(req: NextRequest) {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

function escapeCsv(val: unknown): string {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function generatePastMonths(count: number): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = auth(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const { id } = await params;
  const url = new URL(req.url);
  const format = url.searchParams.get('format') || 'json';
  const months = Math.min(12, Math.max(1, Number(url.searchParams.get('months') || '3')));
  const maxSessions = Math.min(500, Math.max(1, Number(url.searchParams.get('sessions') || '200')));

  await connectDB();

  const widget = await Widget.findOne({ _id: id, userId })
    .select({ name: 1, agentId: 1, createdAt: 1 })
    .lean() as { name?: string; agentId?: string; createdAt?: Date } | null;

  if (!widget) return NextResponse.json({ error: 'Widget no encontrado.' }, { status: 404 });

  // ── CSV: resumen mensual ──────────────────────────────────────────────────
  if (format === 'csv') {
    const monthKeys = generatePastMonths(months);
    const logs = await RequestLog.find({ widgetId: id, month: { $in: monthKeys } })
      .select({ month: 1, count: 1 }).sort({ month: -1 }).lean() as { month: string; count?: number }[];
    const byMonth = new Map<string, number>(logs.map(l => [l.month, l.count ?? 0]));
    const rows = [['Mes', 'Conversaciones', 'Widget', 'Agente ID'].join(',')];
    for (const month of monthKeys) {
      rows.push([escapeCsv(month), escapeCsv(byMonth.get(month) ?? 0), escapeCsv(widget.name || id), escapeCsv(widget.agentId || '')].join(','));
    }
    const total = [...byMonth.values()].reduce((s, v) => s + v, 0);
    rows.push(['', '', '', ''].join(','));
    rows.push([escapeCsv('TOTAL'), escapeCsv(total), '', ''].join(','));
    const csv = rows.join('\n');
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="widget-${id}-uso-${monthKeys[0]}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  // ── JSON: transcripción completa ──────────────────────────────────────────
  const conv = await exportWidgetConversations(id, {
    widgetName: widget.name || '',
    agentId: widget.agentId || '',
    months,
    maxSessions,
  });

  const payload = {
    exportVersion: 2,
    exportedAt: new Date().toISOString(),
    widget: {
      id,
      name: conv.widgetName,
      agentId: conv.agentId,
      createdAt: widget.createdAt,
    },
    periodMonths: conv.periodMonths,
    totalSessions: conv.totalSessions,
    sessions: conv.sessions,
  };

  const filename = `widget-${id}-conversaciones-${new Date().toISOString().slice(0, 10)}.json`;
  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
