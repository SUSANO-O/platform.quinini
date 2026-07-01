'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { AiLoadingScreen } from '@/components/ui/ai-loading-screen';
import { FlowEditor } from '@/components/flow-editor/flow-editor';
import type { FlowDocument } from '@/lib/flow-editor/types';

export default function FlowEditorPage() {
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : '';
  const [flow, setFlow] = useState<FlowDocument | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/flows/${id}`, { credentials: 'include' });
        const data = await res.json() as { flow?: FlowDocument; error?: string };
        if (!res.ok || !data.flow) {
          throw new Error(data.error || 'Flujo no encontrado');
        }
        if (!cancelled) setFlow(data.flow);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Error al cargar');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center">
        <div>
          <p className="text-lg font-semibold m-0">{error}</p>
          <a href={`/dashboard/flows/${id}`} className="text-sm mt-3 inline-block text-[var(--brand-primary)]">
            ← Volver al flujo
          </a>
        </div>
      </div>
    );
  }

  if (!flow) return <AiLoadingScreen />;

  return <FlowEditor initialFlow={flow} />;
}
