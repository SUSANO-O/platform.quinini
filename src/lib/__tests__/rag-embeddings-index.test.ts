import { describe, expect, it } from 'vitest';
import { diffRagSourcesForIndex, ragSourceFileName } from '../rag-embeddings-index';

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

describe('diffRagSourcesForIndex', () => {
  it('indexa una fuente de texto nueva y no toca las que ya estaban', () => {
    const prev = [{ name: 'manual.pdf', content: 'ya indexado' }];
    const next = [
      { name: 'manual.pdf', content: 'ya indexado' },
      { name: 'horario', content: 'Abrimos de 9 a 18.' },
    ];
    const d = diffRagSourcesForIndex(prev, next);
    expect(d.toIndex).toEqual([{ name: 'horario', content: 'Abrimos de 9 a 18.' }]);
    expect(d.toDelete).toEqual([]);
  });

  it('reindexa si cambia el texto y borra si desaparece la fuente', () => {
    const prev = [
      { name: 'horario', content: 'Abrimos de 9 a 18.' },
      { name: 'obsoleto', content: 'dato viejo' },
    ];
    const next = [{ name: 'horario', content: 'Abrimos de 10 a 20.' }];
    const d = diffRagSourcesForIndex(prev, next);
    expect(d.toIndex).toEqual([{ name: 'horario', content: 'Abrimos de 10 a 20.' }]);
    expect(d.toDelete).toEqual(['obsoleto.txt']);
  });

  it('ignora filas vacias que el panel crea al pulsar Agregar texto', () => {
    const d = diffRagSourcesForIndex([], [{ name: '', content: '   ' }]);
    expect(d.toIndex).toEqual([]);
  });
});
