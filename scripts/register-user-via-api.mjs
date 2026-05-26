#!/usr/bin/env node
/**
 * Crea código de registro en Mongo y opcionalmente registra un usuario vía POST /api/auth.
 *
 *   node --env-file=.env scripts/register-user-via-api.mjs \
 *     andresdias24@gmail.com andresdias1234 ANDRESDIAS1234 team \
 *     --base-url https://www.quinini.online
 */
import mongoose from 'mongoose';

const [emailRaw, password, codeRaw, planRaw] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const baseUrlArg = process.argv.find((a) => a.startsWith('--base-url='));
const BASE_URL = (baseUrlArg?.split('=')[1] || process.env.BASE_URL || 'http://localhost:3201').replace(/\/$/, '');

const email = (emailRaw || '').toLowerCase().trim();
const passwordStr = password || '';
const code = (codeRaw || '').trim().toUpperCase();
const plan = (planRaw || 'team').toLowerCase().trim();
const uri = process.env.MONGODB_URI || '';

const VALID = ['free', 'solo', 'basic', 'team', 'plus', 'starter', 'growth', 'business', 'enterprise'];

if (!email || !passwordStr || !code || !plan) {
  console.error(
    'Uso: node --env-file=.env scripts/register-user-via-api.mjs <email> <password> <codigo> <plan> [--base-url=URL]',
  );
  process.exit(1);
}
if (!VALID.includes(plan)) {
  console.error('Plan inválido:', plan);
  process.exit(1);
}
if (!uri) {
  console.error('MONGODB_URI no definido');
  process.exit(1);
}

await mongoose.connect(uri);
const db = mongoose.connection.db;

const existingUser = await db.collection('users').findOne({ email });
if (existingUser) {
  console.log('Usuario ya existe:', email, '→ actualizando suscripción a', plan);
  const userId = existingUser._id.toString();
  const now = Math.floor(Date.now() / 1000);
  await db.collection('subscriptions').findOneAndUpdate(
    { userId },
    {
      $set: {
        userId,
        plan,
        status: 'active',
        currentPeriodStart: now,
        currentPeriodEnd: now + 30 * 24 * 60 * 60,
        cancelAtPeriodEnd: false,
      },
      $currentDate: { updatedAt: true },
    },
    { upsert: true },
  );
  console.log('Suscripción actualizada. No se llama a /api/auth (cuenta existente).');
  await mongoose.disconnect();
  process.exit(0);
}

await db.collection('registrationcodes').findOneAndUpdate(
  { code },
  {
    $set: {
      code,
      plan,
      maxUses: 50,
      active: true,
      expiresAt: null,
      createdBy: 'script:register-user-via-api',
      note: `Auto ${email}`,
    },
    $setOnInsert: { usedCount: 0, uses: [], createdAt: new Date() },
    $currentDate: { updatedAt: true },
  },
  { upsert: true },
);
console.log('Código Mongo listo:', code, '→', plan);

await mongoose.disconnect();

const body = {
  action: 'register',
  email,
  password: passwordStr,
  displayName: email.split('@')[0],
  registrationCode: code,
};

console.log('POST', `${BASE_URL}/api/auth`);
const res = await fetch(`${BASE_URL}/api/auth`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const json = await res.json().catch(() => ({}));

if (!res.ok) {
  console.error('Registro falló:', res.status, json.error || json);
  process.exit(1);
}

console.log('Registro OK');
console.log('email:', json.user?.email);
console.log('uid:', json.user?.uid);
console.log('plan asignado vía código:', plan);
