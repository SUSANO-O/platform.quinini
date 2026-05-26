/**
 * GET /api/widget/config?token=wt_...
 *
 * Returns the public, non-sensitive configuration for a widget identified by
 * its afhubToken. Called by widget.js at init time so that visual config
 * (color, title, avatar, etc.) is always served from the DB — clients only
 * need to embed the token, not a hardcoded config snapshot.
 *
 * No user auth required: the wt_* token is the public identity of the widget.
 * CORS enabled for cross-origin embed (localhost PHP, sitios de clientes, etc.).
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { Widget, ClientAgent } from '@/lib/db/models';
import { validateMultiAgentMode } from '@/lib/widget-multi-agent';
import { normalizeHandoffNotifyMode } from '@/lib/handoff-notify';
import { getCorsHeaders, handlePreflight, withCors } from '@/lib/cors';

export async function OPTIONS(req: NextRequest) {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(req) });
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token || !token.startsWith('wt_')) {
    return withCors(
      req,
      NextResponse.json({ error: 'Token inválido.' }, { status: 400 }),
    );
  }

  await connectDB();

  const widget = await Widget.findOne({ afhubToken: token })
    .select('_id agentId color title subtitle welcome fabHint avatar position theme borderRadius autoOpen fabDismissible voiceEnabled humanSupportPhone humanSupportEnabled handoffEnabled handoffNotifyMode shortcuts multiAgentEnabled multiAgentMode active')
    .lean() as Record<string, unknown> | null;

  if (!widget) {
    return withCors(
      req,
      NextResponse.json({ error: 'Widget no encontrado.' }, { status: 404 }),
    );
  }

  // Fetch voice name from the linked agent (stored there, not on Widget)
  let voiceName = '';
  if (widget.agentId) {
    try {
      const agent = await ClientAgent.findById(widget.agentId as string)
        .select('widgetVoiceName')
        .lean() as { widgetVoiceName?: string | null } | null;
      voiceName = typeof agent?.widgetVoiceName === 'string' ? agent.widgetVoiceName : '';
    } catch { /* non-critical — fallback to auto voice */ }
  }

  return withCors(
    req,
    NextResponse.json(
      {
        widgetId:          widget._id != null ? String(widget._id) : '',
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
        fabDismissible:    widget.fabDismissible !== false,
        voiceEnabled:      widget.voiceEnabled !== false,
        humanSupportPhone: widget.humanSupportPhone,
        humanSupportEnabled: widget.humanSupportEnabled !== false,
        handoffEnabled:    widget.handoffEnabled !== false,
        handoffNotifyMode: normalizeHandoffNotifyMode(widget.handoffNotifyMode),
        voiceName,
        shortcuts:         Array.isArray(widget.shortcuts)
          ? (widget.shortcuts as Array<{ id: string; label: string; message: string; emoji?: string; enabled: boolean }>)
              .filter((s) => s.enabled !== false)
          : [],
        multiAgentEnabled: widget.multiAgentEnabled === true,
        multiAgentMode: validateMultiAgentMode(widget.multiAgentMode),
        active: widget.active !== false,
      },
      {
        headers: {
          // Allow short CDN/browser caching; changes in the panel propagate within 30 s
          'Cache-Control': 'public, max-age=30, stale-while-revalidate=60',
        },
      },
    ),
  );
}
