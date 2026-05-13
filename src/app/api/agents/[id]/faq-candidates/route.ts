/**
 * FAQ Candidates API:
 *   POST /api/agents/[id]/faq-candidates  { action: 'promote', candidateId, question, answer }
 *   POST /api/agents/[id]/faq-candidates  { action: 'dismiss', candidateId }
 *   GET  /api/agents/[id]/faq-candidates  → lista candidates con conteo
 */

import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { verifySessionToken } from '@/lib/auth';
import { connectDB } from '@/lib/db/connection';
import { ClientAgent } from '@/lib/db/models';
import type { AgentFaqRow, FaqCandidateRow } from '@/lib/agent-faq-utils';
import { canAttemptHubSync, syncHubCatalogFromLandingAgentDoc } from '@/lib/aibackhub-sync';

function auth(req: NextRequest) {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = auth(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const { id } = await params;
  await connectDB();

  const agent = await ClientAgent.findOne({ _id: id, userId })
    .select({ faqCandidates: 1, agentFaqs: 1 })
    .lean() as { faqCandidates?: FaqCandidateRow[]; agentFaqs?: AgentFaqRow[] } | null;

  if (!agent) return NextResponse.json({ error: 'Agente no encontrado.' }, { status: 404 });

  const candidates = (agent.faqCandidates ?? [])
    .filter(c => !c.dismissed)
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0));

  return NextResponse.json({ candidates, total: candidates.length });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = auth(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const { id } = await params;
  const body = await req.json() as { action: string; candidateId?: string; question?: string; answer?: string };
  const { action, candidateId } = body;

  if (!action || !candidateId) {
    return NextResponse.json({ error: 'action y candidateId requeridos.' }, { status: 400 });
  }

  await connectDB();
  const agent = await ClientAgent.findOne({ _id: id, userId })
    .select({ faqCandidates: 1, agentFaqs: 1 })
    .lean() as { faqCandidates?: FaqCandidateRow[]; agentFaqs?: AgentFaqRow[] } | null;

  if (!agent) return NextResponse.json({ error: 'Agente no encontrado.' }, { status: 404 });

  const candidates = (agent.faqCandidates ?? []) as FaqCandidateRow[];
  const faqs = (agent.agentFaqs ?? []) as AgentFaqRow[];

  if (action === 'dismiss') {
    const updated = candidates.map(c =>
      c.id === candidateId ? { ...c, dismissed: true } : c,
    );
    await ClientAgent.updateOne({ _id: id, userId }, { $set: { faqCandidates: updated } });
    return NextResponse.json({ ok: true, action: 'dismissed' });
  }

  if (action === 'promote') {
    const { question, answer } = body;
    if (!question?.trim() || !answer?.trim()) {
      return NextResponse.json({ error: 'question y answer requeridos para promote.' }, { status: 400 });
    }

    // Mark candidate as dismissed (promoted)
    const updatedCandidates = candidates.map(c =>
      c.id === candidateId ? { ...c, dismissed: true } : c,
    );

    // Add new FAQ
    const newFaq: AgentFaqRow = {
      id: new mongoose.Types.ObjectId().toString(),
      question: question.trim(),
      answer: answer.trim(),
      createdAt: new Date().toISOString(),
    };
    const updatedFaqs = [...faqs, newFaq];

    await ClientAgent.updateOne(
      { _id: id, userId },
      { $set: { faqCandidates: updatedCandidates, agentFaqs: updatedFaqs } },
    );

    // Sync to hub
    if (canAttemptHubSync()) {
      const fresh = await ClientAgent.findOne({ _id: id, userId }).lean();
      if (fresh) {
        void syncHubCatalogFromLandingAgentDoc(
          fresh as Parameters<typeof syncHubCatalogFromLandingAgentDoc>[0],
        ).catch(() => {});
      }
    }

    return NextResponse.json({ ok: true, action: 'promoted', faq: newFaq });
  }

  return NextResponse.json({ error: `Acción desconocida: ${action}` }, { status: 400 });
}
