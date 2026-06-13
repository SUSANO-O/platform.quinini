'use client';

import { AvatarEditor } from '@/components/ui/AvatarEditor';
import type { WidgetConfig, WidgetConfigPatch } from '@/lib/widget-builder';
import {
  WidgetBuilderColorField,
  WidgetBuilderField,
  WidgetBuilderHint,
  WidgetBuilderInput,
  WidgetBuilderLabel,
  WidgetBuilderPositionGrid,
  WidgetBuilderRangeField,
  WidgetBuilderSection,
  WidgetBuilderSections,
  WidgetBuilderThemeToggle,
  widgetPositionLabel,
} from '../ui';

export function WidgetBuilderAppearanceStep({
  cfg,
  onChange,
}: {
  cfg: Pick<
    WidgetConfig,
    | 'color'
    | 'theme'
    | 'title'
    | 'subtitle'
    | 'welcome'
    | 'fabHint'
    | 'avatar'
    | 'fabAvatarSize'
    | 'borderRadius'
    | 'position'
  >;
  onChange: (patch: WidgetConfigPatch) => void;
}) {
  return (
    <WidgetBuilderSections>
      <WidgetBuilderSection
        tourId="widget-builder-branding"
        title="Marca visual"
        description="Color de acento y tema claro u oscuro del chat."
        bodyClassName="widget-builder-section__body--split"
      >
        <WidgetBuilderColorField
          id="wb-color"
          label="Color principal"
          value={cfg.color}
          onChange={(color) => onChange({ color })}
        />
        <WidgetBuilderThemeToggle
          value={cfg.theme}
          accentColor={cfg.color}
          onChange={(theme) => onChange({ theme })}
        />
      </WidgetBuilderSection>

      <WidgetBuilderSection
        tourId="widget-builder-chat-texts"
        title="Textos del chat"
        description="Lo que verá el visitante en la cabecera y al abrir el chat."
        bodyClassName="widget-builder-section__body--grid"
      >
        <WidgetBuilderField>
          <WidgetBuilderLabel htmlFor="wb-title">Título</WidgetBuilderLabel>
          <WidgetBuilderInput
            id="wb-title"
            value={cfg.title}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder="BotIvA Assistant"
          />
        </WidgetBuilderField>
        <WidgetBuilderField>
          <WidgetBuilderLabel htmlFor="wb-subtitle">Subtítulo</WidgetBuilderLabel>
          <WidgetBuilderInput
            id="wb-subtitle"
            value={cfg.subtitle}
            onChange={(e) => onChange({ subtitle: e.target.value })}
            placeholder="Siempre aquí para ayudarte"
          />
        </WidgetBuilderField>
        <WidgetBuilderField className="widget-builder-field--full">
          <WidgetBuilderLabel htmlFor="wb-welcome">Mensaje de bienvenida</WidgetBuilderLabel>
          <WidgetBuilderInput
            id="wb-welcome"
            value={cfg.welcome}
            onChange={(e) => onChange({ welcome: e.target.value })}
            placeholder="¡Hola! ¿En qué puedo ayudarte?"
          />
        </WidgetBuilderField>
        <WidgetBuilderField className="widget-builder-field--full">
          <WidgetBuilderLabel htmlFor="wb-fab-hint">Hint del botón flotante</WidgetBuilderLabel>
          <WidgetBuilderInput
            id="wb-fab-hint"
            value={cfg.fabHint}
            onChange={(e) => onChange({ fabHint: e.target.value })}
            placeholder="¿Necesitas ayuda?"
          />
        </WidgetBuilderField>
      </WidgetBuilderSection>

      <WidgetBuilderSection
        tourId="widget-builder-look"
        title="Avatar y forma"
        description="Imagen del asistente, tamaño del botón y esquinas del panel."
      >
        <WidgetBuilderField>
          <WidgetBuilderLabel htmlFor="wb-avatar">URL de avatar / orbe</WidgetBuilderLabel>
          <WidgetBuilderInput
            id="wb-avatar"
            value={cfg.avatar}
            onChange={(e) => onChange({ avatar: e.target.value })}
            placeholder="https://..."
          />
          {cfg.avatar.trim().startsWith('file://') ? (
            <WidgetBuilderHint variant="error">
              Las rutas locales (file://) no funcionan en la web. Usa «Generar AI», el editor o una URL https.
            </WidgetBuilderHint>
          ) : null}
          <AvatarEditor
            currentUrl={cfg.avatar}
            agentContext={{ name: cfg.title, purpose: cfg.title }}
            onResult={(url) => onChange({ avatar: url })}
          />
        </WidgetBuilderField>

        {cfg.avatar.trim() ? (
          <WidgetBuilderRangeField
            id="wb-fab-size"
            label={`Tamaño del avatar en el botón (${cfg.fabAvatarSize}px)`}
            value={cfg.fabAvatarSize}
            min={56}
            max={120}
            step={4}
            accentColor={cfg.color}
            hint="Solo aplica con imagen. Sin avatar se muestra el orbe animado."
            onChange={(fabAvatarSize) => onChange({ fabAvatarSize })}
          />
        ) : null}

        <WidgetBuilderField className="widget-builder-field--narrow">
          <WidgetBuilderLabel htmlFor="wb-radius">Radio de esquinas</WidgetBuilderLabel>
          <WidgetBuilderInput
            id="wb-radius"
            value={cfg.borderRadius}
            onChange={(e) => onChange({ borderRadius: e.target.value })}
            placeholder="16px"
          />
        </WidgetBuilderField>
      </WidgetBuilderSection>

      <WidgetBuilderSection
        tourId="widget-builder-position"
        title="Ubicación en pantalla"
        description={
          <>
            Dónde aparece el botón flotante. Actual:{' '}
            <strong>{widgetPositionLabel(cfg.position)}</strong>
          </>
        }
      >
        <WidgetBuilderPositionGrid
          value={cfg.position}
          accentColor={cfg.color}
          onChange={(position) => onChange({ position })}
        />
      </WidgetBuilderSection>
    </WidgetBuilderSections>
  );
}
