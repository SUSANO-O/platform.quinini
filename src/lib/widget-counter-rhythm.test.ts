import { describe, expect, it } from 'vitest';
import {
  leadCaptureToolsAllowed,
  LEAD_CAPTURE_SKILL_IDS,
  needsKnowledgeLookup,
  needsConversationMemoryRecall,
  isNumericReasoningTurn,
  needsOperationalTools,
  needsVehicleFactsEcho,
  shouldSkipHeavyWidgetPath,
  shouldUseCheapGreetingModel,
  replyDriftsFromTurn,
  stripLeadingRegreet,
  widgetReplyMaxTokens,
  widgetRuntimeDirectives,
  WIDGET_TOKEN_BUDGET,
  WIDGET_TOKEN_FLOOR,
  widgetTurnUserText,
} from './widget-counter-rhythm';

const OPEN_HISTORY = [
  { role: 'user', content: 'Hola' },
  { role: 'model', content: 'Buenas, soy el jefe de taller.' },
];

function wrapSession(user: string, extra = 'Andrés. Hija al colegio. Semáforos. sheet_repuestos.') {
  return `[CONTEXTO DE SESIÓN — incluye análisis de imágenes; tratar como hechos confirmados]\n--- CONTEXTO DE SESIÓN ---\n${extra}\n\n[MENSAJE DEL USUARIO]\n${user}`;
}

describe('widgetTurnUserText', () => {
  it('deja solo el texto del visitante', () => {
    expect(widgetTurnUserText(wrapSession('cuánto cuesta el plan Pro?'))).toBe('cuánto cuesta el plan Pro?');
  });

  it('si el recorte es solo el encabezado de sesión, no hay término de turno', () => {
    const truncated = wrapSession('Que Kia Picanto 2026 tienen?').slice(0, 120);
    expect(widgetTurnUserText(truncated)).toBe('');
  });
});

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
    expect(needsKnowledgeLookup('Qué laptops tienen en el catálogo?')).toBe(true);
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

describe('needsConversationMemoryRecall', () => {
  it('sí en recuerdos explícitos', () => {
    expect(
      needsConversationMemoryRecall(
        'Oye, cuantos kilometros te dije que tenia mi carro, y de que color era?',
      ),
    ).toBe(true);
    expect(
      needsConversationMemoryRecall(
        'Y el de color que te comente al inicio, sigue siendo el que quiero entregar?',
      ),
    ).toBe(true);
  });

  it('no en catálogo ni saludo', () => {
    expect(needsConversationMemoryRecall('cuánto cuesta el plan Pro?')).toBe(false);
    expect(needsConversationMemoryRecall('hola')).toBe(false);
  });
});

