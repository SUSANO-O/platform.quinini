import { describe, expect, it } from 'vitest';
import {
  applyVisionContextToParsedBody,
  buildUserPromptWithSessionContext,
  buildVisionSessionBlock,
  isVisionAnalysisFailure,
  mergeVisionContextIntoBody,
  VISION_SYSTEM_INSTRUCTIONS,
} from '@/lib/widget-chat-vision-context';
import type { WidgetImageEnrichment } from '@/lib/widget-chat-images';

const sampleEnrichment: WidgetImageEnrichment = {
  images: [{ url: 'https://res.cloudinary.com/demo/image.png' }],
  analyses: [{ url: 'https://res.cloudinary.com/demo/image.png', text: 'Toggle Vision activada. Modelo Gemini 2.5 Flash.' }],
  displayMessage: '¿Qué ves en la captura?',
};

describe('widget-chat-vision-context', () => {
  it('detecta fallos de análisis automático', () => {
    expect(isVisionAnalysisFailure('[No se pudo analizar la imagen.]')).toBe(true);
    expect(isVisionAnalysisFailure('Toggle Vision activada')).toBe(false);
  });

  it('mantiene el mensaje del usuario y mueve OCR a sessionContextBlock', () => {
    const parsed: Record<string, unknown> = { message: 'placeholder' };
    applyVisionContextToParsedBody(parsed, sampleEnrichment, 'Eres un asesor comercial.');

    expect(parsed.message).toBe('¿Qué ves en la captura?');
    expect(String(parsed.sessionContextBlock)).toContain('Contenido detectado');
    expect(String(parsed.systemPromptOverride)).toContain(VISION_SYSTEM_INSTRUCTIONS);
    expect(String(parsed.systemPromptOverride)).toContain('Eres un asesor comercial.');
    expect(parsed.visionEnriched).toBe(true);
  });

  it('fusiona con sessionContextBlock existente', () => {
    const body = JSON.stringify({
      message: 'hola',
      sessionContextBlock: 'Facts previos: SUV',
    });
    const merged = mergeVisionContextIntoBody(body, sampleEnrichment, 'Prompt base');
    const parsed = JSON.parse(merged) as { sessionContextBlock?: string };
    expect(parsed.sessionContextBlock).toContain('ANÁLISIS DE IMAGEN');
    expect(parsed.sessionContextBlock).toContain('Facts previos: SUV');
  });

  it('buildVisionSessionBlock incluye análisis', () => {
    const block = buildVisionSessionBlock(sampleEnrichment);
    expect(block).toContain('Gemini 2.5 Flash');
  });

  it('buildUserPromptWithSessionContext antepone contexto', () => {
    const prompt = buildUserPromptWithSessionContext('hola', 'OCR: auto rojo');
    expect(prompt).toContain('OCR: auto rojo');
    expect(prompt).toContain('[MENSAJE DEL USUARIO]');
    expect(prompt).toContain('hola');
  });
});
