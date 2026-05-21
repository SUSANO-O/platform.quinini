import { describe, expect, it } from 'vitest';
import {
  createDefaultPipelineConfig,
  normalizePipelineConfig,
  shouldRunPipeline,
  swapPipelineSteps,
  validatePipelineConfig,
} from '../widget-pipeline-ui';

const ORCH = ['aaaaaaaaaaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbbbbbbbbbb'];

describe('widget-pipeline-ui', () => {
  it('shouldRunPipeline mixed requiere señales de contenido y creativo', () => {
    expect(
      shouldRunPipeline('banner 1200x628 con autos familiares del catálogo', { mode: 'mixed' }),
    ).toBe(true);
    expect(shouldRunPipeline('solo banner por favor', { mode: 'mixed' })).toBe(false);
    expect(shouldRunPipeline('precio del plan basic', { mode: 'mixed' })).toBe(false);
  });

  it('shouldRunPipeline always ejecuta con cualquier mensaje', () => {
    expect(shouldRunPipeline('hola', { mode: 'always' })).toBe(true);
  });

  it('createDefaultPipelineConfig asigna dos agentes distintos', () => {
    const cfg = createDefaultPipelineConfig(ORCH, (id) =>
      id === ORCH[0]
        ? { name: 'Vendedor Autos', description: 'catálogo y ventas' }
        : { name: 'Diseño Banner', description: 'imagen y creativo' },
    );
    expect(cfg.steps).toHaveLength(2);
    expect(cfg.steps[0].role).toBe('content');
    expect(cfg.steps[1].role).toBe('creative');
    expect(cfg.steps[0].agentId).not.toBe(cfg.steps[1].agentId);
  });

  it('normalizePipelineConfig rechaza agentes fuera de la grilla', () => {
    const cfg = createDefaultPipelineConfig(ORCH, () => ({ name: 'A' }));
    const bad = { ...cfg, steps: [{ ...cfg.steps[0], agentId: 'cccccccccccccccccccccccc' }, cfg.steps[1]] };
    expect(normalizePipelineConfig(bad, ORCH)).toBeNull();
  });

  it('validatePipelineConfig exige dos pasos válidos', () => {
    const cfg = createDefaultPipelineConfig(ORCH, (id) =>
      id === ORCH[0]
        ? { name: 'Ventas', description: 'producto' }
        : { name: 'Creativo', description: 'banner imagen' },
    );
    const result = validatePipelineConfig(cfg, ORCH, () => ({ name: 'x' }));
    expect(result.ok).toBe(true);
  });

  it('swapPipelineSteps intercambia roles', () => {
    const cfg = createDefaultPipelineConfig(ORCH, () => ({ name: 'A' }));
    const swapped = swapPipelineSteps(cfg);
    expect(swapped.steps[0].role).toBe('creative');
    expect(swapped.steps[1].role).toBe('content');
  });
});
