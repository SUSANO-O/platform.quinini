import { describe, expect, it } from 'vitest';
import { messageReferencesPriorImage } from './widget-chat-vision-context';

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

  it('no cubre alusiones sin nombrar el adjunto (limite conocido)', () => {
    expect(messageReferencesPriorImage('¿cuánto costaba?')).toBe(false);
  });
});
