// src/routes/photos.ts
import { Router } from 'express';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { prisma } from '../utils/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';

export const photosRouter = Router();
photosRouter.use(authenticate);

// ── Cloudinary config ──────────────────────────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ── Multer memory storage (files go to RAM then Cloudinary) ───────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only images allowed'));
  },
});

// ── Helper: upload buffer to Cloudinary ───────────────────────────────────────
async function uploadToCloudinary(
  buffer: Buffer,
  folder: string
): Promise<{ url: string; thumbnailUrl: string; publicId: string }> {
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        {
          folder: `nanma/${folder}`,
          transformation: [{ quality: 'auto', fetch_format: 'auto' }],
        },
        (error, result) => {
          if (error || !result) return reject(error);
          const thumbnailUrl = cloudinary.url(result.public_id, {
            width: 400,
            height: 400,
            crop: 'fill',
            quality: 'auto',
            fetch_format: 'auto',
          });
          resolve({
            url: result.secure_url,
            thumbnailUrl,
            publicId: result.public_id,
          });
        }
      )
      .end(buffer);
  });
}

// ── GET /api/events/:eventId/photos ───────────────────────────────────────────
photosRouter.get('/event/:eventId', async (req, res) => {
  const photos = await prisma.photo.findMany({
    where: { eventId: req.params.eventId },
    orderBy: { createdAt: 'desc' },
    include: {
      uploader: { select: { id: true, name: true, avatarInitials: true } },
    },
  });
  return res.json(photos);
});

// ── POST /api/photos/upload ────────────────────────────────────────────────────
photosRouter.post(
  '/upload',
  upload.array('photo', 10),
  async (req: AuthRequest, res) => {
    const { eventId, caption } = req.body;
    const files = req.files as Express.Multer.File[];

    if (!eventId) return res.status(400).json({ error: 'eventId is required' });
    if (!files?.length) return res.status(400).json({ error: 'No files uploaded' });

    // Verify event exists
    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const savedPhotos = [];

    for (const file of files) {
      const { url, thumbnailUrl, publicId } = await uploadToCloudinary(
        file.buffer,
        `events/${eventId}`
      );

      const photo = await prisma.photo.create({
        data: {
          eventId,
          uploadedBy: req.memberId!,
          url,
          thumbnailUrl,
          publicId,
          caption,
        },
      });

      savedPhotos.push(photo);
    }

    // Set first uploaded photo as event cover if no cover yet
    if (!event.coverPhotoUrl && savedPhotos.length > 0) {
      await prisma.event.update({
        where: { id: eventId },
        data: { coverPhotoUrl: savedPhotos[0].url },
      });
    }

    return res.status(201).json(savedPhotos);
  }
);

// ── DELETE /api/photos/:id ─────────────────────────────────────────────────────
photosRouter.delete('/:id', async (req: AuthRequest, res) => {
  const photo = await prisma.photo.findUnique({ where: { id: req.params.id } });
  if (!photo) return res.status(404).json({ error: 'Photo not found' });

  if (photo.uploadedBy !== req.memberId && !req.isAdmin) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  // Delete from Cloudinary
  if (photo.publicId) {
    await cloudinary.uploader.destroy(photo.publicId);
  }

  await prisma.photo.delete({ where: { id: req.params.id } });
  return res.json({ ok: true });
});
