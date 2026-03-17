// src/routes/events.ts
import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { prisma } from '../utils/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { sendEventNotification } from '../services/notifications';

export const eventsRouter = Router();
eventsRouter.use(authenticate);

// ── Helper: format event with attendee details ─────────────────────────────────
async function formatEvent(event: any) {
  return {
    ...event,
    attendeeCount: event.attendees?.length ?? 0,
    attendees: event.attendees?.map((a: any) => ({
      memberId: a.member.id,
      name: a.member.name,
      avatarInitials: a.member.avatarInitials,
      avatarColor: a.member.avatarColor,
      rsvpStatus: a.rsvpStatus,
      attended: a.attended,
    })) ?? [],
  };
}

const eventInclude = {
  attendees: {
    include: {
      member: {
        select: {
          id: true, name: true,
          avatarInitials: true, avatarColor: true,
        },
      },
    },
  },
};

// ── GET /api/events ────────────────────────────────────────────────────────────
eventsRouter.get('/', async (_req: Request, res: Response) => {
  const events = await prisma.event.findMany({
    include: eventInclude,
    orderBy: { eventDate: 'asc' },
  });
  return res.json(await Promise.all(events.map(formatEvent)));
});

// ── GET /api/events/:id ────────────────────────────────────────────────────────
eventsRouter.get('/:id', async (req: Request, res: Response) => {
  const event = await prisma.event.findUnique({
    where: { id: req.params.id },
    include: eventInclude,
  });
  if (!event) return res.status(404).json({ error: 'Event not found' });
  return res.json(await formatEvent(event));
});

// ── POST /api/events ───────────────────────────────────────────────────────────
eventsRouter.post(
  '/',
  [
    body('title').trim().notEmpty().withMessage('Title is required'),
    body('eventDate').isISO8601().withMessage('Valid date required'),
    body('type').isIn(['birthday', 'gathering', 'wedding', 'custom']),
  ],
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const {
      title, description, eventDate, location, type,
      attendeeIds = [],
    } = req.body;

    const event = await prisma.event.create({
      data: {
        title: title.trim(),
        description,
        eventDate: new Date(eventDate),
        location,
        type,
        createdBy: req.memberId!,
        attendees: {
          create: [...new Set([req.memberId!, ...attendeeIds])].map((id: string) => ({
            memberId: id,
            rsvpStatus: id === req.memberId ? 'attending' : 'pending',
          })),
        },
      },
      include: eventInclude,
    });

    // Notify all attendees
    await sendEventNotification(event.id, title, new Date(eventDate), attendeeIds);

    return res.status(201).json(await formatEvent(event));
  }
);

// ── PUT /api/events/:id ────────────────────────────────────────────────────────
eventsRouter.put('/:id', async (req: AuthRequest, res) => {
  const event = await prisma.event.findUnique({ where: { id: req.params.id } });
  if (!event) return res.status(404).json({ error: 'Event not found' });

  if (event.createdBy !== req.memberId && !req.isAdmin) {
    return res.status(403).json({ error: 'Not authorized to edit this event' });
  }

  const {
    title, description, eventDate, location, type, attendeeIds,
  } = req.body;

  const updated = await prisma.$transaction(async (tx) => {
    // Update attendees if provided
    if (attendeeIds) {
      await tx.eventAttendee.deleteMany({ where: { eventId: req.params.id } });
      await tx.eventAttendee.createMany({
        data: [...new Set([req.memberId!, ...attendeeIds])].map((id: string) => ({
          eventId: req.params.id,
          memberId: id,
        })),
      });
    }

    return tx.event.update({
      where: { id: req.params.id },
      data: {
        ...(title && { title: title.trim() }),
        description,
        ...(eventDate && { eventDate: new Date(eventDate) }),
        location,
        ...(type && { type }),
      },
      include: eventInclude,
    });
  });

  return res.json(await formatEvent(updated));
});

// ── DELETE /api/events/:id ─────────────────────────────────────────────────────
eventsRouter.delete('/:id', async (req: AuthRequest, res) => {
  const event = await prisma.event.findUnique({ where: { id: req.params.id } });
  if (!event) return res.status(404).json({ error: 'Event not found' });

  if (event.createdBy !== req.memberId && !req.isAdmin) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  await prisma.event.delete({ where: { id: req.params.id } });
  return res.json({ ok: true });
});

// ── POST /api/events/:id/rsvp ──────────────────────────────────────────────────
eventsRouter.post('/:id/rsvp', async (req: AuthRequest, res) => {
  const { status } = req.body;
  const validStatuses = ['attending', 'not_attending', 'maybe', 'pending'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid RSVP status' });
  }

  const attendee = await prisma.eventAttendee.upsert({
    where: {
      eventId_memberId: {
        eventId: req.params.id,
        memberId: req.memberId!,
      },
    },
    update: { rsvpStatus: status },
    create: {
      eventId: req.params.id,
      memberId: req.memberId!,
      rsvpStatus: status,
    },
  });

  return res.json(attendee);
});

// ── POST /api/events/:id/attendance ───────────────────────────────────────────
eventsRouter.post('/:id/attendance', async (req: AuthRequest, res) => {
  const { memberId, attended } = req.body;

  if (typeof attended !== 'boolean') {
    return res.status(400).json({ error: 'attended must be a boolean' });
  }

  const record = await prisma.eventAttendee.updateMany({
    where: {
      eventId: req.params.id,
      memberId,
    },
    data: { attended },
  });

  return res.json({ ok: true, updated: record.count });
});
