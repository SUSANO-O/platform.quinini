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
import { Widget, ClientAgent, User } from '@/lib/db/models';
import { validateMultiAgentMode } from '@/lib/widget-multi-agent';
import { normalizeHandoffNotifyMode, resolveWidgetHumanSupportPhone } from '@/lib/handoff-notify';
import { normalizeAiBeamFields } from '@/lib/widget-ai-beam';
import { normalizeScrollHaloFields } from '@/lib/widget-scroll-halo';
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
    .select('_id userId agentId color title subtitle welcome fabHint avatar fabAvatarSize position theme borderRadius autoOpen fabDismissible voiceEnabled imageUploadEnabled micEnabled aiBeamScope aiBeamPalette aiBeamColor aiBeamBlur aiBeamSpeed aiBeamIntensity scrollHaloEnabled scrollHaloColorMode scrollHaloColor scrollHaloHeight scrollHaloOpacity scrollHaloBlur scrollHaloTop scrollHaloBottom humanSupportPhone humanSupportEnabled handoffEnabled handoffNotifyMode handoffTimeout shortcuts multiAgentEnabled multiAgentMode active feedbackEnabled feedbackTitle feedbackThanks feedbackQuestions conversationIdleTimeout policyEnabled policyText policyLinkLabel policyUrl')
    .lean() as Record<string, unknown> | null;

  if (!widget) {
    return withCors(
      req,
      NextResponse.json({ error: 'Widget no encontrado.' }, { status: 404 }),
    );
  }

  let ownerUser: { escalationWhatsAppPhone?: string | null } | null = null;
  if (widget.userId) {
    try {
      ownerUser = await User.findById(widget.userId as string)
        .select('escalationWhatsAppPhone')
        .lean() as { escalationWhatsAppPhone?: string | null } | null;
    } catch { /* non-critical */ }
  }
  const effectiveHumanSupportPhone = resolveWidgetHumanSupportPhone(widget, ownerUser);

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

  const aiBeam = normalizeAiBeamFields(widget as Record<string, unknown>);
  const scrollHalo = normalizeScrollHaloFields(widget as Record<string, unknown>);

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
        fabAvatarSize:     typeof widget.fabAvatarSize === 'number'
          ? Math.min(120, Math.max(56, Math.round(widget.fabAvatarSize)))
          : 86,
        position:          widget.position,
        theme:             widget.theme,
        borderRadius:      widget.borderRadius,
        autoOpen:          widget.autoOpen,
        fabDismissible:    widget.fabDismissible !== false,
        voiceEnabled:      widget.voiceEnabled === true,
        imageUploadEnabled: (widget as { imageUploadEnabled?: boolean }).imageUploadEnabled !== false,
        micEnabled: typeof (widget as { micEnabled?: boolean }).micEnabled === 'boolean'
          ? (widget as { micEnabled?: boolean }).micEnabled === true
          : widget.voiceEnabled === true,
        humanSupportPhone: effectiveHumanSupportPhone,
        humanSupportEnabled: widget.humanSupportEnabled !== false,
        handoffEnabled:    widget.handoffEnabled !== false,
        handoffNotifyMode: normalizeHandoffNotifyMode(widget.handoffNotifyMode),
        handoffTimeout:    typeof widget.handoffTimeout === 'number' ? widget.handoffTimeout : 5,
        feedbackEnabled:   widget.feedbackEnabled === true,
        feedbackTitle:     typeof widget.feedbackTitle === 'string' ? widget.feedbackTitle : '¿Cómo fue tu experiencia?',
        feedbackThanks:    typeof widget.feedbackThanks === 'string' ? widget.feedbackThanks : '¡Gracias por tu feedback!',
        feedbackQuestions: Array.isArray(widget.feedbackQuestions)
          ? (widget.feedbackQuestions as Array<{ id: string; text: string; type: string; options?: string[]; required?: boolean; enabled?: boolean }>)
              .filter((q) => q.enabled !== false)
          : [],
        conversationIdleTimeout: typeof widget.conversationIdleTimeout === 'number' ? widget.conversationIdleTimeout : 15,
        voiceName,
        shortcuts:         Array.isArray(widget.shortcuts)
          ? (widget.shortcuts as Array<{ id: string; label: string; message: string; emoji?: string; enabled: boolean }>)
              .filter((s) => s.enabled !== false)
          : [],
        multiAgentEnabled: widget.multiAgentEnabled === true,
        multiAgentMode: validateMultiAgentMode(widget.multiAgentMode),
        active: widget.active !== false,
        policyEnabled:   widget.policyEnabled !== false,
        policyText:      typeof widget.policyText === 'string' ? widget.policyText : '',
        policyLinkLabel: typeof widget.policyLinkLabel === 'string' ? widget.policyLinkLabel : '',
        policyUrl:       typeof widget.policyUrl === 'string' ? widget.policyUrl : '',
        ...aiBeam,
        ...scrollHalo,
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
