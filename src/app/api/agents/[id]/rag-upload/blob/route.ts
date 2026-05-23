/**
 * POST /api/agents/[id]/rag-upload/blob
 * Genera token para subida directa a Vercel Blob (evita límite 4.5 MB del serverless).
 */

import { NextResponse } from 'next/server';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { connectDB } from '@/lib/db/connection';
import { ClientAgent } from '@/lib/db/models';
import { RAG_ALLOWED_MIMES } from '@/lib/rag-file-ingest';
import {
  getRagMaxFileSizeBytes,
  isRagBlobUploadEnabled,
} from '@/lib/rag-upload-limits';
import { ragUploadUserIdFromRequest } from '@/lib/rag-upload-server';

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  if (!isRagBlobUploadEnabled()) {
    return NextResponse.json({ error: 'Subida blob no configurada.' }, { status: 503 });
  }

  const { id: agentId } = await params;
  const userId = ragUploadUserIdFromRequest(request as import('next/server').NextRequest);
  if (!userId) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  }

  await connectDB();
  const agent = await ClientAgent.findOne({ _id: agentId, userId }).select({ isPlatform: 1 }).lean();
  if (!agent) return NextResponse.json({ error: 'Agente no encontrado.' }, { status: 404 });
  if (agent.isPlatform) {
    return NextResponse.json({ error: 'Agente de plataforma no editable.' }, { status: 403 });
  }

  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        let payloadAgentId = agentId;
        if (clientPayload) {
          try {
            const parsed = JSON.parse(clientPayload) as { agentId?: string };
            if (parsed.agentId) payloadAgentId = parsed.agentId;
          } catch {
            /* use route agentId */
          }
        }
        if (payloadAgentId !== agentId) {
          throw new Error('Agente no válido para esta subida.');
        }

        return {
          allowedContentTypes: [...RAG_ALLOWED_MIMES],
          maximumSizeInBytes: getRagMaxFileSizeBytes(),
          tokenPayload: JSON.stringify({ agentId, userId }),
        };
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al preparar la subida.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
