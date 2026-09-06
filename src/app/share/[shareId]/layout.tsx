/**
 * Layout de las páginas de share.
 *
 * Existe solo para una cosa: sustituir el manifest global por el del share.
 * Sin esto, `<link rel="manifest" href="/manifest.json">` del layout raíz hace
 * que instalar desde aquí deje un icono que abre la landing, no el agente.
 *
 * Para un share que no es instalable el endpoint devuelve 404 y el navegador
 * simplemente no ofrece instalar — que es el comportamiento correcto.
 */

import type { Metadata } from 'next';

export async function generateMetadata(
  { params }: { params: Promise<{ shareId: string }> },
): Promise<Metadata> {
  const { shareId } = await params;
  return {
    manifest: `/api/share/${encodeURIComponent(shareId)}/manifest`,
    robots: { index: false, follow: false },
  };
}

export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return children;
}
