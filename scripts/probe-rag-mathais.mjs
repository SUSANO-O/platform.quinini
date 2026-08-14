/**
 * Comprueba que Math-ais recupera sus documentos recien indexados.
 * Uso: npx tsx --env-file=.env scripts/probe-rag-mathais.mjs
 */
import { retrieveRagContextBlock } from '../src/lib/rag-embeddings-index.ts';

const queries = [
  'donde esta la bandeja de entrada en el dashboard',
  'como crear un agente con el selector de modelo',
  'que es el widget builder',
];

for (const q of queries) {
  const b = await retrieveRagContextBlock({ agentHubId: 'math-ais', query: q });
  console.log(`\nQ: ${q}`);
  console.log(b ? `OK ${b.replace(/\s+/g, ' ').slice(0, 180)}` : 'NADA');
}
process.exit(0);
