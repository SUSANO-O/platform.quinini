import { describe, expect, it } from 'vitest';
import {
  looksLikeTicketRequest,
  hasContactEmailInHistory,
  shouldForceTicketForm,
} from '../ticket-form-intent';

describe('looksLikeTicketRequest', () => {
  it('detecta pedidos claros de reportar un problema o abrir un ticket', () => {
    expect(looksLikeTicketRequest('Quiero reportar un problema con la plataforma')).toBe(true);
    expect(looksLikeTicketRequest('necesito abrir un ticket')).toBe(true);
    expect(looksLikeTicketRequest('quiero un ticket de soporte')).toBe(true);
    expect(looksLikeTicketRequest('tengo un reclamo sobre el servicio')).toBe(true);
    expect(looksLikeTicketRequest('Reportar un error en la app')).toBe(true);
  });

  it('no dispara con preguntas genéricas que mencionan "problema" sin intención de reporte', () => {
    // Caso que motivó ser conservador: no es un ticket de soporte real.
    expect(looksLikeTicketRequest('tengo un problema para elegir plan, cuál me recomiendan?')).toBe(false);
    expect(looksLikeTicketRequest('cuál es el horario de atención')).toBe(false);
    expect(looksLikeTicketRequest('hola, qué tal')).toBe(false);
  });

  it('mensaje vacío nunca dispara', () => {
    expect(looksLikeTicketRequest('')).toBe(false);
    expect(looksLikeTicketRequest('   ')).toBe(false);
  });
});

describe('hasContactEmailInHistory', () => {
  it('encuentra un email en un turno de usuario anterior', () => {
    const history = [
      { role: 'assistant', content: 'Hola, soy Nairito' },
      { role: 'user', content: 'Soy Juan, mi correo es juan@test.com' },
    ];
    expect(hasContactEmailInHistory(history)).toBe(true);
  });

  it('ignora emails que aparecen solo en turnos del bot', () => {
    const history = [
      { role: 'assistant', content: 'Escribinos a soporte@tribugps.com' },
      { role: 'user', content: 'ok gracias' },
    ];
    expect(hasContactEmailInHistory(history)).toBe(false);
  });

  it('sin historial o vacío, no encuentra nada', () => {
    expect(hasContactEmailInHistory([])).toBe(false);
    expect(hasContactEmailInHistory(null)).toBe(false);
    expect(hasContactEmailInHistory(undefined)).toBe(false);
  });
});

describe('shouldForceTicketForm', () => {
  it('fuerza el formulario: pide ticket, sin email en historial, agente con capacidad', () => {
    const result = shouldForceTicketForm({
      message: 'Quiero reportar un problema con la plataforma',
      history: [],
      hasTicketCapability: true,
    });
    expect(result).toBe(true);
  });

  it('NO fuerza el formulario si el agente no tiene la capacidad de tickets', () => {
    const result = shouldForceTicketForm({
      message: 'Quiero reportar un problema con la plataforma',
      history: [],
      hasTicketCapability: false,
    });
    expect(result).toBe(false);
  });

  it('NO fuerza el formulario si ya hay un email en el historial (dejar que el LLM cree el ticket directo)', () => {
    const result = shouldForceTicketForm({
      message: 'Quiero reportar un problema con la plataforma',
      history: [{ role: 'user', content: 'soy juan, juan@test.com' }],
      hasTicketCapability: true,
    });
    expect(result).toBe(false);
  });

  it('NO fuerza el formulario si el usuario ya puso el email en el mismo mensaje', () => {
    const result = shouldForceTicketForm({
      message: 'Quiero reportar un problema, mi correo es juan@test.com',
      history: [],
      hasTicketCapability: true,
    });
    expect(result).toBe(false);
  });

  it('NO fuerza el formulario si el mensaje no suena a pedido de ticket', () => {
    const result = shouldForceTicketForm({
      message: 'cuál es el horario de atención',
      history: [],
      hasTicketCapability: true,
    });
    expect(result).toBe(false);
  });
});
