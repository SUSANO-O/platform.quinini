'use client';

import type { CSSProperties } from 'react';
import { AvatarEditor } from '@/components/ui/AvatarEditor';
import { Sparkles } from '@/components/ui/icons';
import { BRAND } from '@/lib/brand-colors';
import type { AiBeamScope, ThinkingIconId, WidgetConfig, WidgetConfigPatch } from '@/lib/widget-builder';
import {
  THINKING_ICON_OPTIONS,
  WIDGET_BUILDER_UI_ACCENT,
  aiBeamScopeLabel,
} from '@/lib/widget-builder';
import { WidgetBuilderAppearancePreview } from '@/components/dashboard/widget-builder/appearance-preview';
import { ThinkingIconMark } from '@/components/dashboard/widget-builder/thinking-icon-mark';
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
  WidgetBuilderSwitch,
  WidgetBuilderThemeToggle,
  widgetPositionLabel,
} from '../ui';

const COLOR_PRESETS = [
  { label: 'BotIvA', value: BRAND.primary },
  { label: 'Teal', value: '#0d9488' },
  { label: 'Índigo', value: '#6366f1' },
  { label: 'Violeta', value: '#7c3aed' },
  { label: 'Rosa', value: '#db2777' },
  { label: 'Naranja', value: '#ea580c' },
] as const;

const RADIUS_PRESETS = ['0px', '8px', '12px', '16px', '20px', '24px'] as const;

const AI_BEAM_SCOPE_OPTIONS: { id: AiBeamScope; label: string; hint: string }[] = [
  { id: 'off', label: 'Off', hint: 'Sin borde mágico' },
  { id: 'input', label: 'Input', hint: 'Solo barra de mensaje' },
  { id: 'messages', label: 'Mensajes', hint: 'Solo tarjeta “pensando”' },
  { id: 'both', label: 'Ambos', hint: 'Input + mensajes' },
];

const AI_BEAM_PALETTE_OPTIONS = [
  { id: 'rainbow' as const, label: 'Arcoíris' },
  { id: 'brand' as const, label: 'Color marca' },
  { id: 'custom' as const, label: 'Personalizado' },
];

const VISUAL_TOGGLES = [
  {
    key: 'imageUploadEnabled' as const,
    label: 'Adjuntar archivos',
    hint: 'Botón 📎 en el input',
  },
  {
    key: 'micEnabled' as const,
    label: 'Micrófono',
    hint: 'Dictado por voz (STT)',
  },
  {
    key: 'voiceEnabled' as const,
    label: 'Lectura en voz alta',
    hint: 'Altavoz en la cabecera (TTS)',
  },
  {
    key: 'autoOpen' as const,
    label: 'Abrir al cargar',
    hint: 'El chat se abre solo al visitar la página',
  },
  {
    key: 'fabDismissible' as const,
    label: 'Cerrar launcher',
    hint: 'Muestra la X para ocultar el botón flotante',
  },
];

