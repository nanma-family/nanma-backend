// src/routes/memories.ts
import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { getMonth, getDate, getYear, differenceInYears } from 'date-fns';
import { prisma } from '../utils/prisma';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';

export const memoriesRouter = Router();
memoriesRouter.use(authenticate);

// ── GET /api/memories/on-this-day ─────────────────────────────────────────────
// Returns events that happened on today's month+day in previous years
memoriesRouter.get('/on-this-day', async (_req: Request, res: Response) => {
  const today = new Date();
  const todayMonth = getMonth(today) + 1; // 1-indexed
  const todayDay = getDate(today);
  const currentYear = getYear(today);

  // Fetch all past events and filter by month/day
  const allEvents = await prisma.event.findMany({
    where: {
      eventDate: { lt: new Date(currentYear, getMonth(today), todayDay) },
    },
    include: {
      photos: {
        take: 1,
        orderBy: { createdAt: 'desc' },
        select: { url: true },
      },
    },
    orderBy: { eventDate: 'desc' },
  });

  const memories = allEvents
    .filter(e => {
      const eMonth = getMonth(e.eventDate) + 1;
      const eDay = getDate(e.eventDate);
      return eMonth === todayMonth && eDay === todayDay;
    })
    .map(e => ({
      id: e.id,
      title: e.title,
      date: e.eventDate,
      yearsAgo: differenceInYears(today, e.eventDate),
      photoCount: e.photos.length,
      coverPhotoUrl: e.coverPhotoUrl || e.photos[0]?.url || null,
      eventId: e.id,
    }));

  return res.json(memories);
});

// ── GET /api/milestones ────────────────────────────────────────────────────────
memoriesRouter.get('/milestones', async (_req: Request, res: Response) => {
  const milestones = await prisma.milestone.findMany({
    orderBy: { date: 'desc' },
  });
  return res.json(milestones);
});

// ── POST /api/milestones ───────────────────────────────────────────────────────
memoriesRouter.post(
  '/milestones',
  requireAdmin,
  [
    body('title').trim().notEmpty(),
    body('date').isISO8601(),
    body('type').isIn(['anniversary', 'graduation', 'birthday', 'custom']),
  ],
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { title, date, type, memberId } = req.body;
    const milestone = await prisma.milestone.create({
      data: {
        title: title.trim(),
        date: new Date(date),
        type,
        memberId,
      },
    });
    return res.status(201).json(milestone);
  }
);

// ── DELETE /api/milestones/:id ─────────────────────────────────────────────────
memoriesRouter.delete('/milestones/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  await prisma.milestone.delete({ where: { id: req.params.id } });
  return res.json({ ok: true });
});
