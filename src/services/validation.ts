import { fileTypeFromBuffer } from 'file-type';
import { Request } from 'express';
import type { FileFilterCallback } from 'multer';

const ALLOWED_MIMETYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function multerFilter(
  req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback
) {
  if (!ALLOWED_MIMETYPES.has(file.mimetype)) {
    cb(new Error('Invalid file type'));
    return;
  }
  cb(null, true);
}
export async function validateMagicBytes(buffer: Buffer): Promise<void> {
  const type = await fileTypeFromBuffer(buffer);

  if (!type || !ALLOWED_MIMETYPES.has(type.mime)) {
    throw new Error(`Invalid file contents: expected image, got ${type?.mime ?? 'unknown'}`);
  }
}