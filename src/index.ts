import express from 'express';
import multer from 'multer';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { Readable } from 'stream';
import { processVariant, VARIANTS, ProcessedVariant } from './services/sharp.js';
import 'dotenv/config';
import prisma from './db.js';
import { multerFilter, validateMagicBytes } from './services/validation.js';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcrypt';
import { signToken, requireAuth } from './services/auth.js';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const app = express();
app.use(express.json());
const memStorage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: multerFilter,
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const owner = await prisma.owner.findFirst({ where: { email } });
    if (!owner) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, owner.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    res.json({ token: signToken(owner.id) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

function uploadToCloudinary(
  buffer: Buffer,
  folder: string,
  publicId: string
): Promise<UploadApiResponse> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, public_id: publicId, resource_type: 'image' },
      (err, result) => {
        if (err || !result) return reject(err ?? new Error('No result from Cloudinary'));
        resolve(result);
      }
    );
    Readable.from(buffer).pipe(stream);
  });
}

async function processAndUpload(
  file: Express.Multer.File
): Promise<{ baseId: string; variants: ProcessedVariant[] }> {
  const baseId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const variants = await Promise.all(
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

  return { baseId, variants };
}

app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.get('/api/images', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const [images, total] = await Promise.all([
      prisma.image.findMany({
        skip,
        take: limit,
        include: { variants: true },
        orderBy: { uploadedAt: 'desc' },
      }),
      prisma.image.count(),
    ]);

    res.json({
      data: images,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: 'Failed to fetch images', detail: message });
  }
});

app.delete('/api/images/:id', requireAuth, async (req, res) => {
  console.log('Deleting id:', req.params.id);
  try {
    const image = await prisma.image.findFirst({
      where: { id: req.params.id as string },
      include: { variants: true },
    });

    if (!image) return res.status(404).json({ error: 'Image not found' });

    // Delete all variants from Cloudinary first
    await Promise.all(
      image.variants.map(v =>
        cloudinary.uploader.destroy(v.publicId, { resource_type: 'image' })
      )
    );

    // Then delete from DB (cascades to variants automatically)
    await prisma.image.delete({ where: { id: req.params.id as string } });

    res.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: 'Failed to delete image', detail: message });
  }
});


const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: { error: 'Too many uploads, please try again later' },
});

app.post('/api/upload', uploadLimiter, requireAuth, memStorage.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided' });

    await validateMagicBytes(req.file.buffer);

    const { baseId, variants } = await processAndUpload(req.file);

    const image = await prisma.image.create({
      data: {
        baseId,
        filename: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        variants: {
          create: variants.map(v => ({
            name: v.variant,
            url: v.url,
            publicId: v.public_id,
          })),
        },
      },
      include: { variants: true },
    });

    res.json(image);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    const status = message.startsWith('Invalid') ? 400 : 500;
    res.status(status).json({ error: message });
  }
});

app.use((err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message });
  }
  if (err) return res.status(400).json({ error: 'Invalid file type' });
  next();
});

const port = process.env.PORT ?? 3000;
app.listen(port, () => console.log(`Listening on PORT ${port}`));