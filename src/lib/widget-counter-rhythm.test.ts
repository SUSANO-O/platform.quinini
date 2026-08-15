import { describe, expect, it } from 'vitest';
import {
  leadCaptureToolsAllowed,
  LEAD_CAPTURE_SKILL_IDS,
  needsKnowledgeLookup,
  needsOperationalTools,
  needsVehicleFactsEcho,
  shouldSkipHeavyWidgetPath,
  shouldUseCheapGreetingModel,
  widgetReplyMaxTokens,
  widgetRuntimeDirectives,
  WIDGET_TOKEN_BUDGET,
  WIDGET_TOKEN_FLOOR,
} from './widget-counter-rhythm';

const OPEN_HISTORY = [
  { role: 'user', content: 'Hola' },
  { role: 'model', content: 'Buenas, soy el jefe de taller.' },
];

describe('needsKnowledgeLookup', () => {
  it('enciende RAG / documentos en inventario y precio', () => {
    expect(
      needsKnowledgeLookup(
        'Que Kia Picanto 2026 tienen en el inventario premium de MatIAs Auto Sales en Bogota?',
      ),
    ).toBe(true);
    expect(
      needsKnowledgeLookup(
        'Si el Picanto nuevo del inventario vale lo que ustedes manejan, y el mio es 2019, mas o menos cuanto me faltaria para el cambio?',
      ),
    ).toBe(true);
    expect(needsKnowledgeLookup('cuánto cuesta el Picanto 2026?')).toBe(true);
  });

  it('no enciende RAG en memoria, emoción ni hechos del visitante', () => {
    expect(
      needsKnowledgeLookup('Oye, cuantos kilometros te dije que tenia mi carro, y de que color era?'),
    ).toBe(false);
    expect(
      needsKnowledgeLookup(
        'La verdad estoy muy angustiado. El carro se me apaga en los semaforos y tengo que llevar a mi hija al colegio.',
      ),
    ).toBe(false);
    expect(
      needsKnowledgeLookup(
        'Me llamo Andres. Tengo un Picanto blanco del 2019 con 42000 kilometros y quiero cambiarlo por algo mas nuevo.',
      ),
    ).toBe(false);
    expect(needsKnowledgeLookup('Y el de color que te comente al inicio, sigue siendo el que quiero entregar?')).toBe(
      false,
    );
  });
});

describe('needsOperationalTools', () => {
  it('enciende calendario / envío', () => {
    expect(needsOperationalTools('agéndame una cita el jueves')).toBe(true);
    expect(needsOperationalTools('envíame un correo con la cotización')).toBe(true);
  });

  it('un recuerdo no es una tool', () => {
    expect(needsOperationalTools('cuantos kilometros te dije')).toBe(false);
  });
});

describe('leadCaptureToolsAllowed', () => {
  it('apaga HubSpot y sales_closer en inventario, recuerdo y emoción', () => {
    expect(
      leadCaptureToolsAllowed('Que Kia Picanto 2026 tienen en el inventario premium en Bogota?', OPEN_HISTORY),
    ).toBe(false);
    expect(leadCaptureToolsAllowed('Oye, cuantos kilometros te dije?', OPEN_HISTORY)).toBe(false);
    expect(LEAD_CAPTURE_SKILL_IDS).toContain('sales_closer');
  });

  it('las enciende si piden cita o confirman una pregunta de agenda', () => {
    expect(leadCaptureToolsAllowed('agéndame una cita de peritaje', OPEN_HISTORY)).toBe(true);
    const asked = [{ role: 'model', content: '¿Agendo el peritaje para el jueves?' }];
    expect(leadCaptureToolsAllowed('ok', asked)).toBe(true);
  });
});

describe('shouldSkipHeavyWidgetPath', () => {
  it('salta MCP/RAG/skills en saludos y continuidad', () => {
    expect(shouldSkipHeavyWidgetPath('hola', [])).toBe(true);
    expect(
      shouldSkipHeavyWidgetPath('Oye, cuantos kilometros te dije que tenia mi carro, y de que color era?', OPEN_HISTORY),
    ).toBe(true);
  });

  it('no salta inventario ni cita', () => {
    expect(
      shouldSkipHeavyWidgetPath('Que Kia Picanto 2026 tienen en el inventario premium en Bogota?', OPEN_HISTORY),
    ).toBe(false);
    expect(shouldSkipHeavyWidgetPath('agéndame una cita de peritaje', OPEN_HISTORY)).toBe(false);
  });

  it('un ok tras una pregunta del bot no se acelera', () => {
    const asked = [{ role: 'model', content: '¿Agendo el peritaje para el jueves?' }];
    expect(shouldSkipHeavyWidgetPath('ok', asked)).toBe(false);
    expect(shouldSkipHeavyWidgetPath('sí', asked)).toBe(false);
    expect(shouldSkipHeavyWidgetPath('vale', asked)).toBe(false);
  });
});

