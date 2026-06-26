import express from 'express';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';
import { processVariant, VARIANTS } from './services/sharp.js';
import 'dotenv/config';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const app = express();
const memStorage = multer({ storage: multer.memoryStorage() });

function uploadToCloudinary(buffer, folder, publicId) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, public_id: publicId, resource_type: 'image' },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    Readable.from(buffer).pipe(stream);
  });
}

async function processAndUpload(file) {
  const baseId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const results = await Promise.all(
    VARIANTS.map(async (variant) => {
      const processed = await processVariant(file.buffer, variant);
      const result = await uploadToCloudinary(
        processed,
        `portfolio/${variant.name}`,
        `${baseId}-${variant.name}`
      );
      return { variant: variant.name, url: result.secure_url, public_id: result.public_id };
    })
  );

  return { baseId, variants: results };
}

app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.post('/api/upload', memStorage.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided' });
    const { baseId, variants } = await processAndUpload(req.file);
    res.json({ id: baseId, variants });
  } catch (err) {
    res.status(500).json({ error: 'Upload failed', detail: err.message });
  }
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message });
  }
  if (err) return res.status(400).json({ error: 'Invalid file type' });
  next();
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Listening on PORT ${port}`));