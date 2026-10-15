/**
 * Prompt guardado de un agente = prompt base + bloque de reglas + bloque de FAQ.
 * Los bloques se reconstruyen siempre desde behaviorRules / agentFaqs al guardar (editor del
 * agente y propuestas aplicadas desde el auditor), así que el prompt base es lo único editable.
 */
import {
  buildFaqPromptBlock,
  stripManagedFaqPrompt,
  type AgentFaqRow,
  type FaqCandidateRow,
} from '@/lib/agent-faq-utils';

export interface BehaviorRule {
  id: string;
  title: string;
  enabled: boolean;
  priority: number;
  category: string;
  tone: string;
  shortAnswers: boolean;
  complaintPolicy: string;
  unknownAnswerPolicy: string;
  interpretedRule: string;
  notes: string;
}

const RULES_PROMPT_START = '### [AFHUB_RULES_START]';
const RULES_PROMPT_END = '### [AFHUB_RULES_END]';

export function stripManagedRulesPrompt(raw: string): string {
  const s = raw || '';
  const start = s.indexOf(RULES_PROMPT_START);
  const end = s.indexOf(RULES_PROMPT_END);
  if (start === -1 || end === -1 || end < start) return s.trim();
  const before = s.slice(0, start).trimEnd();
  const after = s.slice(end + RULES_PROMPT_END.length).trimStart();
  return [before, after].filter(Boolean).join('\n\n').trim();
}

export function buildRulesPrompt(rules: BehaviorRule[]): string {
  const active = rules
    .filter((r) => r.enabled)
    .sort((a, b) => a.priority - b.priority);
  if (active.length === 0) return '';
  const lines = active.map((r, idx) => {
    const extras: string[] = [];
    extras.push(`categoria=${r.category}`);
    extras.push(`tono=${r.tone}`);
    if (r.shortAnswers) extras.push('respuesta_corta=si');
    if (r.complaintPolicy.trim()) extras.push(`quejas=${r.complaintPolicy.trim()}`);
    if (r.unknownAnswerPolicy.trim()) extras.push(`si_no_sabe=${r.unknownAnswerPolicy.trim()}`);
    const body = r.interpretedRule.trim() || r.notes.trim() || 'Aplicar esta regla de forma consistente.';
    return `${idx + 1}. ${r.title.trim()} [${extras.join(' | ')}]\n   - ${body}`;
  });
  return `${RULES_PROMPT_START}
Reglas operativas configuradas por el cliente (aplícalas de mayor prioridad a menor prioridad):
${lines.join('\n')}
${RULES_PROMPT_END}`;
}

export function mergeSystemPromptWithManagedBlocks(
  basePrompt: string,
  rules: BehaviorRule[],
  faqs: AgentFaqRow[],
  candidates: FaqCandidateRow[],
): string {
  const base = stripManagedFaqPrompt(stripManagedRulesPrompt(basePrompt));
  const rulesBlock = buildRulesPrompt(rules);
  const faqBlock = buildFaqPromptBlock(faqs, candidates);
  return [base, rulesBlock, faqBlock].filter(Boolean).join('\n\n').trim();
}

/** Prompt base (sin los bloques administrados de reglas y FAQ). */
export function baseSystemPrompt(raw: string): string {
  return stripManagedFaqPrompt(stripManagedRulesPrompt(raw || ''));
}

/** Completa una regla guardada (Mixed en Mongo) con los valores por defecto del editor. */
export function normalizeBehaviorRule(r: Partial<BehaviorRule> & Record<string, unknown>, i: number): BehaviorRule {
  const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);
  return {
    id: str(r.id, `rule_${i}`),
    title: str(r.title, 'Regla'),
    enabled: r.enabled !== false,
    priority: typeof r.priority === 'number' ? r.priority : i * 10,
    category: str(r.category, 'general'),
    tone: str(r.tone, 'profesional'),
    shortAnswers: r.shortAnswers === true,
    complaintPolicy: str(r.complaintPolicy),
    unknownAnswerPolicy: str(r.unknownAnswerPolicy),
    interpretedRule: str(r.interpretedRule),
    notes: str(r.notes),
  };
}
