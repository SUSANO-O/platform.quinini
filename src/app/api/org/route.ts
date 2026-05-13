/**
 * GET  /api/org         → organización del usuario (o null)
 * POST /api/org         → crear nueva organización
 * PUT  /api/org         → actualizar nombre
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { verifySessionToken } from '@/lib/auth';
import { connectDB } from '@/lib/db/connection';
import { Organization, Subscription } from '@/lib/db/models';

function auth(req: NextRequest) {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
}

export async function GET(req: NextRequest) {
  const userId = auth(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  await connectDB();

  const org = await Organization.findOne({
    $or: [{ ownerId: userId }, { 'members.userId': userId }],
  }).lean() as {
    _id: unknown; name: string; slug: string; ownerId: string;
    members: { userId: string; role: string; joinedAt: Date }[];
    invites: { email: string; role: string; token: string; expiresAt: Date; invitedBy: string }[];
  } | null;

  if (!org) return NextResponse.json({ org: null });

  const myRole = org.ownerId === userId
    ? 'owner'
    : (org.members.find(m => m.userId === userId)?.role || 'viewer');

  return NextResponse.json({
    org: {
      id: String(org._id),
      name: org.name,
      slug: org.slug,
      ownerId: org.ownerId,
      myRole,
      memberCount: org.members.length + 1,
      pendingInvites: org.invites.filter(i => i.expiresAt > new Date()).length,
    },
  });
}

export async function POST(req: NextRequest) {
  const userId = auth(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const body = await req.json() as { name?: string };
  const name = body.name?.trim();
  if (!name || name.length < 2) {
    return NextResponse.json({ error: 'El nombre debe tener al menos 2 caracteres.' }, { status: 400 });
  }

  await connectDB();

  // Only Business+ plans can create organizations
  const sub = await Subscription.findOne({ userId }).select({ plan: 1, status: 1 }).lean() as
    | { plan?: string; status?: string } | null;
  const plan = sub?.plan || 'free';
  const active = ['active', 'trialing'].includes(sub?.status || '');
  if (!active || !['business', 'enterprise'].includes(plan)) {
    return NextResponse.json({
      error: 'Las cuentas de equipo requieren plan Business o Enterprise.',
      code: 'PLAN_REQUIRED',
      requiredPlan: 'business',
    }, { status: 403 });
  }

  // Check if user already has an org
  const existing = await Organization.findOne({
    $or: [{ ownerId: userId }, { 'members.userId': userId }],
  });
  if (existing) {
    return NextResponse.json({ error: 'Ya perteneces a una organización.' }, { status: 409 });
  }

  let slug = slugify(name);
  // Ensure slug is unique
  const conflict = await Organization.findOne({ slug });
  if (conflict) slug = `${slug}-${crypto.randomBytes(3).toString('hex')}`;

  const org = await Organization.create({
    name,
    slug,
    ownerId: userId,
    members: [],
    invites: [],
  });

  return NextResponse.json({ ok: true, orgId: org._id.toString(), name: org.name, slug: org.slug }, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const userId = auth(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const body = await req.json() as { name?: string };
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: 'name requerido.' }, { status: 400 });

  await connectDB();

  const org = await Organization.findOne({ ownerId: userId });
  if (!org) return NextResponse.json({ error: 'No tienes una organización como owner.' }, { status: 404 });

  org.name = name;
  await org.save();

  return NextResponse.json({ ok: true, name: org.name });
}
