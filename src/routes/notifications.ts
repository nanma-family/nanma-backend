// src/routes/notifications.ts
import { Router } from 'express';
import { prisma } from '../utils/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';

export const notificationsRouter = Router();
notificationsRouter.use(authenticate);

// ── GET /api/notifications ─────────────────────────────────────────────────────
notificationsRouter.get('/', async (req: AuthRequest, res) => {
  const notifications = await prisma.notification.findMany({
    where: { memberId: req.memberId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return res.json(notifications);
});

// ── PUT /api/notifications/read-all ───────────────────────────────────────────
notificationsRouter.put('/read-all', async (req: AuthRequest, res) => {
  await prisma.notification.updateMany({
    where: { memberId: req.memberId, read: false },
    data: { read: true },
  });
  return res.json({ ok: true });
});

// ── PUT /api/notifications/:id/read ───────────────────────────────────────────
notificationsRouter.put('/:id/read', async (req: AuthRequest, res) => {
  await prisma.notification.updateMany({
    where: { id: req.params.id, memberId: req.memberId },
    data: { read: true },
  });
  return res.json({ ok: true });
});
