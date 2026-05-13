/**
 * GET /api/widgets/[id]/export?format=csv&months=3
 *
 * Exporta el historial de uso/conversaciones de un widget en CSV.
 * Solo el dueño del widget puede descargarlo.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { connectDB } from '@/lib/db/connection';
import { Widget, RequestLog } from '@/lib/db/models';

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
  const months = Math.min(12, Math.max(1, Number(url.searchParams.get('months') || '3')));

  await connectDB();

  const widget = await Widget.findOne({ _id: id, userId })
    .select({ name: 1, agentId: 1, createdAt: 1 })
    .lean() as { name?: string; agentId?: string; createdAt?: Date } | null;

  if (!widget) return NextResponse.json({ error: 'Widget no encontrado.' }, { status: 404 });

  const monthKeys = generatePastMonths(months);
  const logs = await RequestLog.find({
    widgetId: id,
    month: { $in: monthKeys },
  })
    .select({ month: 1, count: 1 })
    .sort({ month: -1 })
    .lean() as { month: string; count?: number }[];

  // Build a month → count map
  const byMonth = new Map<string, number>(logs.map(l => [l.month, l.count ?? 0]));

  // CSV rows
  const rows: string[] = [
    ['Mes', 'Conversaciones', 'Widget', 'Agente ID'].join(','),
  ];

  for (const month of monthKeys) {
    rows.push([
      escapeCsv(month),
      escapeCsv(byMonth.get(month) ?? 0),
      escapeCsv(widget.name || id),
      escapeCsv(widget.agentId || ''),
    ].join(','));
  }

  // Summary row
  const total = [...byMonth.values()].reduce((s, v) => s + v, 0);
  rows.push(['', '', '', ''].join(','));
  rows.push([escapeCsv('TOTAL'), escapeCsv(total), '', ''].join(','));

  const csv = rows.join('\n');
  const filename = `widget-${id}-${monthKeys[0]}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