describe('shouldUseCheapGreetingModel', () => {
  it('usa lite solo en el primer hola', () => {
    expect(shouldUseCheapGreetingModel('hola', [])).toBe(true);
    expect(shouldUseCheapGreetingModel('gracias', OPEN_HISTORY)).toBe(false);
  });
});

describe('needsVehicleFactsEcho', () => {
  it('solo A2: presentación de auto con color', () => {
    const msg =
      'Me llamo Andres. Tengo un Picanto blanco del 2019 con 42000 kilometros y quiero cambiarlo por algo mas nuevo.';
    expect(needsVehicleFactsEcho(msg)).toBe(true);
    expect(widgetRuntimeDirectives(msg, OPEN_HISTORY).some((l) => /color/i.test(l))).toBe(true);
  });

  it('no aplica a otros ejes del guion', () => {
    expect(needsVehicleFactsEcho('Oye, cuantos kilometros te dije que tenia mi carro, y de que color era?')).toBe(
      false,
    );
    expect(needsVehicleFactsEcho('Que Kia Picanto 2026 tienen en el inventario premium en Bogota?')).toBe(false);
  });
});

describe('widgetReplyMaxTokens', () => {
  it('deja margen para una respuesta natural, no un discurso', () => {
    expect(widgetReplyMaxTokens({ message: 'hola', history: [] })).toBe(WIDGET_TOKEN_BUDGET.coldGreeting);
    expect(
      widgetReplyMaxTokens({
        message: 'Oye, cuantos kilometros te dije que tenia mi carro?',
        history: OPEN_HISTORY,
      }),
    ).toBe(WIDGET_TOKEN_BUDGET.conversational);
    expect(
      widgetReplyMaxTokens({
        message: 'Que Kia Picanto 2026 tienen en el inventario premium en Bogota?',
        history: OPEN_HISTORY,
      }),
    ).toBe(WIDGET_TOKEN_BUDGET.full);
    expect(WIDGET_TOKEN_BUDGET.full).toBe(4800);
    expect(WIDGET_TOKEN_BUDGET.conversational).toBe(2800);
  });

  it('presupuestos siempre por encima del piso anti-regresión 720', () => {
    expect(WIDGET_TOKEN_BUDGET.conversational).toBeGreaterThanOrEqual(WIDGET_TOKEN_FLOOR.conversational);
    expect(WIDGET_TOKEN_BUDGET.full).toBeGreaterThanOrEqual(WIDGET_TOKEN_FLOOR.full);
    expect(WIDGET_TOKEN_FLOOR.conversational).toBeGreaterThan(720);
  });

  it('no deja bajar bajo el piso aunque agentMax en Mongo sea 720 (16:51 humano 57)', () => {
    expect(
      widgetReplyMaxTokens({
        message: 'Me llamo Andres. Tengo un Picanto blanco del 2019 con 42000 km.',
        history: OPEN_HISTORY,
        agentMax: 720,
      }),
    ).toBe(WIDGET_TOKEN_FLOOR.conversational);
    expect(
      widgetReplyMaxTokens({
        message: 'Que Kia Picanto 2026 tienen en el inventario premium en Bogota?',
        history: OPEN_HISTORY,
        agentMax: 720,
      }),
    ).toBe(WIDGET_TOKEN_FLOOR.full);
  });

  it('respeta agentMax solo si está por encima del piso', () => {
    expect(widgetReplyMaxTokens({ message: 'hola', history: [], agentMax: 2000 })).toBe(
      WIDGET_TOKEN_BUDGET.coldGreeting,
    );
    expect(
      widgetReplyMaxTokens({
        message: 'Oye, cuantos kilometros te dije?',
        history: OPEN_HISTORY,
        agentMax: 1400,
      }),
    ).toBe(1400);
  });
});
