/**
 * GET  /api/agent-templates          → lista todos los templates
 * POST /api/agent-templates/apply    → crea un agente a partir de un template
 */

import { NextRequest, NextResponse } from 'next/server';
import { AGENT_TEMPLATES, getTemplate } from '@/lib/agent-templates';
import { verifySessionToken } from '@/lib/auth';
import { connectDB } from '@/lib/db/connection';
import { ClientAgent, Subscription } from '@/lib/db/models';
import { getAgentLimits } from '@/lib/agent-plans';

export async function GET() {
  return NextResponse.json({
    templates: AGENT_TEMPLATES.map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      icon: t.icon,
      color: t.color,
      tags: t.tags,
    })),
  });
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  const userId = verifySessionToken(token);
  if (!userId) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 });

  const body = await req.json() as { templateId?: string; name?: string };
  const { templateId, name } = body;

  if (!templateId) return NextResponse.json({ error: 'templateId requerido.' }, { status: 400 });

  const template = getTemplate(templateId);
  if (!template) return NextResponse.json({ error: 'Template no encontrado.' }, { status: 404 });

  await connectDB();

  // Check agent limit for user's plan
  const sub = await Subscription.findOne({ userId })
    .select({ plan: 1, status: 1 })
    .lean() as { plan?: string; status?: string } | null;
  const effectivePlan = ['active', 'trialing'].includes(sub?.status || '') ? (sub?.plan || 'free') : 'free';
  const limits = getAgentLimits(effectivePlan);

  const currentAgentCount = await ClientAgent.countDocuments({ userId, type: 'agent', status: 'active' });
  if (limits.maxAgents >= 0 && currentAgentCount >= limits.maxAgents) {
    return NextResponse.json({
      error: `Tu plan ${effectivePlan} permite máximo ${limits.maxAgents} agente(s). Actualiza para crear más.`,
      code: 'AGENT_LIMIT_EXCEEDED',
    }, { status: 403 });
  }

  const agentName = (name?.trim() || template.name).slice(0, 100);

  const agent = await ClientAgent.create({
    userId,
    name: agentName,
    description: template.description,
    systemPrompt: template.systemPrompt,
    model: template.model,
    ragEnabled: template.ragEnabled,
    agentFaqs: template.suggestedFaqs.map((f, i) => ({
      id: `faq-${i}-${Date.now()}`,
      question: f.question,
      answer: f.answer,
      createdAt: new Date().toISOString(),
    })),
    skills: template.suggestedSkills,
    strictPurposeOnly: true,
    syncStatus: 'pending',
    type: 'agent',
    status: 'active',
  });

  return NextResponse.json({
    ok: true,
    agentId: agent._id.toString(),
    name: agent.name,
    templateUsed: templateId,
  }, { status: 201 });
}
