/**
 * GET /api/share/[shareId]/manifest — manifest PWA de UN share.
 *
 * El manifest global (`/manifest.json`) tiene scope "/" y start_url "/", así
 * que instalar desde una página de share dejaba un icono que abría la landing
 * en vez del agente. Este devuelve uno acotado al share: cada agente
 * compartido entra como app independiente.
 *
 * Solo responde para shares instalables (duraderos, activos y vigentes). Para
 * el resto devuelve 404 a propósito: sin manifest, el navegador no ofrece
 * instalar, que es justo lo que queremos con un acceso que caduca en 8 h.
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { WidgetShare, Widget } from '@/lib/db/models';
import { esInstalable, nombreCortoApp } from '@/lib/share-durability';

type Ctx = { params: Promise<{ shareId: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { shareId } = await params;

  await connectDB();

  const share = await WidgetShare.findOne({ shareId })
    .select({ widgetId: 1, label: 1, active: 1, permanent: 1, expiresAt: 1 })
    .lean() as {
      widgetId: string; label?: string; active?: boolean;
      permanent?: boolean; expiresAt?: Date;
    } | null;

  if (!share || !esInstalable(share)) {
    return NextResponse.json({ error: 'No instalable.' }, { status: 404 });
  }

  const widget = await Widget.findById(share.widgetId).select({ name: 1 }).lean() as { name?: string } | null;
  const nombre = (share.label || widget?.name || 'Agente').trim();
  const base = `/share/${encodeURIComponent(shareId)}`;

  const manifest = {
    // `id` fija la identidad de la app: sin esto, dos agentes del mismo
    // dominio pueden pisarse al instalarse.
    id: base,
    name: `${nombre} — BotIvA`,
    short_name: nombreCortoApp(nombre),
    description: `Agente ${nombre}, disponible como app.`,
    // Arranca en la pantalla de contraseña; el scope encierra la app en este
    // share, así que un enlace fuera abre el navegador y no la ventana de app.
    start_url: base,
    scope: base,
    display: 'standalone',
    display_override: ['standalone'],
    orientation: 'any',
    lang: 'es',
    background_color: '#0d1b2a',
    theme_color: '#0d1b2a',
    icons: [
      { src: '/assets/marketing/botiva-logo-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/assets/marketing/botiva-logo.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };

  return NextResponse.json(manifest, {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      // Corto: si el dueño revoca el share, el manifest deja de servirse pronto.
      'Cache-Control': 'public, max-age=300',
    },
  });
}
