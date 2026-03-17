// src/services/scheduler.ts
import cron from 'node-cron';
import { getMonth, getDate, addDays, startOfDay, endOfDay } from 'date-fns';
import { prisma } from '../utils/prisma';
import {
  sendBirthdayNotification,
  sendEventReminderNotification,
} from './notifications';

export function startScheduler() {
  console.log('⏰ Scheduler started');

  // ── Every day at 8:00 AM — Birthday check ─────────────────────────────────
  cron.schedule('0 8 * * *', async () => {
    console.log('[Scheduler] Running birthday check...');
    try {
      const today = new Date();
      const todayMonth = getMonth(today) + 1;
      const todayDay = getDate(today);

      const allMembers = await prisma.member.findMany({
        select: { id: true, name: true, birthday: true },
      });

      const birthdayToday = allMembers.filter(m => {
        if (!m.birthday) return false;
        return (
          getMonth(m.birthday) + 1 === todayMonth &&
          getDate(m.birthday) === todayDay
        );
      });

      for (const member of birthdayToday) {
        const allMemberIds = allMembers.map(m => m.id);
        await sendBirthdayNotification(member.id, member.name, allMemberIds);
        console.log(`[Scheduler] Birthday notification sent for ${member.name}`);
      }
    } catch (err) {
      console.error('[Scheduler] Birthday check error:', err);
    }
  }, { timezone: 'Asia/Kolkata' });

  // ── Every day at 8:00 AM — Event reminders ────────────────────────────────
  cron.schedule('0 8 * * *', async () => {
    console.log('[Scheduler] Running event reminder check...');
    try {
      const today = new Date();
      const tomorrow = addDays(today, 1);

      // Events happening tomorrow
      const tomorrowEvents = await prisma.event.findMany({
        where: {
          eventDate: {
            gte: startOfDay(tomorrow),
            lte: endOfDay(tomorrow),
          },
        },
        include: {
          attendees: {
            where: { rsvpStatus: { not: 'not_attending' } },
            select: { memberId: true },
          },
        },
      });

      for (const event of tomorrowEvents) {
        const attendeeIds = event.attendees.map(a => a.memberId);
        await sendEventReminderNotification(event.id, event.title, attendeeIds, true);
        console.log(`[Scheduler] Tomorrow reminder sent for: ${event.title}`);
      }

      // Events happening today
      const todayEvents = await prisma.event.findMany({
        where: {
          eventDate: {
            gte: startOfDay(today),
            lte: endOfDay(today),
          },
        },
        include: {
          attendees: {
            where: { rsvpStatus: { not: 'not_attending' } },
            select: { memberId: true },
          },
        },
      });

      for (const event of todayEvents) {
        const attendeeIds = event.attendees.map(a => a.memberId);
        await sendEventReminderNotification(event.id, event.title, attendeeIds, false);
        console.log(`[Scheduler] Today reminder sent for: ${event.title}`);
      }
    } catch (err) {
      console.error('[Scheduler] Event reminder error:', err);
    }
  }, { timezone: 'Asia/Kolkata' });

  console.log('⏰ Cron jobs scheduled (IST timezone)');
}
