/**
 * POST /api/org/invite         → enviar invitación por email
 * DELETE /api/org/invite       → revocar invitación (por token)
 * POST /api/org/invite/accept  → aceptar invitación (token en body)
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { verifySessionToken } from '@/lib/auth';
import { connectDB } from '@/lib/db/connection';
import { Organization, User } from '@/lib/db/models';
import { sendEmail } from '@/lib/email';

function auth(req: NextRequest) {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

// POST /api/org/invite — invite a member
export async function POST(req: NextRequest) {
  const userId = auth(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const url = new URL(req.url);
  if (url.pathname.endsWith('/accept')) {
    return acceptInvite(req, userId);
  }

  const body = await req.json() as { email?: string; role?: string };
  const email = body.email?.toLowerCase().trim();
  const role = (body.role === 'admin' ? 'admin' : 'viewer') as 'admin' | 'viewer';

  if (!email) return NextResponse.json({ error: 'email requerido.' }, { status: 400 });

  await connectDB();

  // Must be owner or admin
  const org = await Organization.findOne({
    $or: [{ ownerId: userId }, { 'members': { $elemMatch: { userId, role: 'admin' } } }],
  });
  if (!org) return NextResponse.json({ error: 'No tienes permisos para invitar miembros.' }, { status: 403 });

  // Check if already a member
  const isAlreadyMember = org.ownerId === email ||
    org.members.some((m: { userId: string }) => m.userId === email);
  if (isAlreadyMember) {
    return NextResponse.json({ error: 'Este usuario ya es miembro.' }, { status: 409 });
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  // Remove old invite for same email if exists
  org.invites = (org.invites as { email: string }[]).filter((i) => i.email !== email);
  org.invites.push({ email, role, token, expiresAt, invitedBy: userId });
  await org.save();

  const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL || ''}/invite/accept?token=${token}`;

  await sendEmail({
    to: email,
    subject: `Invitación para unirte a ${org.name}`,
    html: `
      <p>Has sido invitado a unirte a <strong>${org.name}</strong> en BotIvA como <strong>${role}</strong>.</p>
      <p><a href="${inviteUrl}" style="background:#0d9488;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block">Aceptar invitación</a></p>
      <p>Este enlace expira en 7 días.</p>
    `,
  }).catch(() => {});

  return NextResponse.json({ ok: true, email, role, expiresAt });
}

async function acceptInvite(req: NextRequest, userId: string) {
  const body = await req.json() as { token?: string };
  const token = body.token?.trim();
  if (!token) return NextResponse.json({ error: 'token requerido.' }, { status: 400 });

  await connectDB();

  const user = await User.findById(userId).select({ email: 1 }).lean() as { email?: string } | null;
  if (!user?.email) return NextResponse.json({ error: 'Usuario no encontrado.' }, { status: 404 });

  const org = await Organization.findOne({
    'invites': { $elemMatch: { token, expiresAt: { $gt: new Date() } } },
  });

  if (!org) return NextResponse.json({ error: 'Invitación inválida o expirada.' }, { status: 404 });

  const invite = (org.invites as { token: string; email: string; role: string; expiresAt: Date }[])
    .find(i => i.token === token);

  if (!invite || invite.email !== user.email) {
    return NextResponse.json({ error: 'Esta invitación no es para tu cuenta.' }, { status: 403 });
  }

  // Add as member
  const alreadyMember = (org.members as { userId: string }[]).some(m => m.userId === userId);
  if (!alreadyMember) {
    org.members.push({ userId, role: invite.role, joinedAt: new Date() });
  }

  // Remove used invite
  org.invites = (org.invites as { token: string }[]).filter(i => i.token !== token);
  await org.save();

  return NextResponse.json({ ok: true, orgId: String(org._id), orgName: org.name, role: invite.role });
}

export async function DELETE(req: NextRequest) {
  const userId = auth(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'token requerido.' }, { status: 400 });

  await connectDB();

  const org = await Organization.findOne({
    $or: [{ ownerId: userId }, { 'members': { $elemMatch: { userId, role: 'admin' } } }],
  });
  if (!org) return NextResponse.json({ error: 'No tienes permisos.' }, { status: 403 });

  org.invites = (org.invites as { token: string }[]).filter(i => i.token !== token);
  await org.save();

  return NextResponse.json({ ok: true });
}
