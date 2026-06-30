import sharp from 'sharp';

interface Variant {
  name: 'thumbnail' | 'medium' | 'full';
  width: number | null;
  height: number | null;
  fit: 'cover' | 'inside' | null;
}

export interface ProcessedVariant {
  variant: string;
  url: string;
  public_id: string;
}

export const VARIANTS: Variant[] = [
  { name: 'thumbnail', width: 200, height: 200, fit: 'cover' },
  { name: 'medium',    width: 800, height: 800, fit: 'inside' },
  { name: 'full',      width: null, height: null, fit: null },
];

export async function processVariant(buffer: Buffer, variant: Variant): Promise<Buffer> {
  let pipeline = sharp(buffer)
  .rotate();

  if (variant.width && variant.height && variant.fit) {
    pipeline = pipeline.resize(variant.width, variant.height, {
      fit: variant.fit,
      withoutEnlargement: true,
    });
  }

  return pipeline.webp({ quality: 85 }).toBuffer();
}