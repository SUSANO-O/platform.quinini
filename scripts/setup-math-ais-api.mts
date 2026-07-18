/**
 * Configura MCP BotIvA API REST para Math-ais (requiere API REST en :4000 y AIBackHub).
 *
 *   npx tsx --env-file=.env scripts/setup-math-ais-api.mts
 */
import { ensureAssistApiMcpConnection, getAssistApiMcpStatus } from '../src/lib/assist-api-mcp-service.ts';

async function main() {
  console.log('Estado actual:', await getAssistApiMcpStatus());
  const result = await ensureAssistApiMcpConnection();
  console.log(result.message);
  console.log('Estado final:', result.status);
  process.exit(result.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
