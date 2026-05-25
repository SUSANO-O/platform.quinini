#!/usr/bin/env node
/**
 * Inserta / actualiza todos los modelos Hugging Face del catálogo por defecto (AIBackHub)
 * en Mongo `agentflow.model_catalog` y los deja habilitados para agentes.
 *
 *   node --env-file=.env scripts/sync-huggingface-catalog.mjs
 *   DRY_RUN=1 node --env-file=.env scripts/sync-huggingface-catalog.mjs
 *
 * No borra modelos Vertex/Google ni otros proveedores — solo upsert HF.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConnection } from 'mongoose';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function loadEnvFile(path) {
  try {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i <= 0) continue;
      const key = t.slice(0, i).trim();
      let val = t.slice(i + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[key] == null || process.env[key] === '') process.env[key] = val;
    }
  } catch {
    /* optional */
  }
}

loadEnvFile(resolve(root, '.env'));
loadEnvFile(resolve(root, '../AIBackHub/.env'));

const DRY = process.env.DRY_RUN === '1';

/** Alineado con AIBackHub DEFAULT_CATALOG + extras del router HF (discover/static). */
const HF_CATALOG = [
  { modelId: 'hf/meta-llama/Llama-3.3-70B-Instruct', name: 'Llama 3.3 70B Instruct', category: 'chat', maxTokens: 128_000, description: 'Meta, alto rendimiento', sortOrder: 70, minPlan: 'free' },
  { modelId: 'hf/meta-llama/Llama-3.1-8B-Instruct', name: 'Llama 3.1 8B Instruct', category: 'chat', maxTokens: 128_000, description: 'Meta, liviano y rápido', sortOrder: 80, minPlan: 'free' },
  { modelId: 'hf/meta-llama/Llama-3.1-70B-Instruct', name: 'Llama 3.1 70B Instruct', category: 'chat', maxTokens: 128_000, description: 'Meta, potente', sortOrder: 90, minPlan: 'free' },
  { modelId: 'hf/mistralai/Mistral-7B-Instruct-v0.3', name: 'Mistral 7B Instruct v0.3', category: 'chat', maxTokens: 32_768, description: 'Mistral AI, compacto', sortOrder: 100, minPlan: 'free' },
  { modelId: 'hf/mistralai/Mixtral-8x7B-Instruct-v0.1', name: 'Mixtral 8x7B Instruct', category: 'chat', maxTokens: 32_768, description: 'Mistral AI, MoE', sortOrder: 110, minPlan: 'free' },
  { modelId: 'hf/mistralai/Mistral-Nemo-Instruct-2407', name: 'Mistral Nemo 12B', category: 'chat', maxTokens: 128_000, description: 'Mistral + NVIDIA', sortOrder: 120, minPlan: 'free' },
  { modelId: 'hf/mistralai/Ministral-8B-Instruct-2410', name: 'Ministral 8B', category: 'chat', maxTokens: 128_000, description: 'Mistral, compacto (Inference API)', sortOrder: 125, minPlan: 'free' },
  { modelId: 'hf/Qwen/Qwen2.5-72B-Instruct', name: 'Qwen 2.5 72B Instruct', category: 'chat', maxTokens: 131_072, description: 'Alibaba, multilingüe', sortOrder: 130, minPlan: 'starter' },
  { modelId: 'hf/Qwen/Qwen2.5-7B-Instruct', name: 'Qwen 2.5 7B Instruct', category: 'chat', maxTokens: 131_072, description: 'Alibaba, ligero', sortOrder: 132, minPlan: 'free' },
  { modelId: 'hf/Qwen/Qwen2.5-Coder-32B-Instruct', name: 'Qwen 2.5 Coder 32B', category: 'code', maxTokens: 131_072, description: 'Alibaba, código', sortOrder: 140, minPlan: 'growth' },
  { modelId: 'hf/microsoft/Phi-3.5-mini-instruct', name: 'Phi 3.5 Mini', category: 'chat', maxTokens: 128_000, description: 'Microsoft, ultra compacto', sortOrder: 150, minPlan: 'free' },
  { modelId: 'hf/google/gemma-2-27b-it', name: 'Gemma 2 27B IT', category: 'chat', maxTokens: 8_192, description: 'Google open source', sortOrder: 160, minPlan: 'free' },
  { modelId: 'hf/google/gemma-2-9b-it', name: 'Gemma 2 9B IT', category: 'chat', maxTokens: 8_192, description: 'Google open source, ligero', sortOrder: 170, minPlan: 'free' },
  { modelId: 'hf/google/gemma-4-31B-it', name: 'Gemma 4 31B IT (Hugging Face)', category: 'multimodal', maxTokens: 262_144, description: 'Gemma 4 vía HF Inference', sortOrder: 175, minPlan: 'free' },
  { modelId: 'hf/NousResearch/Hermes-3-Llama-3.1-8B', name: 'Hermes 3 Llama 8B', category: 'chat', maxTokens: 128_000, description: 'NousResearch, function calling', sortOrder: 180, minPlan: 'free' },
  { modelId: 'hf/meta-llama/Llama-3.2-11B-Vision-Instruct', name: 'Llama 3.2 11B Vision', category: 'vision', maxTokens: 128_000, description: 'Meta, texto + imagen', sortOrder: 190, minPlan: 'free' },
  { modelId: 'hf/Qwen/Qwen2-VL-7B-Instruct', name: 'Qwen2 VL 7B', category: 'vision', maxTokens: 32_768, description: 'Alibaba, visión', sortOrder: 200, minPlan: 'free' },
  { modelId: 'hf/TKNLGY/qwen3-tts', name: 'Qwen3 TTS', category: 'tts', maxTokens: 128_000, description: 'Text-to-Speech (Space)', sortOrder: 210, minPlan: 'free' },
  { modelId: 'hf/black-forest-labs/FLUX.1-dev', name: 'FLUX.1 Dev', category: 'image', maxTokens: 128_000, description: 'Generación de imágenes', sortOrder: 220, minPlan: 'growth' },
  { modelId: 'hf/stabilityai/stable-diffusion-xl-base-1.0', name: 'Stable Diffusion XL', category: 'image', maxTokens: 128_000, description: 'Stability AI, SDXL', sortOrder: 230, minPlan: 'growth' },
];

