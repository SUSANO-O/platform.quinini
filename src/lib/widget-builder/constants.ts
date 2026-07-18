import { Fingerprint, Paintbrush, Send, Settings2 } from 'lucide-react';
import { BRAND } from '@/lib/brand-colors';

/** Acento de la UI del builder (no del widget embebido en sitios externos). */
export const WIDGET_BUILDER_UI_ACCENT = BRAND.primary;

export const WIDGET_AGENT_ICONS = ['🤖', '🧠', '💬', '✨', '📎', '🔮', '🛡️', '🌱', '📊'] as const;

export const WIDGET_POSITIONS = [
  ['top-left', 'top', 'top-right'],
  ['left', 'center', 'right'],
  ['bottom-left', 'bottom', 'bottom-right'],
] as const;

export const WIDGET_POSITION_LABELS: Record<string, string> = {
  'top-left': 'Arriba izquierda',
  top: 'Arriba centro',
  'top-right': 'Arriba derecha',
  left: 'Centro izquierda',
  center: 'Centro',
  right: 'Centro derecha',
  'bottom-left': 'Abajo izquierda',
  bottom: 'Abajo centro',
  'bottom-right': 'Abajo derecha',
};

export const WIDGET_WIZARD_STEPS = [
  { id: 'identity', label: 'Identidad', icon: Fingerprint },
  { id: 'appearance', label: 'Apariencia', icon: Paintbrush },
  { id: 'behavior', label: 'Comportamiento', icon: Settings2 },
  { id: 'publish', label: 'Publicar', icon: Send },
] as const;

export type WidgetWizardStepId = (typeof WIDGET_WIZARD_STEPS)[number]['id'];

export const WIDGET_STEP_TIPS: Record<WidgetWizardStepId, string> = {
  identity:
    'Elige un nombre claro y un agente activo. El token de integración se genera al publicar.',
  appearance:
    'El color y la posición del botón definen la primera impresión en tu sitio.',
  behavior:
    'Ajusta mensajes, escalación y privacidad antes de exponer el widget.',
  publish: 'Copia el snippet y pégalo antes de </body> en tu web.',
};

export const WIDGET_STEP_DESCRIPTIONS: Record<WidgetWizardStepId, string> = {
  identity: 'Nombre del widget y agente de IA que responderá en el chat.',
  appearance: 'Personaliza colores, textos, avatar y dónde aparece el botón en la página.',
  behavior: 'WhatsApp, escalación, privacidad, accesos rápidos y opciones del embed.',
  publish: 'Instala el widget en tu sitio con el fragmento de código.',
};
