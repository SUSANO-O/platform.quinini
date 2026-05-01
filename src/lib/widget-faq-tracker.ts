import mongoose from 'mongoose';
import { ClientAgent } from '@/lib/db/models';
import {
  normalizeFaqKey,
  userMessageMatchesRegisteredFaq,
  type AgentFaqRow,
  type FaqCandidateRow,
} from '@/lib/agent-faq-utils';
import { canAttemptHubSync, syncHubCatalogFromLandingAgentDoc } from '@/lib/aibackhub-sync';

const MAX_CANDIDATES = 40;
const MIN_MESSAGE_LEN = 14;

function extractLastUserMessage(rawBody: string): string | null {
  try {
    const j = JSON.parse(rawBody) as {
      message?: string;
      messages?: Array<{ role?: string; content?: string }>;
      history?: Array<{ role?: string; content?: string }>;
    };
    if (typeof j.message === 'string' && j.message.trim()) {
      return j.message.trim();
    }
    const arr = Array.isArray(j.messages) ? j.messages : Array.isArray(j.history) ? j.history : null;
    if (!arr) return null;
    for (let i = arr.length - 1; i >= 0; i--) {
      if (String(arr[i]?.role || '').toLowerCase() === 'user') {
        const c = String(arr[i]?.content ?? '').trim();
        return c || null;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

function bumpCandidates(
  prev: FaqCandidateRow[] | undefined,
  key: string,
  sample: string,
): FaqCandidateRow[] {
  const list = Array.isArray(prev) ? [...prev] : [];
  const idx = list.findIndex((c) => c.key === key && !c.dismissed);
  const now = new Date().toISOString();
  if (idx >= 0) {
    const cur = list[idx]!;
    list[idx] = {
      ...cur,
      count: (cur.count ?? 0) + 1,
      lastSeen: now,
      questionSample: sample.length > (cur.questionSample?.length ?? 0) ? sample : cur.questionSample,
    };
  } else {
    list.push({
      id: new mongoose.Types.ObjectId().toString(),
      key,
      questionSample: sample.slice(0, 400),
      count: 1,
      lastSeen: now,
      dismissed: false,
    });
  }
  list.sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
  return list.slice(0, MAX_CANDIDATES);
}

/**
 * Tras un turno de chat del widget (token wt_), registra candidatas a FAQ si el mensaje
 * no coincide con ninguna FAQ ya definida.
 */
export async function trackWidgetUserMessageForFaqCandidates(params: {
  ownerUserId: string;
  agentIdOrHubId: string;
  rawBody: string;
}): Promise<void> {
  const last = extractLastUserMessage(params.rawBody);
  if (!last || last.length < MIN_MESSAGE_LEN) return;

  const idParam = params.agentIdOrHubId.trim();
  if (!idParam) return;

  const hex = /^[a-f0-9]{24}$/i;
  const agent =
    hex.test(idParam)
      ? await ClientAgent.findOne({
          _id: idParam,
          userId: params.ownerUserId,
        })
          .select({ agentFaqs: 1, faqCandidates: 1 })
          .lean()
      : await ClientAgent.findOne({
          agentHubId: idParam,
          userId: params.ownerUserId,
        })
          .select({ agentFaqs: 1, faqCandidates: 1 })
          .lean();

  if (!agent) return;

  const faqs = (agent as { agentFaqs?: AgentFaqRow[] }).agentFaqs ?? [];
  if (userMessageMatchesRegisteredFaq(last, faqs)) return;

  const key = normalizeFaqKey(last);
  if (key.length < 10) return;

  const prev = ((agent as { faqCandidates?: FaqCandidateRow[] }).faqCandidates ?? []) as FaqCandidateRow[];
  const next = bumpCandidates(prev, key, last.slice(0, 400));

  const filter = hex.test(idParam) ? { _id: idParam, userId: params.ownerUserId } : { agentHubId: idParam, userId: params.ownerUserId };
  await ClientAgent.updateOne(filter, { $set: { faqCandidates: next } });

  if (canAttemptHubSync()) {
    const fresh = await ClientAgent.findOne(filter).lean();
    if (fresh) {
      void syncHubCatalogFromLandingAgentDoc(
        fresh as Parameters<typeof syncHubCatalogFromLandingAgentDoc>[0],
      ).catch(() => {});
    }
  }
}
