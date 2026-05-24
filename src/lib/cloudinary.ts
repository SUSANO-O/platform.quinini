/**
 * Cloudinary — almacenamiento de capturas del widget chat.
 */

import { v2 as cloudinary } from 'cloudinary';

export type CloudinaryUploadResult = {
  url: string;
  publicId: string;
  width?: number;
  height?: number;
  bytes?: number;
};

function isConfigured(): boolean {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME?.trim() &&
      process.env.CLOUDINARY_API_KEY?.trim() &&
      process.env.CLOUDINARY_API_SECRET?.trim(),
  );
}

function getFolder(): string {
  const folder = process.env.CLOUDINARY_FOLDER?.trim();
  return folder || 'botiva/widget-chat';
}

export function cloudinaryConfigured(): boolean {
  return isConfigured();
}

/**
 * Sube una imagen (data URL o URL remota) a Cloudinary.
 */
export async function uploadWidgetImage(
  source: string,
  options?: { userId?: string; sessionId?: string },
): Promise<CloudinaryUploadResult> {
  if (!isConfigured()) {
    throw new Error('CLOUDINARY_NOT_CONFIGURED');
  }

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME!.trim(),
    api_key: process.env.CLOUDINARY_API_KEY!.trim(),
    api_secret: process.env.CLOUDINARY_API_SECRET!.trim(),
    secure: true,
  });

  const subfolder = options?.userId ? options.userId.slice(0, 24) : 'anonymous';
  const folder = `${getFolder()}/${subfolder}`;

  const result = await cloudinary.uploader.upload(source, {
    folder,
    resource_type: 'image',
    overwrite: false,
    transformation: [{ quality: 'auto:good', fetch_format: 'auto' }],
    context: options?.sessionId ? { session_id: options.sessionId.slice(0, 64) } : undefined,
  });

  return {
    url: result.secure_url,
    publicId: result.public_id,
    width: result.width,
    height: result.height,
    bytes: result.bytes,
  };
}
