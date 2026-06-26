import sharp from "sharp";

export const VARIANTS = [
  { name: 'thumbnail', width: 200, height: 200, fit: 'cover' },
  { name: 'medium',    width: 800, height: 800, fit: 'inside' },
  { name: 'full',      width: null, height: null },
];

export async function processVariant(buffer, variant) {
  let pipeline = sharp(buffer)
    .rotate()
    .withMetadata(false);

  if (variant.width) {
    pipeline = pipeline.resize(variant.width, variant.height, {
      fit: variant.fit,
      withoutEnlargement: true,
    });
  }

  return pipeline.webp({ quality: 85 }).toBuffer();
}