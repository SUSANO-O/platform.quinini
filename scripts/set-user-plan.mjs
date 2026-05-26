#!/usr/bin/env node
/**
 * Asigna o actualiza el plan de un usuario por email.
 * Si no existe y pasas --create, crea la cuenta con contraseña temporal.
 *
 * Uso:
 *   node --env-file=.env scripts/set-user-plan.mjs <email> <plan>
 *   node --env-file=.env scripts/set-user-plan.mjs <email> <plan> --create
 */
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const args = process.argv.slice(2).filter((a) => a !== '--create');
const createIfMissing = process.argv.includes('--create');
const email = (args[0] || '').toLowerCase().trim();
const plan = (args[1] || '').toLowerCase().trim();
const uri = process.env.MONGODB_URI || '';

const VALID = ['free', 'solo', 'basic', 'team', 'plus', 'starter', 'growth', 'business', 'enterprise'];

if (!email || !plan) {
  console.error('Uso: node --env-file=.env scripts/set-user-plan.mjs <email> <plan> [--create]');
  process.exit(1);
}
if (!uri) {
  console.error('MONGODB_URI no definido');
  process.exit(1);
}
if (!VALID.includes(plan)) {
  console.error('Plan inválido. Válidos:', VALID.join(', '));
  process.exit(1);
}

await mongoose.connect(uri);
const db = mongoose.connection.db;
let user = await db.collection('users').findOne({ email });
let tempPassword = null;

if (!user) {
  if (!createIfMissing) {
    console.error('Usuario no encontrado:', email);
    console.error('Añade --create para crear la cuenta.');
    await mongoose.disconnect();
    process.exit(1);
  }
  tempPassword = `BotIvA-${crypto.randomBytes(4).toString('hex')}!`;
  const passwordHash = await bcrypt.hash(tempPassword, 12);
  const insert = await db.collection('users').insertOne({
    email,
    passwordHash,
    hashVersion: 'v2-bcrypt',
    displayName: email.split('@')[0],
    role: 'user',
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  user = { _id: insert.insertedId, email };
  console.log('Cuenta creada.');
  console.log('Contraseña temporal:', tempPassword);
  console.log('(Cámbiala en Ajustes o con «Olvidé mi contraseña».)');
}

const userId = user._id.toString();
const now = Math.floor(Date.now() / 1000);
const periodEnd = now + 30 * 24 * 60 * 60;

const result = await db.collection('subscriptions').findOneAndUpdate(
  { userId },
  {
    $set: {
      userId,
      plan,
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
    },
    $setOnInsert: { trialStartedAt: null, trialEndsAt: null, createdAt: new Date() },
    $currentDate: { updatedAt: true },
  },
  { upsert: true, returnDocument: 'after' },
);

console.log('OK');
console.log('email:', email);
console.log('userId:', userId);
console.log('plan:', result?.plan, 'status:', result?.status);
console.log('periodo hasta:', new Date((result?.currentPeriodEnd || periodEnd) * 1000).toISOString());

await mongoose.disconnect();
