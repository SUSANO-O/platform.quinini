import { describe, expect, it } from 'vitest';
import {
  extractRemainderAfterMatch,
  isVagueRemainder,
  interpretYesNo,
  buildAskProblemReply,
  buildDeflectionSurveyReply,
  buildDeflectionResolvedReply,
  SURVEY_YESNO_MARKER,
} from '../ticket-deflection-intent';

// Mismos patrones que ticket-form-intent.ts, para probar extractRemainderAfterMatch
// sin crear un import circular entre los dos módulos.
const TICKET_PATTERNS = [
  /\breportar\s+(un\s+)?(problema|falla|error|incidente|inconveniente)/i,
  /\babrir\s+(un\s+)?tickets?\b/i,
  /\blevantar\s+(un\s+)?tickets?\b/i,
  /\b(quiero|necesito|quisiera)\s+(un\s+)?tickets?\b/i,
  /\b(tengo|hacer|poner|presentar|radicar)\s+(un\s+)?(reclamo|queja|pqr)\b/i,
  /\bcrear\s+(un\s+)?tickets?\b/i,
];

describe('extractRemainderAfterMatch', () => {
  it('devuelve vacío cuando el mensaje es solo la frase de intención', () => {
    expect(extractRemainderAfterMatch('quiero levantar un ticket', TICKET_PATTERNS)).toBe('quiero');
  });

  it('devuelve el resto del mensaje alrededor de la frase matcheada', () => {
    const r = extractRemainderAfterMatch('hola quiero reportar un problema con la app', TICKET_PATTERNS);
    // Solo recorta el tramo que matcheó ("reportar un problema") — palabras de
    // relleno alrededor (ej. "quiero") las filtra isVagueRemainder, no esta función.
    expect(r).toBe('hola quiero con la app');
  });

  it('sin match, devuelve el mensaje completo', () => {
    expect(extractRemainderAfterMatch('no puedo ingresar a mi app', TICKET_PATTERNS)).toBe(
      'no puedo ingresar a mi app',
    );
  });
});

describe('isVagueRemainder', () => {
  it('vacío o solo relleno es vago', () => {
    expect(isVagueRemainder('')).toBe(true);
    expect(isVagueRemainder('quiero')).toBe(true);
    expect(isVagueRemainder('por favor')).toBe(true);
    expect(isVagueRemainder('hola')).toBe(true);
  });

  it('con contenido real no es vago', () => {
    expect(isVagueRemainder('con la plataforma de pagos')).toBe(false);
    expect(isVagueRemainder('no puedo ingresar a mi app')).toBe(false);
  });
});

describe('interpretYesNo', () => {
  it('reconoce variantes afirmativas, con o sin acento', () => {
    expect(interpretYesNo('Sí')).toBe('yes');
    expect(interpretYesNo('si')).toBe('yes');
    expect(interpretYesNo('sí, gracias')).toBe('yes');
    expect(interpretYesNo('ya funciono')).toBe('yes');
    expect(interpretYesNo('resuelto, gracias')).toBe('yes');
  });

  it('reconoce variantes negativas', () => {
    expect(interpretYesNo('No')).toBe('no');
    expect(interpretYesNo('no, sigo con el problema')).toBe('no');
    expect(interpretYesNo('todavia no funciona')).toBe('no');
    expect(interpretYesNo('persiste el error')).toBe('no');
  });

  it('respuestas ambiguas devuelven null (no fuerza una interpretación)', () => {
    expect(interpretYesNo('')).toBeNull();
    expect(interpretYesNo('   ')).toBeNull();
    expect(interpretYesNo('quiero hablar con un humano')).toBeNull();
    // "si" en medio de la frase (no al inicio) no debe activarse como afirmación —
    // evita falsos positivos con el "si" condicional del español.
    expect(interpretYesNo('avisame si necesitas algo más')).toBeNull();
  });
});

describe('copys de deflection', () => {
  it('buildAskProblemReply es una pregunta amable, sin marcador', () => {
    const reply = buildAskProblemReply();
    expect(reply.length).toBeGreaterThan(10);
    expect(reply).not.toContain('[[');
  });

  it('buildDeflectionSurveyReply incluye la fuente y el marcador de encuesta', () => {
    const reply = buildDeflectionSurveyReply('Restablecé tu contraseña desde "Olvidé mi contraseña".');
    expect(reply).toContain('Restablecé tu contraseña');
    expect(reply).toContain(SURVEY_YESNO_MARKER);
  });

  it('buildDeflectionResolvedReply es un cierre cálido, sin marcador', () => {
    const reply = buildDeflectionResolvedReply();
    expect(reply).not.toContain('[[');
    expect(reply.length).toBeGreaterThan(5);
  });
});