export function WidgetBuilderAppearanceStep({
  cfg,
  onChange,
  autoSave = false,
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
    | 'imageUploadEnabled'
    | 'micEnabled'
    | 'voiceEnabled'
    | 'autoOpen'
    | 'fabDismissible'
    | 'policyEnabled'
    | 'policyLinkLabel'
    | 'aiBeamScope'
    | 'aiBeamPalette'
    | 'aiBeamColor'
    | 'aiBeamBlur'
    | 'aiBeamSpeed'
    | 'aiBeamIntensity'
    | 'scrollHaloEnabled'
    | 'scrollHaloColorMode'
    | 'scrollHaloColor'
    | 'scrollHaloHeight'
    | 'scrollHaloOpacity'
    | 'scrollHaloBlur'
    | 'scrollHaloTop'
    | 'scrollHaloBottom'
    | 'thinkingIconEnabled'
    | 'thinkingIcon'
  >;
  onChange: (patch: WidgetConfigPatch) => void;
  autoSave?: boolean;
}) {
  const aiBeamOn = cfg.aiBeamScope !== 'off';

  return (
    <div className="widget-builder-appearance">
      <div className="widget-builder-appearance__form">
        <WidgetBuilderSections>
          <WidgetBuilderSection
            tourId="widget-builder-branding"
            title="Marca visual"
            description="Color de acento, paleta rápida y tema claro u oscuro."
            bodyClassName="widget-builder-section__body--split"
          >
            <div className="widget-builder-field widget-builder-field--full">
              <WidgetBuilderColorField
                id="wb-color"
                label="Color principal"
                value={cfg.color}
                onChange={(color) => onChange({ color })}
              />
              <div className="widget-builder-color-presets" role="group" aria-label="Colores sugeridos">
                {COLOR_PRESETS.map((preset) => {
                  const active = cfg.color.toLowerCase() === preset.value.toLowerCase();
                  return (
                    <button
                      key={preset.value}
                      type="button"
                      title={preset.label}
                      aria-label={preset.label}
                      aria-pressed={active}
                      className={`widget-builder-color-presets__btn${active ? ' is-active' : ''}`}
                      style={{ ['--wb-swatch' as string]: preset.value } as CSSProperties}
                      onClick={() => onChange({ color: preset.value })}
                    />
                  );
                })}
              </div>
            </div>
            <WidgetBuilderThemeToggle
              value={cfg.theme}
              accentColor={cfg.color}
              onChange={(theme) => onChange({ theme })}
            />
          </WidgetBuilderSection>

          <WidgetBuilderSection
            tourId="widget-builder-ai-beam"
            title="Modo AI (borde mágico)"
            description={
              autoSave
                ? 'Borde animado en el input y/o en la tarjeta de “pensando”. Los cambios se guardan al editar un widget existente.'
                : 'Borde animado en el input y/o en la tarjeta de “pensando”. Personaliza color, difuminado y velocidad.'
            }
            bodyClassName="widget-builder-section__body--grid"
          >
            <div className="widget-builder-field widget-builder-field--full widget-builder-ai-beam-head">
              <div className="widget-builder-ai-beam-head__text">
                <p className="widget-builder-visual-toggles__label">
                  <Sparkles size={14} aria-hidden className="inline-block align-[-2px] mr-1" />
                  Activar borde mágico
                </p>
                <p className="widget-builder-visual-toggles__hint">
                  Actual: {aiBeamScopeLabel(cfg.aiBeamScope)}
                  {aiBeamOn && cfg.aiBeamPalette !== 'rainbow'
                    ? ` · ${cfg.aiBeamPalette === 'brand' ? 'color marca' : 'color custom'}`
                    : ''}
                </p>
              </div>
              <WidgetBuilderSwitch
                checked={aiBeamOn}
                accentColor={WIDGET_BUILDER_UI_ACCENT}
                onChange={(checked) => onChange({ aiBeamScope: checked ? 'both' : 'off' })}
                ariaLabel="Activar borde mágico modo AI"
              />
            </div>

            {aiBeamOn ? (
              <>
                <WidgetBuilderField className="widget-builder-field--full">
                  <WidgetBuilderLabel>Dónde mostrar</WidgetBuilderLabel>
                  <div className="widget-builder-ai-beam-scope" role="group" aria-label="Alcance del borde mágico">
                    {AI_BEAM_SCOPE_OPTIONS.filter((o) => o.id !== 'off').map((opt) => {
                      const active = cfg.aiBeamScope === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          title={opt.hint}
                          aria-pressed={active}
                          className={`widget-builder-ai-beam-scope__btn${active ? ' is-active' : ''}`}
                          style={active ? ({ ['--wb-accent' as string]: cfg.color } as CSSProperties) : undefined}
                          onClick={() => onChange({ aiBeamScope: opt.id })}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </WidgetBuilderField>

                <WidgetBuilderField className="widget-builder-field--full">
                  <WidgetBuilderLabel>Color del borde</WidgetBuilderLabel>
                  <div className="widget-builder-ai-beam-scope" role="group" aria-label="Paleta del borde">
                    {AI_BEAM_PALETTE_OPTIONS.map((opt) => {
                      const active = cfg.aiBeamPalette === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          aria-pressed={active}
                          className={`widget-builder-ai-beam-scope__btn${active ? ' is-active' : ''}`}
                          style={active ? ({ ['--wb-accent' as string]: cfg.color } as CSSProperties) : undefined}
                          onClick={() =>
                            opt.id === 'custom'
                              ? onChange({
                                  aiBeamPalette: 'custom',
                                  aiBeamColor: cfg.aiBeamColor?.trim() || cfg.color,
                                })
                              : onChange({ aiBeamPalette: opt.id })
                          }
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </WidgetBuilderField>

                {cfg.aiBeamPalette === 'custom' ? (
                  <WidgetBuilderField className="widget-builder-field--full">
                    <WidgetBuilderColorField
                      id="wb-ai-beam-color"
                      label="Color del borde"
                      value={cfg.aiBeamColor || cfg.color}
                      onChange={(aiBeamColor) => onChange({ aiBeamColor })}
                    />
                  </WidgetBuilderField>
                ) : null}

                <WidgetBuilderRangeField
                  id="wb-ai-beam-blur"
                  label={`Difuminación (${cfg.aiBeamBlur}px)`}
                  value={cfg.aiBeamBlur}
                  min={0}
                  max={20}
                  step={1}
                  accentColor={cfg.color}
                  hint="Halo suave alrededor del borde."
                  onChange={(aiBeamBlur) => onChange({ aiBeamBlur })}
                />

                <WidgetBuilderRangeField
                  id="wb-ai-beam-speed"
                  label={`Velocidad animación (${cfg.aiBeamSpeed}s)`}
                  value={cfg.aiBeamSpeed}
                  min={2}
                  max={16}
                  step={0.5}
                  accentColor={cfg.color}
                  hint="Segundos por vuelta completa del gradiente."
                  onChange={(aiBeamSpeed) => onChange({ aiBeamSpeed })}
                />

                <WidgetBuilderRangeField
                  id="wb-ai-beam-intensity"
                  label={`Intensidad (${cfg.aiBeamIntensity}%)`}
                  value={cfg.aiBeamIntensity}
                  min={10}
                  max={100}
                  step={5}
                  accentColor={cfg.color}
                  hint="Opacidad del borde y del brillo."
                  onChange={(aiBeamIntensity) => onChange({ aiBeamIntensity })}
                />
              </>
            ) : null}
          </WidgetBuilderSection>

          <WidgetBuilderSection
            tourId="widget-builder-thinking-icon"
            title="Icono de pensando"
            description="El icono a la derecha de la etapa (Cubo, destello, orbe…). Puedes apagarlo o cambiarlo."
            bodyClassName="widget-builder-section__body--grid"
          >
            <div className="widget-builder-field widget-builder-field--full widget-builder-ai-beam-head">
              <div className="widget-builder-ai-beam-head__text">
                <p className="widget-builder-visual-toggles__label">Mostrar icono</p>
                <p className="widget-builder-visual-toggles__hint">
                  {cfg.thinkingIconEnabled ? 'Visible en la tarjeta de espera' : 'Oculto'}
                </p>
              </div>
              <WidgetBuilderSwitch
                checked={cfg.thinkingIconEnabled}
                accentColor={WIDGET_BUILDER_UI_ACCENT}
                onChange={(checked) => onChange({ thinkingIconEnabled: checked })}
                ariaLabel="Mostrar icono de pensando"
              />
            </div>
            <WidgetBuilderField className="widget-builder-field--full">
              <WidgetBuilderLabel>Estilo</WidgetBuilderLabel>
              <div className="widget-builder-thinking-icons" role="group" aria-label="Estilo del icono de pensando">
                {THINKING_ICON_OPTIONS.map((opt) => {
                  const active = cfg.thinkingIcon === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      title={opt.hint}
                      aria-pressed={active}
                      disabled={!cfg.thinkingIconEnabled}
                      className={`widget-builder-thinking-icons__btn${active ? ' is-active' : ''}`}
                      style={
                        {
                          ['--wb-accent' as string]: cfg.color,
                        } as CSSProperties
                      }
                      onClick={() => onChange({ thinkingIcon: opt.id as ThinkingIconId })}
                    >
                      <ThinkingIconMark kind={opt.id} />
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </WidgetBuilderField>
          </WidgetBuilderSection>

          <WidgetBuilderSection
            tourId="widget-builder-chat-texts"
            title="Textos del chat"
            description="Cabecera, bienvenida y mensaje del botón flotante."
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
            title="Avatar y forma del panel"
            description="Imagen del asistente, esquinas redondeadas y tamaño del launcher."
          >
            <WidgetBuilderField className="widget-builder-field--full">
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

            <WidgetBuilderField className="widget-builder-field--full">
              <WidgetBuilderLabel htmlFor="wb-radius">Radio de esquinas</WidgetBuilderLabel>
              <div className="widget-builder-radius-presets" role="group" aria-label="Presets de esquinas">
                {RADIUS_PRESETS.map((preset) => {
                  const active = cfg.borderRadius === preset;
                  return (
                    <button
                      key={preset}
                      type="button"
                      className={`widget-builder-radius-presets__btn${active ? ' is-active' : ''}`}
                      aria-pressed={active}
                      style={active ? ({ '--wb-accent': cfg.color } as CSSProperties) : undefined}
                      onClick={() => onChange({ borderRadius: preset })}
                    >
                      {preset}
                    </button>
                  );
                })}
              </div>
              <WidgetBuilderInput
                id="wb-radius"
                value={cfg.borderRadius}
                onChange={(e) => onChange({ borderRadius: e.target.value })}
                placeholder="16px"
                className="mt-2"
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

          <WidgetBuilderSection
            tourId="widget-builder-visual-controls"
            title="Controles visibles"
            description="Qué botones ve el visitante en el chat y en el launcher."
          >
            <div className="widget-builder-visual-toggles">
              {VISUAL_TOGGLES.map((toggle) => (
                <div key={toggle.key} className="widget-builder-visual-toggles__row">
                  <div className="min-w-0 flex-1">
                    <p className="widget-builder-visual-toggles__label">{toggle.label}</p>
                    <p className="widget-builder-visual-toggles__hint">{toggle.hint}</p>
                  </div>
                  <WidgetBuilderSwitch
                    checked={Boolean(cfg[toggle.key])}
                    accentColor={WIDGET_BUILDER_UI_ACCENT}
                    onChange={(checked) => onChange({ [toggle.key]: checked })}
                    ariaLabel={toggle.label}
                  />
                </div>
              ))}
            </div>
          </WidgetBuilderSection>
        </WidgetBuilderSections>
      </div>

      <aside className="widget-builder-appearance__preview" aria-label="Vista previa del widget">
        <WidgetBuilderAppearancePreview cfg={cfg} />
      </aside>
    </div>
  );
}
