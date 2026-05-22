import { USER_AVATAR_MAX_DATA_URL_LENGTH } from '@/lib/user-profile';

/** Geometría compartida entre preview y exportación (cover + pan + zoom). */
export function computeAvatarCropRect(
  naturalWidth: number,
  naturalHeight: number,
  viewportSize: number,
  zoom: number,
  offsetX: number,
  offsetY: number,
) {
  const aspect = naturalWidth / naturalHeight;
  const baseW = aspect >= 1 ? viewportSize * aspect : viewportSize;
  const baseH = aspect >= 1 ? viewportSize : viewportSize / aspect;
  const width = baseW * zoom;
  const height = baseH * zoom;
  return {
    width,
    height,
    left: (viewportSize - width) / 2 + offsetX,
    top: (viewportSize - height) / 2 + offsetY,
  };
}

/** Exporta un canvas a JPEG data URL, reduciendo calidad y/o tamaño hasta caber en el límite. */
export function compressCanvasToDataUrl(
  canvas: HTMLCanvasElement,
  maxLength: number = USER_AVATAR_MAX_DATA_URL_LENGTH,
): string {
  const encode = (target: HTMLCanvasElement, quality: number) =>
    target.toDataURL('image/jpeg', quality);

  let quality = 0.92;
  let dataUrl = encode(canvas, quality);
  while (dataUrl.length > maxLength && quality > 0.35) {
    quality = Math.round((quality - 0.07) * 100) / 100;
    dataUrl = encode(canvas, quality);
  }
  if (dataUrl.length <= maxLength) return dataUrl;

  let scale = 0.85;
  while (scale >= 0.4) {
    const w = Math.max(96, Math.round(canvas.width * scale));
    const h = Math.max(96, Math.round(canvas.height * scale));
    const tmp = document.createElement('canvas');
    tmp.width = w;
    tmp.height = h;
    const ctx = tmp.getContext('2d');
    if (!ctx) break;
    ctx.drawImage(canvas, 0, 0, w, h);

    quality = 0.88;
    dataUrl = encode(tmp, quality);
    while (dataUrl.length > maxLength && quality > 0.35) {
      quality = Math.round((quality - 0.07) * 100) / 100;
      dataUrl = encode(tmp, quality);
    }
    if (dataUrl.length <= maxLength) return dataUrl;
    scale -= 0.15;
  }

  throw new Error('No se pudo optimizar la imagen. Prueba recortando más o usando otra foto.');
}
