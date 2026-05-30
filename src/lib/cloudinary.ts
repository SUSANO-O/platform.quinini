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

export type CloudinaryResourceType = 'image' | 'video' | 'raw';

export type AttachmentUploadResult = CloudinaryUploadResult & {
  resourceType: CloudinaryResourceType;
  format?: string;
  duration?: number;
  originalFilename?: string;
};

function configureCloudinary(): void {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME!.trim(),
    api_key: process.env.CLOUDINARY_API_KEY!.trim(),
    api_secret: process.env.CLOUDINARY_API_SECRET!.trim(),
    secure: true,
  });
}

/**
 * Sube un adjunto del agente (imagen, video o archivo «raw» como pdf/docx) a
 * Cloudinary desde un Buffer. Mantiene el nombre original como public_id sufijo
 * para que la descarga conserve un nombre legible.
 */
export async function uploadAgentAttachment(
  buffer: Buffer,
  options: {
    resourceType: CloudinaryResourceType;
    userId?: string;
    sessionId?: string;
    filename?: string;
    kind?: 'agent' | 'visitor';
  },
): Promise<AttachmentUploadResult> {
  if (!isConfigured()) {
    throw new Error('CLOUDINARY_NOT_CONFIGURED');
  }
  configureCloudinary();

  const subfolder = options.userId ? options.userId.slice(0, 24) : 'anonymous';
  const folder = `${getFolder()}/${options.kind || 'agent'}/${subfolder}`;

  const result = await new Promise<Record<string, unknown>>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: options.resourceType,
        // 'raw'/'video' deben usar el nombre como public_id para descarga legible.
        use_filename: true,
        unique_filename: true,
        overwrite: false,
        context: options.sessionId ? { session_id: options.sessionId.slice(0, 64) } : undefined,
      },
      (err, res) => {
        if (err || !res) reject(err || new Error('UPLOAD_FAILED'));
        else resolve(res as unknown as Record<string, unknown>);
      },
    );
    stream.end(buffer);
  });

  return {
    url: String(result.secure_url || ''),
    publicId: String(result.public_id || ''),
    resourceType: options.resourceType,
    width: typeof result.width === 'number' ? result.width : undefined,
    height: typeof result.height === 'number' ? result.height : undefined,
    bytes: typeof result.bytes === 'number' ? result.bytes : undefined,
    format: typeof result.format === 'string' ? result.format : undefined,
    duration: typeof result.duration === 'number' ? result.duration : undefined,
    originalFilename: typeof result.original_filename === 'string' ? result.original_filename : undefined,
  };
}

/**
 * Borra un asset de Cloudinary por publicId. resource_type debe coincidir con
 * el usado al subir (image/video/raw). Idempotente: no lanza si ya no existe.
 */
export async function deleteCloudinaryAsset(
  publicId: string,
  resourceType: CloudinaryResourceType = 'image',
): Promise<boolean> {
  if (!isConfigured() || !publicId) return false;
  configureCloudinary();
  try {
    const res = await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    return res?.result === 'ok' || res?.result === 'not found';
  } catch {
    return false;
  }
}
