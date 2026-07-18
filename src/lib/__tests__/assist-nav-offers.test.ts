/**
 * Tests assist-nav block parsing.
 */
import { describe, expect, it } from 'vitest';
import { finalizeAssistChatReply } from '@/lib/assist-chat-reply';
import {
  extractAssistNavOffer,
  inferAssistNavOffer,
  isAllowedAssistNavPath,
  resolveAssistNavOffer,
} from '@/lib/assist-nav-offers';

describe('assist-nav-offers', () => {
  it('parses and strips nav block', () => {
    const raw = `¿Quieres que te lleve a Agentes?

\`\`\`assist-nav
{"path":"/dashboard/agents","onDecline":"Ve a Dashboard → Agentes.","afterNavigate":"Aquí ves tus agentes."}
\`\`\``;
    const { reply, navOffer } = extractAssistNavOffer(raw);
    expect(reply).toContain('¿Quieres');
    expect(navOffer?.path).toBe('/dashboard/agents');
    expect(navOffer?.onDecline).toContain('Dashboard');
  });

  it('allows dashboard paths', () => {
    expect(isAllowedAssistNavPath('/dashboard/agents')).toBe(true);
    expect(isAllowedAssistNavPath('/es/dashboard/inbox')).toBe(true);
    expect(isAllowedAssistNavPath('/admin')).toBe(false);
  });

  it('prioriza mensaje del usuario sobre bloque assist-nav del modelo', () => {
    const raw = `Para widgets ve a Dashboard → Widgets.

\`\`\`assist-nav
{"path":"/dashboard/widgets","prompt":"¿Quieres que te lleve a la sección de Widgets?","onDecline":"Ve a Widgets.","afterNavigate":"Aquí puedes ver tus widgets."}
\`\`\``;
    const { reply, navOffer } = resolveAssistNavOffer(raw, {
      userMessage: 'como creo un widget',
      pagePath: '/dashboard/widgets',
    });
    expect(navOffer?.path).toBe('/dashboard/widget-builder');
    expect(reply).toContain('Widget builder');
    expect(reply).not.toMatch(/sección de Widgets/i);
    expect(navOffer?.prompt).toBeUndefined();
  });

  it('infiere agente con typo agentes plural', () => {
    const offer = inferAssistNavOffer('', { userMessage: 'como creo un agentes' });
    expect(offer?.path).toBe('/dashboard/agents/new');
  });

  it('prioriza mensaje del usuario sobre respuesta del modelo', () => {
    const offer = inferAssistNavOffer(
      'Para configurar un widget ve a Dashboard → Widgets o Widget builder. Allí eliges el agente conectado.',
      { userMessage: 'como creo un widget' },
    );
    expect(offer?.path).toBe('/dashboard/widget-builder');
    expect(offer?.prompt).toContain('Widget builder');
  });

  it('corrige pregunta errónea del modelo al inferir nav', () => {
    const raw =
      'Para configurar un widget ve a Dashboard → Widget builder.\n\n¿Quieres que te lleve a Nuevo agente?';
    const { reply, navOffer } = finalizeAssistChatReply(raw, true, {
      userMessage: 'como creo un widget',
    });
    expect(navOffer?.path).toBe('/dashboard/widget-builder');
    expect(reply).toContain('Widget builder');
    expect(reply).not.toContain('Nuevo agente');
  });

  it('infiere widget builder al crear widget (no Nuevo agente)', () => {
    const offer = inferAssistNavOffer(
      'Para configurar un widget ve a Dashboard → Widgets o Widget builder.',
      { userMessage: 'como creo un widget' },
    );
    expect(offer?.path).toBe('/dashboard/widget-builder');
    expect(offer?.prompt).toContain('Widget builder');
  });

  it('infiere nav al crear agente sin bloque del modelo', () => {
    const offer = inferAssistNavOffer(
      'Para crear un agente ve a Dashboard → Agentes → Nuevo agente.',
      { userMessage: 'como creo un agente' },
    );
    expect(offer?.path).toBe('/dashboard/agents/new');
    expect(offer?.onDecline).toContain('Nuevo agente');
  });

  it('en Mis widgets y crear widget → Widget builder (no quedarse en widgets)', () => {
    const offer = inferAssistNavOffer('Ve a Dashboard → Widgets.', {
      userMessage: 'como creo un widget',
      pagePath: '/dashboard/widgets',
    });
    expect(offer?.path).toBe('/dashboard/widget-builder');
    expect(offer?.prompt).toContain('Widget builder');
  });

  it('no ofrece nav si ya estás en la pantalla destino', () => {
    const offer = inferAssistNavOffer('Aquí ves tus widgets.', {
      userMessage: 'mis widgets',
      pagePath: '/dashboard/widgets',
    });
    expect(offer).toBeNull();
  });

  it('elimina pregunta de nav si ya estás en destino', () => {
    const raw =
      'Aquí gestionas tus widgets.\n\n¿Quieres que te lleve a la sección de Widgets?';
    const { reply, navOffer } = finalizeAssistChatReply(raw, true, {
      userMessage: 'como creo un widget',
      pagePath: '/dashboard/widgets',
    });
    expect(navOffer?.path).toBe('/dashboard/widget-builder');
    expect(reply).not.toMatch(/sección de Widgets/i);
  });

  it('infiere ajustes de suscripción con ancla de facturación', () => {
    const offer = inferAssistNavOffer(
      '¿Te gustaría que te guíe a la sección de Suscripción y cuenta?',
      { userMessage: '', pagePath: '/dashboard' },
    );
    expect(offer?.path).toBe('/dashboard/settings#settings-billing');
    expect(offer?.onDecline).toContain('Ajustes');
  });

  it('allows settings hash paths', () => {
    expect(isAllowedAssistNavPath('/dashboard/settings#settings-billing')).toBe(true);
  });

  it('finalizeAssistChatReply añade navOffer y pregunta', () => {
    const raw =
      'Para crear un agente ve a Dashboard → Agentes → Nuevo agente. Allí pon nombre, prompt y modelo.';
    const { reply, navOffer } = finalizeAssistChatReply(raw, true, {
      userMessage: 'como creo un agente',
    });
    expect(navOffer?.path).toBe('/dashboard/agents/new');
    expect(reply).toContain('¿Quieres que te lleve');
  });
});
