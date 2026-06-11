/** Mensaje si la URL no puede cargarse en el navegador (p. ej. file://). */
export function browserImageUrlError(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (v.startsWith('file://')) {
    return 'No se puede usar una ruta local (file://). Sube la imagen con el botón o pega una URL https.';
  }
  if (v.startsWith('blob:')) {
    return 'Esta URL temporal ya no es válida. Vuelve a subir la imagen.';
  }
  if (v.startsWith('data:image/') || v.startsWith('https://') || v.startsWith('http://')) {
    return null;
  }
  return 'URL no válida. Usa https://… o sube un archivo desde tu dispositivo.';
}

export function isBrowserLoadableImageUrl(raw: string): boolean {
  return browserImageUrlError(raw) === null;
}
