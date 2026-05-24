/**
 * Persistencia de transcript del widget (texto + capturas) para el Inbox.
 */

import { WidgetMessage } from '@/lib/db/models';
import type { WidgetImageEnrichment } from '@/lib/widget-chat-images';

export type PersistTranscriptInput = {
  widgetId: string;
  userId: string;
  agentId: string;
  sessionId: string;
  traceId?: string;
  userMessage: string;
  assistantMessage: string;
  enrichment?: WidgetImageEnrichment | null;
};

export async function persistWidgetTranscript(input: PersistTranscriptInput): Promise<void> {
  const sessionId = input.sessionId.trim();
  if (!sessionId || !input.widgetId || !input.userId) return;

  const base = {
    widgetId: input.widgetId,
    userId: input.userId,
    agentId: input.agentId || '',
    sessionId,
    traceId: input.traceId || '',
  };

  const userAttachments =
    input.enrichment?.images?.map((img, i) => ({
      type: 'image' as const,
      url: img.url,
      ocrText: input.enrichment?.analyses?.[i]?.text?.slice(0, 4000) || '',
    })) ?? [];

  const userContent = (input.enrichment?.displayMessage || input.userMessage).slice(0, 4000);

  await WidgetMessage.insertMany([
    {
      ...base,
      role: 'user',
      content: userContent,
      ...(userAttachments.length ? { attachments: userAttachments } : {}),
    },
    {
      ...base,
      role: 'assistant',
      content: input.assistantMessage.slice(0, 8000),
    },
  ]);
}
