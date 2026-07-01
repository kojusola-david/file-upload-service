# Artist Portfolio — File Upload Backend

A Node.js/TypeScript backend for uploading, processing, and managing images for an artist portfolio. Uploads are processed through Sharp to generate multiple size variants, stored on Cloudinary, and tracked in PostgreSQL via Prisma 7. Protected by JWT authentication with file validation at both the Multer and magic bytes level.

---

## Stack

- **Runtime**: Node.js with TypeScript (`tsx` for development)
- **Framework**: Express
- **Image processing**: Sharp
- **Cloud storage**: Cloudinary
- **Database**: PostgreSQL + Prisma 7
- **File handling**: Multer (memory storage)
- **Auth**: JWT (`jsonwebtoken`) + bcrypt
- **Validation**: Multer file filter + `file-type` magic bytes check
- **Rate limiting**: `express-rate-limit`

---

## Project Structure

```
file-upload/
├── prisma/
│   └── schema.prisma
├── prisma.config.ts
├── src/
│   ├── generated/
│   │   └── prisma/          # Prisma-generated client (do not edit)
│   ├── auth.ts              # JWT sign, verify, requireAuth middleware
│   ├── db.ts                # Prisma client singleton
│   ├── seed.ts              # Creates the owner account
│   ├── sharp.ts             # Image processing pipeline
│   ├── validation.ts        # Multer filter + magic bytes check
│   └── index.ts             # Express app and routes
├── .env
├── tsconfig.json
└── package.json
```

---

## Prerequisites

- Node.js 18+
- PostgreSQL running locally (or a hosted instance)
- A Cloudinary account

---

## Setup

**1. Clone and install dependencies**

```bash
git clone <repo-url>
cd file-upload
npm install
```

**2. Configure environment variables**

Create a `.env` file in the project root:

```env
DATABASE_URL=postgresql://postgres:yourpassword@localhost:5432/portfolio
CLOUDINARY_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
JWT_SECRET=your_long_random_secret_here
OWNER_EMAIL=you@example.com
OWNER_PASSWORD=yourpassword
PORT=3000
```

**3. Create the database**

```bash
psql -U postgres -c "CREATE DATABASE portfolio;"
```

**4. Run migrations**

```bash
npx prisma migrate dev --name init
```

**5. Seed the owner account**

```bash
npm run seed
```

This creates the owner account using the credentials in `.env`. Only needs to be run once.

**6. Start the dev server**

```bash
npm run dev
```

---

## API

Routes marked 🔒 require an `Authorization: Bearer <token>` header.

---

### Login

```
POST /api/auth/login
Content-Type: application/json
Body: { "email": "...", "password": "..." }
```

**Response**

```json
{ "token": "eyJhbGci..." }
```

---

### Upload an image 🔒

```
POST /api/upload
Authorization: Bearer <token>
Content-Type: multipart/form-data
Body: file (image field)
```

Validates the file at both the Multer level (mimetype, 5MB size limit) and magic bytes level, processes it into three variants (thumbnail, medium, full), uploads all three to Cloudinary, and saves metadata to the database. Rate limited to 20 requests per 15 minutes.

Accepted formats: `image/jpeg`, `image/png`, `image/webp`.

**Response**

```json
{
  "id": "cmqzslw710000y855njdhri5j",
  "baseId": "1782772314603-4hf8ptmfp5d",
  "filename": "photo.png",
  "mimetype": "image/png",
  "size": 62082,
  "uploadedAt": "2026-06-29T22:31:57.757Z",
  "variants": [
    { "name": "thumbnail", "url": "https://res.cloudinary.com/...", "publicId": "portfolio/thumbnail/..." },
    { "name": "medium",    "url": "https://res.cloudinary.com/...", "publicId": "portfolio/medium/..." },
    { "name": "full",      "url": "https://res.cloudinary.com/...", "publicId": "portfolio/full/..." }
  ]
}
```

---

### List images

```
GET /api/images?page=1&limit=20
```

Public endpoint. Returns paginated images with their variants, ordered by most recent upload. Defaults to page 1, 20 per page. Maximum limit is 50.

**Response**

```json
{
  "data": [
    {
      "id": "cmqzslw710000y855njdhri5j",
      "filename": "photo.png",
      "uploadedAt": "2026-06-29T22:31:57.757Z",
      "variants": [ ... ]
    }
  ],
  "meta": {
    "total": 43,
    "page": 1,
    "limit": 20,
    "totalPages": 3,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

---

### Delete an image 🔒

```
DELETE /api/images/:id
Authorization: Bearer <token>
```

Deletes all Cloudinary variants first, then removes the database record. The `ImageVariant` rows are cascade-deleted automatically.

**Response**

```json
{ "success": true }
```

---

## Image Processing

Each upload is processed by Sharp before being sent to Cloudinary:

| Variant   | Dimensions   | Fit     |
|-----------|-------------|---------|
| thumbnail | 200 × 200   | cover   |
| medium    | 800 × 800   | inside  |
| full      | original    | —       |

All variants are converted to WebP at 85% quality. EXIF metadata is stripped from all outputs. Images are never upscaled beyond their original dimensions.

---

## Database Schema

```prisma
model Owner {
  id       String @id @default(cuid())
  email    String @unique
  password String
}

model Image {
  id         String         @id @default(cuid())
  baseId     String         @unique
  filename   String
  mimetype   String
  size       Int
  uploadedAt DateTime       @default(now())
  variants   ImageVariant[]
}

model ImageVariant {
  id       String @id @default(cuid())
  imageId  String
  name     String
  url      String
  publicId String
  image    Image  @relation(fields: [imageId], references: [id], onDelete: Cascade)
}
```

---

## Scripts

| Command         | Description                        |
|-----------------|------------------------------------|
| `npm run dev`   | Start dev server with hot reload   |
| `npm run build` | Compile TypeScript to `dist/`      |
| `npm start`     | Run compiled production build      |
| `npm run seed`  | Create the owner account (run once)|

---

## Notes

- This project uses Prisma 7 with the new `prisma-client` provider and `@prisma/adapter-pg`. The generated client lives in `src/generated/prisma/` rather than `node_modules`.
- `findFirst` is used instead of `findUnique` for single record lookups due to a known issue with `findUnique` and the `PrismaPg` adapter.
- The Cloudinary deletion always runs before the database deletion to avoid orphaned files.
- File validation runs at two layers: Multer rejects invalid mimetypes before the buffer is fully read, and `file-type` checks the magic bytes of the buffer to catch spoofed extensions.
- JWT tokens expire after 7 days. There is no refresh token flow — the owner simply logs in again.
- Never commit `.env` to version control. Use `.env.example` with placeholder values instead.