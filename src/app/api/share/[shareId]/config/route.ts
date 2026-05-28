/**
 * GET /api/share/[shareId]/config
 * Devuelve la configuración pública del widget para la página de chat compartido.
 * Requiere cookie share_session válida.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyShareSessionToken } from '@/lib/auth';
import { connectDB } from '@/lib/db/connection';
import { WidgetShare, Widget } from '@/lib/db/models';

type Ctx = { params: Promise<{ shareId: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const { shareId } = await params;

  const sessionToken = req.cookies.get('share_session')?.value;
  const verified     = sessionToken ? verifyShareSessionToken(sessionToken) : null;
  if (!verified || verified !== shareId) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  await connectDB();

  const share = await WidgetShare.findOne({ shareId, active: true })
    .select({ widgetId: 1, label: 1 })
    .lean() as { widgetId: string; label: string } | null;

  if (!share) return NextResponse.json({ error: 'Share no encontrado.' }, { status: 404 });

  const widget = await Widget.findById(share.widgetId)
    .select({ agentId: 1, name: 1, title: 1, subtitle: 1, avatar: 1, color: 1, welcome: 1, active: 1, afhubToken: 1 })
    .lean() as {
      agentId?: string; name?: string; title?: string; subtitle?: string;
      avatar?: string; color?: string; welcome?: string; active?: boolean; afhubToken?: string;
    } | null;

  if (!widget || widget.active === false) {
    return NextResponse.json({ error: 'Widget no disponible.' }, { status: 404 });
  }

  return NextResponse.json({
    widgetId:   share.widgetId,
    agentId:    widget.agentId ?? '',
    afhubToken: widget.afhubToken ?? '',
    name:       widget.name ?? share.label ?? 'Agente',
    title:      widget.title ?? widget.name ?? 'Agente',
    subtitle:   widget.subtitle ?? '',
    avatar:     widget.avatar ?? '',
    color:      widget.color ?? '#6366f1',
    welcome:    widget.welcome ?? '',
  });
}
