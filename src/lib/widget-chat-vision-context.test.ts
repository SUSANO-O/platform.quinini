import { describe, expect, it } from 'vitest';
import {
  messageReferencesPriorImage,
  PRIOR_IMAGE_RECENCY_MS,
  shouldUsePriorImage,
} from './widget-chat-vision-context';

describe('messageReferencesPriorImage', () => {
  it('reconoce las formas que ya se soportaban', () => {
    for (const msg of [
      '¿Qué decía la imagen?',
      'el de la imagen',
      'esta imagen no se ve bien',
      '¿qué pone en la foto?',
      'lo de la foto',
      'el vehículo de la imagen',
      'en la captura sale un error',
      'de la captura, ¿qué precio ves?',
    ]) {
      expect(messageReferencesPriorImage(msg), msg).toBe(true);
    }
  });

  it('reconoce plurales, sinónimos y acentos ausentes', () => {
    for (const msg of [
      '¿y las imágenes que ves?',
      'revisa esas imagenes',
      'mira esa fotografía',
      '¿qué hay en el pantallazo?',
      'analiza ese screenshot',
      'esas fotos que ves',
    ]) {
      expect(messageReferencesPriorImage(msg), msg).toBe(true);
    }
  });

  it('reconoce alusiones por la accion del usuario', () => {
    for (const msg of [
      '¿qué número tenía lo que te mandé?',
      'lo que te envié antes, ¿cuánto era?',
      'revisa lo que te pasé',
      '¿qué viste en el archivo que adjunté?',
      'dime el total de lo que viste',
      'what was in the image I sent?',
    ]) {
      expect(messageReferencesPriorImage(msg), msg).toBe(true);
    }
  });

  it('reconoce ingles', () => {
    for (const msg of ['what does the screenshot say?', 'check that picture', 'my photo shows an error']) {
      expect(messageReferencesPriorImage(msg), msg).toBe(true);
    }
  });

  it('no se dispara pidiendo una imagen nueva', () => {
    for (const msg of ['mándame una foto del producto', 'quiero unas fotos del catálogo']) {
      expect(messageReferencesPriorImage(msg), msg).toBe(false);
    }
  });

  it('no se dispara con mensajes normales', () => {
    for (const msg of [
      'hola',
      '¿cuál es el precio?',
      'quiero comprar un repuesto',
      'necesito una fotocopia',
      'me lo imaginé distinto',
      '',
    ]) {
      expect(messageReferencesPriorImage(msg), msg).toBe(false);
    }
  });

  it('no cubre alusiones sin nombrar el adjunto (de eso se ocupa la recencia)', () => {
    expect(messageReferencesPriorImage('¿cuánto costaba?')).toBe(false);
  });
});

describe('shouldUsePriorImage', () => {
  const now = new Date('2026-08-14T12:00:00Z');
  const haceUnMinuto = new Date(now.getTime() - 60_000);
  const haceUnaHora = new Date(now.getTime() - 60 * 60_000);

  it('una mencion explicita vale por vieja que sea la imagen', () => {
    expect(
      shouldUsePriorImage({
        message: '¿qué decía la imagen?',
        analyzedAt: haceUnaHora,
        trivial: false,
        now,
      }),
    ).toBe(true);
  });

  it('vale incluso sin marca de tiempo (sesiones anteriores al cambio)', () => {
    expect(
      shouldUsePriorImage({ message: '¿qué decía la foto?', analyzedAt: null, trivial: false, now }),
    ).toBe(true);
  });

  it('un seguimiento sin mencionarla vale si la imagen es de hace un momento', () => {
    expect(
      shouldUsePriorImage({
        message: '¿cuánto costaba?',
        analyzedAt: haceUnMinuto,
        trivial: false,
        now,
      }),
    ).toBe(true);
  });

  it('el mismo seguimiento ya no vale si la imagen es vieja', () => {
    expect(
      shouldUsePriorImage({
        message: '¿cuánto costaba?',
        analyzedAt: haceUnaHora,
        trivial: false,
        now,
      }),
    ).toBe(false);
  });

  it('justo en el limite todavia vale', () => {
    const alLimite = new Date(now.getTime() - PRIOR_IMAGE_RECENCY_MS);
    expect(
      shouldUsePriorImage({ message: '¿y el precio?', analyzedAt: alLimite, trivial: false, now }),
    ).toBe(true);
    expect(
      shouldUsePriorImage({
        message: '¿y el precio?',
        analyzedAt: new Date(alLimite.getTime() - 1),
        trivial: false,
        now,
      }),
    ).toBe(false);
  });

  it('un saludo no arrastra la imagen aunque sea reciente', () => {
    expect(
      shouldUsePriorImage({ message: 'hola', analyzedAt: haceUnMinuto, trivial: true, now }),
    ).toBe(false);
  });

  it('sin imagen en la sesion no hay nada que traer', () => {
    expect(
      shouldUsePriorImage({ message: '¿cuánto costaba?', analyzedAt: null, trivial: false, now }),
    ).toBe(false);
  });

  it('ignora marcas de tiempo en el futuro', () => {
    const futuro = new Date(now.getTime() + 60_000);
    expect(
      shouldUsePriorImage({ message: '¿cuánto costaba?', analyzedAt: futuro, trivial: false, now }),
    ).toBe(false);
  });

  it('un mensaje vacio nunca la trae', () => {
    expect(
      shouldUsePriorImage({ message: '   ', analyzedAt: haceUnMinuto, trivial: false, now }),
    ).toBe(false);
  });
});
