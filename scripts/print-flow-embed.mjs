#!/usr/bin/env node
import dns from 'dns';
import mongoose from 'mongoose';

if (process.platform === 'win32') dns.setServers(['8.8.8.8', '1.1.1.1']);

const uri = process.env.MONGODB_URI?.trim();
if (!uri) {
  console.error('Falta MONGODB_URI');
  process.exit(1);
}

await mongoose.connect(uri);

const Flow = mongoose.models.ConversationFlow
  || mongoose.model('ConversationFlow', new mongoose.Schema({}, { strict: false, collection: 'conversationflows' }));
const Widget = mongoose.models.Widget
  || mongoose.model('Widget', new mongoose.Schema({}, { strict: false, collection: 'widgets' }));

const flow = await Flow.findOne({ embedToken: { $exists: true, $ne: null, $ne: '' } })
  .sort({ updatedAt: -1 })
  .lean();

if (!flow) {
  console.log('No hay flujos con embedToken. Crea uno en /dashboard/flows');
  await mongoose.disconnect();
  process.exit(1);
}

const widget = await Widget.findOne({ userId: flow.userId })
  .sort({ updatedAt: -1 })
  .select({ afhubToken: 1, name: 1 })
  .lean();

const origin = (process.env.BASE_URL || 'http://localhost:3201').replace(/\/$/, '');
const wt = widget?.afhubToken?.trim()
  ? ` data-widget-token="${widget.afhubToken.trim()}"`
  : '';
const flowId = String(flow._id);
const snippet = [
  '<!-- BotIvA Flow Widget -->',
  `<script${wt} data-flow-id="${flowId}" data-flow-token="${flow.embedToken}" src="${origin}/widget.js"></script>`,
].join('\n');

console.log('\n=== EMBED PARA PROBAR ===\n');
console.log(`Flujo: ${flow.name} (${flow.status})`);
console.log(`ID: ${flowId}`);
if (widget?.name) console.log(`Widget: ${widget.name}`);
console.log(`Origen: ${origin}\n`);
console.log(snippet);
console.log('\nPega antes de </body> en cualquier HTML.\n');

await mongoose.disconnect();
