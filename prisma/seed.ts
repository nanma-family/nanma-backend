// prisma/seed.ts
import { PrismaClient, EventType, MilestoneType } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding NANMA database...');

  // Create family members
  const pinHash = await bcrypt.hash('1234', 10);

  const priya = await prisma.member.upsert({
    where: { inviteCode: 'PRIYA001' },
    update: {},
    create: {
      name: 'Priya Kumar',
      nickname: 'Amma',
      relation: 'Mother',
      birthday: new Date('1974-12-22'),
      phone: '+91 98765 43210',
      city: 'Coimbatore',
      avatarColor: '#D4EDE1',
      avatarInitials: 'PK',
      pinHash,
      inviteCode: 'PRIYA001',
      isAdmin: true,
    },
  });

  const ravi = await prisma.member.upsert({
    where: { inviteCode: 'RAVI001' },
    update: {},
    create: {
      name: 'Ravi Kumar',
      nickname: 'Appa',
      relation: 'Father',
      birthday: new Date('1972-03-15'),
      phone: '+91 98765 43211',
      city: 'Coimbatore',
      avatarColor: '#FEE9E2',
      avatarInitials: 'RK',
      pinHash,
      inviteCode: 'RAVI001',
    },
  });

  const deepa = await prisma.member.upsert({
    where: { inviteCode: 'DEEPA01' },
    update: {},
    create: {
      name: 'Deepa Kumar',
      relation: 'Daughter',
      birthday: new Date('2000-01-14'),
      city: 'Chennai',
      avatarColor: '#EDE9FE',
      avatarInitials: 'DK',
      pinHash,
      inviteCode: 'DEEPA01',
    },
  });

  // Create events
  const gatheringEvent = await prisma.event.create({
    data: {
      title: 'Annual family gathering',
      description: 'Our yearly get-together to celebrate being a family!',
      eventDate: new Date('2024-12-25T16:00:00'),
      location: 'Coimbatore',
      type: EventType.gathering,
      createdBy: priya.id,
      attendees: {
        create: [
          { memberId: priya.id },
          { memberId: ravi.id },
          { memberId: deepa.id },
        ],
      },
    },
  });

  const birthdayEvent = await prisma.event.create({
    data: {
      title: "Priya's 50th birthday",
      eventDate: new Date('2024-12-22T18:00:00'),
      location: 'Coimbatore',
      type: EventType.birthday,
      createdBy: ravi.id,
      attendees: {
        create: [
          { memberId: priya.id },
          { memberId: ravi.id },
          { memberId: deepa.id },
        ],
      },
    },
  });

  // Create milestones
  await prisma.milestone.createMany({
    data: [
      { title: "Ravi & Priya's 25th anniversary", date: new Date('2023-12-10'), type: MilestoneType.anniversary },
      { title: "Deepa's graduation", date: new Date('2023-05-20'), type: MilestoneType.graduation, memberId: deepa.id },
    ],
    skipDuplicates: true,
  });

  console.log('✅ Seed complete!');
  console.log('');
  console.log('📱 Test login credentials:');
  console.log('   Invite code: PRIYA001  |  PIN: 1234  (Admin)');
  console.log('   Invite code: RAVI001   |  PIN: 1234');
  console.log('   Invite code: DEEPA01   |  PIN: 1234');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
