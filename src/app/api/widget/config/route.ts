/**
 * GET /api/widget/config?token=wt_...
 *
 * Returns the public, non-sensitive configuration for a widget identified by
 * its afhubToken. Called by widget.js at init time so that visual config
 * (color, title, avatar, etc.) is always served from the DB — clients only
 * need to embed the token, not a hardcoded config snapshot.
 *
 * No user auth required: the wt_* token is the public identity of the widget.
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { Widget } from '@/lib/db/models';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token || !token.startsWith('wt_')) {
    return NextResponse.json({ error: 'Token inválido.' }, { status: 400 });
  }

  await connectDB();

  const widget = await Widget.findOne({ afhubToken: token })
    .select('agentId color title subtitle welcome fabHint avatar position theme borderRadius autoOpen humanSupportPhone')
    .lean() as Record<string, unknown> | null;

  if (!widget) {
    return NextResponse.json({ error: 'Widget no encontrado.' }, { status: 404 });
  }

  return NextResponse.json(
    {
      agentId:           widget.agentId,
      color:             widget.color,
      title:             widget.title,
      subtitle:          widget.subtitle,
      welcome:           widget.welcome,
      fabHint:           widget.fabHint,
      avatar:            widget.avatar,
      position:          widget.position,
      theme:             widget.theme,
      borderRadius:      widget.borderRadius,
      autoOpen:          widget.autoOpen,
      humanSupportPhone: widget.humanSupportPhone,
    },
    {
      headers: {
        // Allow short CDN/browser caching; changes in the panel propagate within 30 s
        'Cache-Control': 'public, max-age=30, stale-while-revalidate=60',
      },
    },
  );
}
