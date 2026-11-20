import { describe, it, expect } from 'vitest';
import { discoverLinks } from './crawl';

const BASE = 'https://negocio.com';
const HTML = `
  <a href="/nosotros">Nosotros</a>
  <a href="/productos/zapatos">Productos</a>
  <a href="https://negocio.com/precios">Precios</a>
  <a href="/contacto">Contacto</a>
  <a href="/blog/post-1">Blog</a>
  <a href="https://otra.com/externo">Externo</a>
  <a href="/imagen.png">img</a>
  <a href="/login">login</a>
  <a href="mailto:hola@negocio.com">mail</a>
  <a href="#seccion">ancla</a>
  <a href="/productos/zapatos">Productos dup</a>
`;

describe('discoverLinks', () => {
  const links = discoverLinks(HTML, BASE);

  it('solo incluye enlaces internos del mismo host', () => {
    expect(links.every((l) => l.startsWith('https://negocio.com'))).toBe(true);
    expect(links.some((l) => l.includes('otra.com'))).toBe(false);
  });

  it('descarta assets, login, mailto y anclas', () => {
    expect(links.some((l) => l.includes('imagen.png'))).toBe(false);
    expect(links.some((l) => l.includes('/login'))).toBe(false);
    expect(links.some((l) => l.includes('mailto'))).toBe(false);
    expect(links.some((l) => l.includes('#'))).toBe(false);
  });

  it('deduplica', () => {
    const zapatos = links.filter((l) => l.includes('/productos/zapatos'));
    expect(zapatos.length).toBe(1);
  });

  it('prioriza páginas de alto valor (nosotros/productos/precios/contacto) sobre el blog', () => {
    const idxPrecios = links.findIndex((l) => l.includes('/precios'));
    const idxBlog = links.findIndex((l) => l.includes('/blog'));
    expect(idxPrecios).toBeGreaterThanOrEqual(0);
    expect(idxPrecios).toBeLessThan(idxBlog);
  });
});