describe('isNumericReasoningTurn', () => {
  it('razona / cuanto me falta: sí', () => {
    expect(
      isNumericReasoningTurn(
        'Si el Picanto nuevo vale lo del inventario, cuanto me faltaria? Razona en voz alta.',
      ),
    ).toBe(true);
  });

  it('diferencia FAQ sin cifras: no', () => {
    expect(isNumericReasoningTurn('Cuál es la diferencia entre el plan Pro y el Starter?')).toBe(
      false,
    );
  });

  it('retoma con cifras en hilo: sí', () => {
    expect(
      isNumericReasoningTurn('Quiero una retoma', [
        { role: 'user', content: 'Tengo 42000 km' },
      ]),
    ).toBe(true);
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

  it('las enciende si piden cita, contacto o confirman una pregunta de agenda', () => {
    expect(leadCaptureToolsAllowed('agéndame una cita de peritaje', OPEN_HISTORY)).toBe(true);
    expect(leadCaptureToolsAllowed('vale gracias como me contacto?', OPEN_HISTORY)).toBe(true);
    expect(leadCaptureToolsAllowed('quiero que me contacten', OPEN_HISTORY)).toBe(true);
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
    expect(shouldSkipHeavyWidgetPath('como me contacto?', OPEN_HISTORY)).toBe(false);
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
    expect(
      needsVehicleFactsEcho(
        wrapSession(
          'Tienen el amortiguador delantero izquierdo para una Chevrolet Tracker 2017? Dime stock.',
          'Me llamo Andres. Tengo un Picanto blanco del 2019 con 42000 kilometros.',
        ),
      ),
    ).toBe(false);
  });
});

describe('replyDriftsFromTurn', () => {
  it('marca re-saludo en hilo abierto', () => {
    expect(
      replyDriftsFromTurn({
        message: 'Tienen stock del SKU ABC-1? Dime sede.',
        reply: 'Hola, Andrés. No hay disponibilidad de ese SKU.',
        history: OPEN_HISTORY,
      }),
    ).toBe(true);
  });

  it('marca emoción arrastrada en un cálculo si el mensaje no la nombra', () => {
    expect(
      replyDriftsFromTurn({
        message: 'Cuanto me faltaria para el cambio? Razona en voz alta.',
        reply: 'Entiendo tu angustia. El de lista vale 58.900.000; no tengo retoma.',
        history: OPEN_HISTORY,
      }),
    ).toBe(true);
  });

  it('no marca empatía cuando el visitante sí habla de miedo', () => {
    expect(
      replyDriftsFromTurn({
        message: 'Estoy angustiado y tengo miedo de que falle.',
        reply: 'Entiendo tu angustia. Vamos a revisarlo.',
        history: OPEN_HISTORY,
      }),
    ).toBe(false);
  });

  it('marca eco de un susto previo si este mensaje no lo nombra', () => {
    const scared = [
      ...OPEN_HISTORY,
      {
        role: 'user',
        content: 'Estoy angustiado. Se apaga y llevo a mi hija al colegio. Tengo miedo.',
      },
    ];
    expect(
      replyDriftsFromTurn({
        message: 'Agendame una cita el jueves.',
        reply: 'Te agendamos el jueves para que lleves a tu hija al colegio.',
        history: scared,
      }),
    ).toBe(true);
  });

  it('no marca si el visitante pregunta por ese episodio', () => {
    const scared = [
      ...OPEN_HISTORY,
      { role: 'user', content: 'Estoy angustiado. Llevo a mi hija al colegio y tengo miedo.' },
    ];
    expect(
      replyDriftsFromTurn({
        message: 'Recuerdas a quien llevo al colegio?',
        reply: 'Sí, a tu hija.',
        history: scared,
      }),
    ).toBe(false);
  });

  it('el bloque de sesión no cuenta como que este turno nombra el susto', () => {
    const scared = [
      ...OPEN_HISTORY,
      { role: 'user', content: 'Estoy angustiado. Llevo a mi hija al colegio y tengo miedo.' },
    ];
    expect(
      replyDriftsFromTurn({
        message: wrapSession('Agendame una cita el jueves.'),
        reply: 'Te agendamos el jueves para que lleves a tu hija al colegio.',
        history: scared,
      }),
    ).toBe(true);
  });
});

describe('stripLeadingRegreet', () => {
  it('quita un Hola a mitad de hilo y deja el resto', () => {
    expect(
      stripLeadingRegreet(
        'Hola. Estuve revisando nuestro inventario y no contamos con el amortiguador delantero.',
        OPEN_HISTORY,
      ),
    ).toBe('Estuve revisando nuestro inventario y no contamos con el amortiguador delantero.');
    expect(
      stripLeadingRegreet(
        'Hola, Andrés. He verificado en inventario y hay stock del REP-0214666.',
        OPEN_HISTORY,
      ),
    ).toBe('He verificado en inventario y hay stock del REP-0214666.');
  });

  it('no toca el saludo del primer turno ni una respuesta sin Hola', () => {
    expect(stripLeadingRegreet('Hola. ¿En qué te puedo ayudar?', [])).toBe('Hola. ¿En qué te puedo ayudar?');
    expect(
      stripLeadingRegreet(
        'Encontré el amortiguador trasero REP-0214666 en Bogotá, stock 3.',
        OPEN_HISTORY,
      ),
    ).toBe('Encontré el amortiguador trasero REP-0214666 en Bogotá, stock 3.');
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
