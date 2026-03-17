// src/routes/members.ts
import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { body, validationResult } from 'express-validator';
import { prisma } from '../utils/prisma';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';

export const membersRouter = Router();
membersRouter.use(authenticate);

// ── Helper: safe member shape ──────────────────────────────────────────────────
function safeMember(m: any) {
  const { pinHash, ...rest } = m;
  return {
    ...rest,
    eventsAttended: m._count?.attendees ?? 0,
    _count: undefined,
  };
}

const memberSelect = {
  id: true, name: true, nickname: true, relation: true,
  birthday: true, phone: true, city: true,
  avatarUrl: true, avatarColor: true, avatarInitials: true,
  isAdmin: true, inviteCode: true, joinedAt: true, createdAt: true,
  _count: { select: { attendees: { where: { attended: true } } } },
};

// ── GET /api/members ───────────────────────────────────────────────────────────
membersRouter.get('/', async (_req: Request, res: Response) => {
  const members = await prisma.member.findMany({
    select: memberSelect,
    orderBy: { name: 'asc' },
  });
  return res.json(members.map(safeMember));
});

// ── GET /api/members/:id ───────────────────────────────────────────────────────
membersRouter.get('/:id', async (req: Request, res: Response) => {
  const member = await prisma.member.findUnique({
    where: { id: req.params.id },
    select: memberSelect,
  });
  if (!member) return res.status(404).json({ error: 'Member not found' });
  return res.json(safeMember(member));
});

// ── POST /api/members ──────────────────────────────────────────────────────────
membersRouter.post(
  '/',
  requireAdmin,
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('relation').notEmpty().withMessage('Relation is required'),
    body('avatarInitials').notEmpty(),
    body('pin').isLength({ min: 4, max: 6 }).withMessage('PIN must be 4-6 digits'),
  ],
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const {
      name, nickname, relation, birthday, phone, city,
      avatarColor, avatarInitials, pin,
    } = req.body;

    // Generate unique invite code
    const base = name.split(' ').map((w: string) => w[0]).join('').toUpperCase();
    let inviteCode = base + Math.random().toString(36).slice(2, 5).toUpperCase();
    while (await prisma.member.findUnique({ where: { inviteCode } })) {
      inviteCode = base + Math.random().toString(36).slice(2, 5).toUpperCase();
    }

    const pinHash = await bcrypt.hash(pin || '1234', 10);

    const member = await prisma.member.create({
      data: {
        name: name.trim(),
        nickname,
        relation,
        birthday: birthday ? new Date(birthday) : undefined,
        phone,
        city,
        avatarColor,
        avatarInitials,
        pinHash,
        inviteCode,
      },
      select: memberSelect,
    });

    return res.status(201).json({
      ...safeMember(member),
      inviteCode, // Return plaintext code once on creation
    });
  }
);

// ── PUT /api/members/:id ───────────────────────────────────────────────────────
membersRouter.put('/:id', async (req: AuthRequest, res: Response) => {
  // Members can only edit themselves; admins can edit anyone
  if (req.params.id !== req.memberId && !req.isAdmin) {
    return res.status(403).json({ error: 'You can only edit your own profile' });
  }

  const { name, nickname, relation, birthday, phone, city, avatarColor, avatarInitials } = req.body;

  const member = await prisma.member.update({
    where: { id: req.params.id },
    data: {
      ...(name && { name: name.trim() }),
      nickname,
      ...(relation && { relation }),
      birthday: birthday ? new Date(birthday) : undefined,
      phone,
      city,
      avatarColor,
      ...(avatarInitials && { avatarInitials }),
    },
    select: memberSelect,
  });

  return res.json(safeMember(member));
});

// ── DELETE /api/members/:id ────────────────────────────────────────────────────
membersRouter.delete('/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  await prisma.member.delete({ where: { id: req.params.id } });
  return res.json({ ok: true });
});
