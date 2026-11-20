/**
 * POST /api/admin/leads/[id]/convert — convierte un lead en cuenta + agente listo.
 *
 * Solo admin. Es la Opción A del embudo: cuando ventas cierra por WhatsApp, provisiona todo desde la
 * data que capturó el quiz. Crea el usuario (con el plan vendido, correo verificado), su suscripción,
 * y su agente (con buildAgentFromQuiz + scraping de su web si el plan lo permite). Marca el lead como
 * convertido y devuelve un enlace para que el cliente ponga su contraseña.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { connectDB } from '@/lib/db/connection';
import { User, Subscription, Lead } from '@/lib/db/models';
import { hashPassword, generateSecureToken } from '@/lib/auth';
import { getAgentLimits } from '@/lib/agent-plans';
import { createAgentFromAnswers } from '@/lib/onboarding/provision-lead';
import { buildEmbedSnippet } from '@/lib/quick-start-setup';
import type { QuizAnswers } from '@/lib/onboarding/quiz-config';

export const runtime = 'nodejs';
export const maxDuration = 120;

const VALID_PLANS = ['solo', 'team', 'plus', 'business', 'enterprise'];

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const adminId = await requireAdmin(req);
  if (!adminId) return NextResponse.json({ error: 'Solo administradores.' }, { status: 403 });

  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { email?: string; plan?: string; displayName?: string } | null;
  const email = (body?.email ?? '').trim().toLowerCase();
  const plan = (body?.plan ?? '').trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Correo inválido.' }, { status: 400 });
  }
  if (!VALID_PLANS.includes(plan)) {
    return NextResponse.json({ error: `Plan inválido. Usa uno de: ${VALID_PLANS.join(', ')}.` }, { status: 400 });
  }

  await connectDB();

  const lead = await Lead.findById(id).lean() as (QuizAnswers & { _id: unknown; businessName?: string; answers?: QuizAnswers; status?: string }) | null;
  if (!lead) return NextResponse.json({ error: 'Lead no encontrado.' }, { status: 404 });

  const existing = await User.findOne({ email }).lean() as { _id: unknown } | null;
  if (existing) {
    return NextResponse.json({ error: 'Ya existe un usuario con ese correo.' }, { status: 409 });
  }

  // ── Crear usuario (contraseña temporal aleatoria + token para que la fije) ──
  const tempPassword = generateSecureToken();
  const passwordHash = await hashPassword(tempPassword);
  const resetToken = generateSecureToken();
  const resetTokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 días
  const displayName = (body?.displayName ?? lead.businessName ?? email.split('@')[0]).toString().slice(0, 120);

  const user = await User.create({
    email,
    passwordHash,
    hashVersion: 'v2-bcrypt',
    displayName,
    emailVerified: true, // ventas ya validó al cliente
    role: 'user',
    resetToken,
    resetTokenExpiry,
  });
  const userId = user._id.toString();

  // ── Suscripción con el plan vendido ──
  await Subscription.create({ userId, plan, status: 'active' });

  // ── Agente desde la data del lead (scrapea la web si el plan lo permite) ──
  const answers: QuizAnswers = (lead.answers && typeof lead.answers === 'object' ? lead.answers : (lead as QuizAnswers)) ?? {};
  const withScrape = getAgentLimits(plan).ragEnabled;
  let agentId = '';
  let agentName = '';
  let widgetId = '';
  let widgetToken = '';
  try {
    const agent = await createAgentFromAnswers({ userId, answers, withScrape });
    agentId = String(agent._id);
    agentName = agent.name;
    widgetId = agent.widgetId;
    widgetToken = agent.widgetToken;
  } catch (err) {
    // La cuenta ya quedó creada; reportamos el fallo del agente sin romper todo.
    return NextResponse.json(
      {
        ok: true,
        userId,
        agentCreated: false,
        warning: 'Usuario creado, pero falló la creación del agente: ' + (err instanceof Error ? err.message : 'error'),
      },
      { status: 207 },
    );
  }

  // ── Marcar lead convertido ──
  await Lead.updateOne(
    { _id: id },
    {
      $set: { status: 'converted', convertedAt: new Date(), userId, agentName },
      $push: { notes: { text: `Convertido por admin ${adminId} → plan ${plan}`, at: new Date() } },
    },
  );

  const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://app.botiva.space';
  const setPasswordUrl = `${appUrl.replace(/\/$/, '')}/reset-password?token=${resetToken}`;

  // Snippet de embed del widget para poner en la web del cliente (host público de la landing).
  const widgetHost = process.env.WIDGET_PUBLIC_URL || 'https://botiva.space';
  const embedSnippet = widgetToken ? buildEmbedSnippet(widgetHost, widgetToken) : '';

  return NextResponse.json(
    { ok: true, userId, agentId, agentName, widgetId, widgetToken, embedSnippet, setPasswordUrl },
    { status: 201 },
  );
}
