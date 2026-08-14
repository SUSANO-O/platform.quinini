import { describe, expect, it } from 'vitest';
import { ragSourceFileName } from '../rag-embeddings-index';

describe('ragSourceFileName', () => {
  /** El motor elige el parser por la extension, y por ahi busca al borrar. */
  it('añade extension cuando el nombre no la trae', () => {
    expect(ragSourceFileName('politica de garantia')).toBe('politica de garantia.txt');
  });

  it('respeta la extension existente', () => {
    expect(ragSourceFileName('manual.pdf')).toBe('manual.pdf');
    expect(ragSourceFileName('datos.json')).toBe('datos.json');
  });

  /** Un punto en mitad del nombre no es una extension. */
  it('no confunde un punto interior con extension', () => {
    expect(ragSourceFileName('version 2.1 del contrato')).toBe('version 2.1 del contrato.txt');
  });

  it('cae al nombre por defecto cuando viene vacio', () => {
    expect(ragSourceFileName('')).toBe('documento.txt');
    expect(ragSourceFileName('   ')).toBe('documento.txt');
  });
});
