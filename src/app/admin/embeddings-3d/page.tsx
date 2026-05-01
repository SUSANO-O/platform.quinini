'use client';

import dynamic from 'next/dynamic';
import { Box } from 'lucide-react';

const AdminEmbeddingViz3D = dynamic(
  () => import('@/components/admin/embedding-viz-3d'),
  {
    ssr: false,
    loading: () => (
      <div style={{ padding: '48px', textAlign: 'center', color: 'var(--muted-foreground)' }}>Cargando visor 3D…</div>
    ),
  },
);

export default function AdminEmbeddings3DPage() {
  return (
    <div style={{ padding: '24px', maxWidth: '1200px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
        <Box size={22} style={{ color: '#6366f1' }} />
        <h1 style={{ fontSize: '22px', fontWeight: 800, margin: 0 }}>Embeddings 3D</h1>
      </div>
      <p style={{ fontSize: '14px', color: 'var(--muted-foreground)', marginBottom: '20px', lineHeight: 1.55 }}>
        Vista de administración: nube de puntos en tres dimensiones tras PCA sobre los embeddings almacenados en
        AIBackHub. Arrastra para rotar y rueda del ratón para acercar o alejar.
      </p>
      <AdminEmbeddingViz3D />
    </div>
  );
}
