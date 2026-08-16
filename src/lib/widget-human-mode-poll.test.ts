import { describe, expect, it } from 'vitest';
import {
  decideWidgetHumanModePollAction,
  shouldJoinHumanInbox,
  WIDGET_BOT_RESUMED_MESSAGE,
} from './widget-human-mode-poll';

describe('decideWidgetHumanModePollAction', () => {
  it('al devolver el chat al bot (humanMode false, inbox abierta) sale del modo humano', () => {
    expect(
      decideWidgetHumanModePollAction({ humanMode: false, resolved: false }),
    ).toBe('bot_resumed');
    expect(WIDGET_BOT_RESUMED_MESSAGE).toMatch(/asistente retomó/i);
  });

  it('si la solicitud se resolvió, cierra con despedida (no solo reactivar bot)', () => {
    expect(
      decideWidgetHumanModePollAction({ humanMode: false, resolved: true }),
    ).toBe('resolved');
  });

  it('mientras un humano atiende, el poll sigue activo', () => {
    expect(
      decideWidgetHumanModePollAction({ humanMode: true, resolved: false }),
    ).toBe('keep');
  });

  it('sin payload no corta el poll', () => {
    expect(decideWidgetHumanModePollAction(null)).toBe('keep');
    expect(decideWidgetHumanModePollAction(undefined)).toBe('keep');
  });

  it('unirse al inbox si el humano tomó el chat y sigue abierto', () => {
    expect(shouldJoinHumanInbox({ humanMode: true, resolved: false })).toBe(true);
    expect(shouldJoinHumanInbox({ humanMode: true, resolved: true })).toBe(false);
    expect(shouldJoinHumanInbox({ humanMode: false, resolved: false })).toBe(false);
    expect(shouldJoinHumanInbox(null)).toBe(false);
  });
});
