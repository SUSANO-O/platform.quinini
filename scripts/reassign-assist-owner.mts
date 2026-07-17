/**
 * Mueve Math / Math-ais a admin@agentflowhub.com y revierte limarle211990
 * (quita ownership de plataforma; no puede restaurar password anterior).
 *
 *   npx tsx --env-file=.env scripts/reassign-assist-owner.mts
 */
import mongoose from 'mongoose';
import { connectDB } from '../src/lib/db/connection.ts';
import { ClientAgent, Subscription, User, Widget } from '../src/lib/db/models.ts';
import { ensureLandingAssistAgents } from '../src/lib/ensure-landing-assist-agents.ts';

const TARGET = 'admin@agentflowhub.com';
const REVERT = 'limarle211990@gmail.com';

async function main() {
  await connectDB();

  const admin = await User.findOne({ email: TARGET });
  if (!admin) {
    console.error('NO_ADMIN_USER', TARGET);
    process.exit(1);
  }
  if (admin.role !== 'admin') {
    admin.role = 'admin';
    await admin.save();
    console.log('PROMOTED', TARGET);
  }
  const adminId = String(admin._id);
  console.log('TARGET', TARGET, adminId);

  // Asegurar assist bajo este admin
  process.env.INTERNAL_ASSIST_OWNER_EMAIL = TARGET;
  const ensured = await ensureLandingAssistAgents({ adminUserId: adminId, syncHub: true });
  console.log(
    'ENSURE',
    ensured.items.map((i) => ({ hub: i.hubId, ready: i.ready, agentUser: i.agent?.userId })),
  );

  for (const hubId of ['math-ais', 'math']) {
    await ClientAgent.updateMany(
      { $or: [{ agentHubId: hubId }, { name: hubId === 'math-ais' ? 'Math-ais' : 'Math' }] },
      { $set: { userId: adminId, isPlatform: false, status: 'active' } },
    );
    const agents = await ClientAgent.find({ agentHubId: hubId }).select({ _id: 1 });
    for (const a of agents) {
      await Widget.updateMany({ agentId: String(a._id) }, { $set: { userId: adminId, active: true } });
    }
  }

  // Revertir limarle: user normal, plan free (estado típico previo si no hay historial)
  const limarle = await User.findOne({ email: REVERT });
  if (limarle) {
    const limarleId = String(limarle._id);
    if (limarle.role === 'admin') {
      limarle.role = 'user';
      await limarle.save();
      console.log('REVERT_ROLE user', REVERT);
    }
    // Quitar ownership de agentes plataforma si quedara algo
    await ClientAgent.updateMany(
      { userId: limarleId, isPlatform: true },
      { $set: { userId: adminId } },
    );
    await Widget.updateMany(
      { userId: limarleId, agentId: { $in: (await ClientAgent.find({ isPlatform: true }).distinct('_id')).map(String) } },
      { $set: { userId: adminId } },
    );

    const sub = await Subscription.findOne({ userId: limarleId });
    if (sub && (sub.plan === 'enterprise' || sub.planManagedBy === 'admin')) {
      // Solo revertir si lo dejamos enterprise/admin-managed nosotros
      sub.plan = 'free';
      sub.status = 'active';
      sub.features = [];
      sub.planManagedBy = null;
      sub.scheduledTaskLimit = null;
      await sub.save();
      console.log('REVERT_SUB free', REVERT);
    } else {
      console.log('SUB_LEFT_AS_IS', REVERT, sub?.plan, sub?.planManagedBy);
    }
    console.log('NOTE: password de limarle no se puede restaurar; usar «Olvidé mi contraseña» si hace falta.');
  } else {
    console.log('NO_LIMARLE');
  }

  const mathAis = await ClientAgent.findOne({ agentHubId: 'math-ais' })
    .select({ userId: 1, name: 1 })
    .lean();
  console.log('RESULT', {
    mathAisUserId: mathAis?.userId,
    ownerEmail: TARGET,
    limarleRole: limarle?.role,
  });

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