const uri = process.env.MONGODB_URI || '';
const hubMongoUri =
  process.env.AIBACKHUB_MONGO_URI?.trim() ||
  process.env.HUB_MONGODB_URI?.trim() ||
  uri.replace(/agentflowhub_landing/i, 'agentflow');

if (!hubMongoUri) {
  console.error('Falta MONGODB_URI (o AIBACKHUB_MONGO_URI).');
  process.exit(1);
}

function toDoc(entry) {
  const now = new Date().toISOString();
  return {
    modelId: entry.modelId,
    provider: 'huggingface',
    providerLabel: 'Hugging Face',
    name: entry.name,
    category: entry.category,
    maxTokens: entry.maxTokens,
    description: entry.description,
    enabled: true,
    deprecated: false,
    offerForNewAgents: true,
    sortOrder: entry.sortOrder,
    updatedAt: now,
    ...(entry.minPlan ? { minPlan: entry.minPlan } : {}),
  };
}

console.log(`Sincronizar catálogo Hugging Face (${HF_CATALOG.length} modelos)${DRY ? ' [DRY_RUN]' : ''}…\n`);

const conn = await createConnection(hubMongoUri).asPromise();
try {
  const col = conn.db.collection('model_catalog');
  let inserted = 0;
  let updated = 0;

  for (const entry of HF_CATALOG) {
    const doc = toDoc(entry);
    if (DRY) {
      const ex = await col.findOne({ modelId: entry.modelId });
      console.log(ex ? 'UPDATE' : 'INSERT', entry.modelId, '-', entry.name);
      continue;
    }
    const res = await col.updateOne({ modelId: entry.modelId }, { $set: doc }, { upsert: true });
    if (res.upsertedCount) inserted++;
    else if (res.modifiedCount) updated++;
    else console.log('  sin cambios:', entry.modelId);
  }

  const enabledCount = await col.countDocuments({ provider: 'huggingface', enabled: true });
  const totalHf = await col.countDocuments({ provider: 'huggingface' });

  console.log('\n--- Resumen ---');
  if (!DRY) console.log(`Upsert: ${inserted} nuevos, ${updated} actualizados`);
  console.log(`Total HF en Mongo: ${totalHf} | enabled: true → ${enabledCount}`);

  const list = await col
    .find({ provider: 'huggingface', enabled: true })
    .sort({ sortOrder: 1 })
    .project({ modelId: 1, name: 1, category: 1 })
    .toArray();
  console.log('\nModelos HF activos:');
  for (const m of list) {
    console.log(`  • ${m.modelId} (${m.category}) — ${m.name}`);
  }
} finally {
  await conn.close();
}

console.log('\nRecarga el selector en control-matias → Modelos IA o crea/edita un agente.');
console.log('Inferencia requiere HUGGING_FACE_API_KEY en AIBackHub prod.');
