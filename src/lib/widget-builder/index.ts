export * from './types';
export * from './constants';
export * from './default-config';
export * from './agent-utils';
export * from './agent-picker-meta';
export * from './snippet';
export {
  AI_BEAM_PALETTES,
  AI_BEAM_SCOPES,
  DEFAULT_AI_BEAM,
  aiBeamScopeLabel,
  aiBeamShowsInput,
  aiBeamShowsMessages,
  mergeWidgetAppearanceFromApi,
  normalizeAiBeamFields,
  pickWidgetAppearancePatch,
} from '@/lib/widget-ai-beam';
export type { AiBeamConfig, AiBeamPalette, AiBeamScope } from '@/lib/widget-ai-beam';
