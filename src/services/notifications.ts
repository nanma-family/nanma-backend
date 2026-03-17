// src/services/notifications.ts
import admin from 'firebase-admin';
import { prisma } from '../utils/prisma';

// ── Initialize Firebase Admin once ────────────────────────────────────────────
let firebaseInitialized = false;

export function initFirebase() {
  if (firebaseInitialized) return;

  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccount) {
    console.warn('⚠️  FIREBASE_SERVICE_ACCOUNT_JSON not set — push notifications disabled');
    return;
  }

  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(serviceAccount)),
  });

  firebaseInitialized = true;
  console.log('🔔 Firebase Admin initialized');
}

// ── Send push to a single FCM token ───────────────────────────────────────────
async function sendPush(
  fcmToken: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<boolean> {
  if (!firebaseInitialized) return false;
  try {
    await admin.messaging().send({
      token: fcmToken,
      notification: { title, body },
      data,
      android: { notification: { channelId: data?.type || 'general', priority: 'high' } },
      apns: { payload: { aps: { badge: 1, sound: 'default' } } },
    });
    return true;
  } catch (err: any) {
    console.error('FCM send failed:', err.message);
    return false;
  }
}

// ── Send to multiple members ───────────────────────────────────────────────────
async function notifyMembers(
  memberIds: string[],
  title: string,
  body: string,
  type: string,
  data?: Record<string, string>
) {
  const members = await prisma.member.findMany({
    where: { id: { in: memberIds } },
    select: { id: true, fcmToken: true },
  });

  for (const member of members) {
    // Save to DB regardless
    await prisma.notification.create({
      data: {
        memberId: member.id,
        title,
        body,
        type: type as any,
        data,
        sent: !!member.fcmToken,
        sentAt: member.fcmToken ? new Date() : undefined,
      },
    });

    // Push if token available
    if (member.fcmToken) {
      await sendPush(member.fcmToken, title, body, { type, ...data });
    }
  }
}

// ── Event created notification ─────────────────────────────────────────────────
export async function sendEventNotification(
  eventId: string,
  eventTitle: string,
  eventDate: Date,
  attendeeIds: string[]
) {
  if (!attendeeIds.length) return;

  await notifyMembers(
    attendeeIds,
    `📅 New event: ${eventTitle}`,
    `You've been invited! The event is on ${eventDate.toDateString()}.`,
    'event_created',
    { eventId }
  );
}

// ── Birthday notification ──────────────────────────────────────────────────────
export async function sendBirthdayNotification(
  birthdayMemberId: string,
  birthdayMemberName: string,
  allMemberIds: string[]
) {
  const firstName = birthdayMemberName.split(' ')[0];
  await notifyMembers(
    allMemberIds.filter(id => id !== birthdayMemberId),
    `🎂 Happy birthday, ${firstName}!`,
    `Today is ${firstName}'s birthday. Don't forget to wish them!`,
    'birthday',
    { memberId: birthdayMemberId }
  );
}

// ── Event reminder notification ────────────────────────────────────────────────
export async function sendEventReminderNotification(
  eventId: string,
  eventTitle: string,
  attendeeIds: string[],
  isTomorrow: boolean
) {
  await notifyMembers(
    attendeeIds,
    isTomorrow ? `📅 Tomorrow: ${eventTitle}` : `🎉 Today: ${eventTitle}`,
    isTomorrow
      ? `Don't forget — "${eventTitle}" is happening tomorrow!`
      : `"${eventTitle}" is today! Have a wonderful time. 🎉`,
    'event_reminder',
    { eventId }
  );
}
