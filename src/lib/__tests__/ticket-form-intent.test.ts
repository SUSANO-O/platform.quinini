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

  describe('ampliación fase 2 — fraseos de reclamo explícitos adicionales', () => {
    it('problemas de acceso ("no puedo entrar/ingresar/acceder")', () => {
      expect(looksLikeTicketRequest('no puedo entrar a mi cuenta')).toBe(true);
      expect(looksLikeTicketRequest('no puedo ingresar a la plataforma')).toBe(true);
      expect(looksLikeTicketRequest('no puedo acceder desde el celular')).toBe(true);
      expect(looksLikeTicketRequest('no logro iniciar sesión')).toBe(true);
    });

    it('mensajes de error explícitos', () => {
      expect(looksLikeTicketRequest('me sale un error al pagar')).toBe(true);
      expect(looksLikeTicketRequest('me da error todo el tiempo')).toBe(true);
      expect(looksLikeTicketRequest('marca error en la app')).toBe(true);
      expect(looksLikeTicketRequest('aparece un error raro')).toBe(true);
    });

    it('persistencia del problema ("sigue sin funcionar/fallando")', () => {
      expect(looksLikeTicketRequest('sigue sin funcionar después de reiniciar')).toBe(true);
      expect(looksLikeTicketRequest('sigue fallando igual')).toBe(true);
      expect(looksLikeTicketRequest('sigue igual, no cambió nada')).toBe(true);
    });

    it('caída total del servicio', () => {
      expect(looksLikeTicketRequest('está caído el sistema')).toBe(true);
      expect(looksLikeTicketRequest('esta caido todo')).toBe(true); // sin tildes (typo común)
    });

    it('no genera falsos positivos con preguntas genéricas comunes', () => {
      expect(looksLikeTicketRequest('¿cómo puedo acceder a mis facturas?')).toBe(false);
      expect(looksLikeTicketRequest('quiero saber cómo entrar al programa de referidos')).toBe(false);
      expect(looksLikeTicketRequest('sigue siendo válida la promoción?')).toBe(false);
    });
  });

  describe('"tengo un problema" a secas (sin verbo de reporte explícito)', () => {
    it('dispara cuando "problema" no va seguido de "para" (indecisión)', () => {
      expect(looksLikeTicketRequest('tengo un problema')).toBe(true);
      expect(looksLikeTicketRequest('Tengo un problema.')).toBe(true);
      expect(looksLikeTicketRequest('hola, tengo un problema')).toBe(true);
      expect(looksLikeTicketRequest('creo que tengo un problema con la app')).toBe(true);
      expect(looksLikeTicketRequest('TENGO UN PROBLEMA URGENTE')).toBe(true);
    });

    it('NO dispara con "problema para <verbo>" (indecisión, no reporte de falla)', () => {
      expect(looksLikeTicketRequest('tengo un problema para elegir plan, cuál me recomiendan?')).toBe(false);
      expect(looksLikeTicketRequest('tengo un problema para decidir qué carro comprar')).toBe(false);
      expect(looksLikeTicketRequest('tengo un problema para saber cuál modelo me conviene')).toBe(false);
    });

    it('NO dispara si falta el "un" (evita negaciones tipo "no tengo ningún problema")', () => {
      expect(looksLikeTicketRequest('no tengo ningún problema')).toBe(false);
      expect(looksLikeTicketRequest('tengo problemas')).toBe(false);
    });
  });

  describe('descripciones directas de falla, sin verbo de reporte', () => {
    it('"no (me) funciona/sirve/anda/carga/prende/enciende"', () => {
      expect(looksLikeTicketRequest('no me funciona la app')).toBe(true);
      expect(looksLikeTicketRequest('no funciona')).toBe(true);
      expect(looksLikeTicketRequest('el dispositivo no sirve')).toBe(true);
      expect(looksLikeTicketRequest('el GPS no anda bien')).toBe(true);
      expect(looksLikeTicketRequest('no carga la batería')).toBe(true);
      expect(looksLikeTicketRequest('no prende el equipo')).toBe(true);
      expect(looksLikeTicketRequest('no enciende')).toBe(true);
    });

    it('"dejó/dejo de funcionar"', () => {
      expect(looksLikeTicketRequest('el equipo dejó de funcionar ayer')).toBe(true);
      expect(looksLikeTicketRequest('dejo de funcionar de la nada')).toBe(true);
    });

    it('"se dañó/rompió/trabó/congeló/bloqueó" (con y sin tilde)', () => {
      expect(looksLikeTicketRequest('se dañó el sensor')).toBe(true);
      expect(looksLikeTicketRequest('se daño el sensor')).toBe(true);
      expect(looksLikeTicketRequest('se me rompió la pantalla')).toBe(true);
      expect(looksLikeTicketRequest('se rompio el cable')).toBe(true);
      expect(looksLikeTicketRequest('la app se trabó y no responde')).toBe(true);
      expect(looksLikeTicketRequest('se congeló la pantalla')).toBe(true);
      expect(looksLikeTicketRequest('se bloqueó el equipo')).toBe(true);
    });

    it('sigue sin disparar con preguntas genéricas no relacionadas a fallas', () => {
      expect(looksLikeTicketRequest('cuál es el horario de atención')).toBe(false);
      expect(looksLikeTicketRequest('qué planes tienen disponibles')).toBe(false);
    });
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
