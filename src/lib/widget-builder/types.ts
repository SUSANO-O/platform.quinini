import type { HandoffNotifyMode } from '@/lib/handoff-notify';
import type { PipelineConfig } from '@/lib/widget-pipeline-ui';
import type { AiBeamPalette, AiBeamScope } from '@/lib/widget-ai-beam';

export interface WidgetShortcut {
  id: string;
  label: string;
  message: string;
  emoji: string;
  enabled: boolean;
}

export type FeedbackQuestionType = 'rating' | 'choice' | 'text' | 'yesno';

export interface FeedbackQuestion {
  id: string;
  text: string;
  type: FeedbackQuestionType;
  options: string[];
  required: boolean;
  enabled: boolean;
}

export interface WidgetConfig {
  name: string;
  agentId: string;
  color: string;
  title: string;
  subtitle: string;
  welcome: string;
  fabHint: string;
  humanSupportPhone: string;
  humanSupportEnabled: boolean;
  handoffNotifyMode: HandoffNotifyMode;
  handoffTimeout: number;
  handoffEnabled: boolean;
  feedbackEnabled: boolean;
  feedbackTitle: string;
  feedbackThanks: string;
  conversationIdleTimeout: number;
  policyEnabled: boolean;
  policyText: string;
  policyLinkLabel: string;
  policyUrl: string;
  avatar: string;
  fabAvatarSize: number;
  position: string;
  theme: 'light' | 'dark';
  borderRadius: string;
  autoOpen: boolean;
  fabDismissible: boolean;
  voiceEnabled: boolean;
  /** Botón 📎 en el input del chat. */
  imageUploadEnabled: boolean;
  /** Botón micrófono (STT) en el input del chat. */
  micEnabled: boolean;
  multiAgentEnabled: boolean;
  multiAgentMode: 'triage' | 'parallel' | 'pipeline';
  agentIds: string[];
  orchestratorAgentIds: string[];
  pipelineConfig: PipelineConfig | null;
  /** Borde mágico modo AI: off | input | messages | both */
  aiBeamScope: AiBeamScope;
  aiBeamPalette: AiBeamPalette;
  aiBeamColor: string;
  aiBeamBlur: number;
  aiBeamSpeed: number;
  aiBeamIntensity: number;
  /** Fade superior/inferior al hacer scroll en mensajes. */
  scrollHaloEnabled: boolean;
  scrollHaloColorMode: 'brand' | 'custom';
  scrollHaloColor: string;
  scrollHaloHeight: number;
  scrollHaloOpacity: number;
  scrollHaloBlur: number;
  scrollHaloTop: boolean;
  scrollHaloBottom: boolean;
}

export interface ClientAgentRow {
  _id: string;
  name: string;
  description?: string;
  type: 'agent' | 'sub-agent';
  status: 'active' | 'disabled';
  agentHubId?: string | null;
  syncStatus?: string;
  model?: string;
  tools?: { toolId: string }[];
  subAgentIds?: string[];
  enabledMcpToolIds?: string[];
  ragEnabled?: boolean;
  ragSources?: unknown[];
  skills?: string[];
  scheduledTaskCount?: number;
  isPlatform?: boolean;
}

export interface OrchestratorSubAgent {
  _id: string;
  name: string;
  description?: string;
  status?: string;
  parentName?: string;
}

export type WidgetConfigPatch = Partial<WidgetConfig>;
