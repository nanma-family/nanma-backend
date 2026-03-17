// src/routes/auth.ts
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import { prisma } from '../utils/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';

export const authRouter = Router();

// ── POST /api/auth/login ───────────────────────────────────────────────────────
authRouter.post(
  '/login',
  [
    body('inviteCode').trim().notEmpty().withMessage('Invite code required'),
    body('pin').isLength({ min: 4, max: 6 }).withMessage('PIN must be 4-6 digits'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { inviteCode, pin } = req.body;

    const member = await prisma.member.findUnique({
      where: { inviteCode: inviteCode.toUpperCase() },
    });

    if (!member) {
      return res.status(401).json({ error: 'Invalid invite code or PIN' });
    }

    const pinMatch = await bcrypt.compare(pin, member.pinHash);
    if (!pinMatch) {
      return res.status(401).json({ error: 'Invalid invite code or PIN' });
    }

    const token = jwt.sign(
      { memberId: member.id, isAdmin: member.isAdmin },
      process.env.JWT_SECRET!,
      { expiresIn: '90d' }
    );

    const { pinHash: _, ...safeUser } = member;
    return res.json({ token, user: safeUser });
  }
);

// ── GET /api/auth/me ───────────────────────────────────────────────────────────
authRouter.get('/me', authenticate, async (req: AuthRequest, res) => {
  const member = await prisma.member.findUnique({
    where: { id: req.memberId },
    select: {
      id: true, name: true, nickname: true, relation: true,
      birthday: true, phone: true, city: true,
      avatarUrl: true, avatarColor: true, avatarInitials: true,
      isAdmin: true, inviteCode: true, createdAt: true,
      _count: { select: { attendees: { where: { attended: true } } } },
    },
  });

  if (!member) return res.status(404).json({ error: 'Member not found' });

  return res.json({
    ...member,
    eventsAttended: member._count.attendees,
    _count: undefined,
  });
});

// ── PUT /api/auth/fcm-token ────────────────────────────────────────────────────
authRouter.put('/fcm-token', authenticate, async (req: AuthRequest, res) => {
  const { fcmToken } = req.body;
  await prisma.member.update({
    where: { id: req.memberId },
    data: { fcmToken },
  });
  return res.json({ ok: true });
});

// ── PUT /api/auth/pin ──────────────────────────────────────────────────────────
authRouter.put(
  '/pin',
  authenticate,
  [
    body('currentPin').notEmpty(),
    body('newPin').isLength({ min: 4, max: 6 }),
  ],
  async (req: AuthRequest, res) => {
    const { currentPin, newPin } = req.body;

    const member = await prisma.member.findUnique({ where: { id: req.memberId } });
    if (!member) return res.status(404).json({ error: 'Not found' });

    const match = await bcrypt.compare(currentPin, member.pinHash);
    if (!match) return res.status(401).json({ error: 'Current PIN is incorrect' });

    const newHash = await bcrypt.hash(newPin, 10);
    await prisma.member.update({
      where: { id: req.memberId },
      data: { pinHash: newHash },
    });

    return res.json({ ok: true });
  }
);
