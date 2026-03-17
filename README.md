# NANMA Backend — Setup & Hosting Guide

## Tech Stack
| Layer | Technology |
|---|---|
| Runtime | Node.js 20 + TypeScript |
| Framework | Express.js |
| Database | PostgreSQL (via Prisma ORM) |
| Photo Storage | Cloudinary (free 25GB) |
| Push Notifications | Firebase Cloud Messaging |
| Hosting | Railway.app |
| Scheduler | node-cron (birthdays, event reminders) |

---

## Project Structure

```
nanma-backend/
├── src/
│   ├── index.ts                  # Server entry point
│   ├── routes/
│   │   ├── auth.ts               # Login, /me, FCM token, PIN change
│   │   ├── members.ts            # CRUD family members
│   │   ├── events.ts             # CRUD events, RSVP, attendance
│   │   ├── photos.ts             # Upload/delete via Cloudinary
│   │   ├── memories.ts           # On-this-day, milestones
│   │   └── notifications.ts      # List, mark read
│   ├── middleware/
│   │   ├── auth.ts               # JWT authenticate + requireAdmin
│   │   └── errorHandler.ts       # Global error handler
│   ├── services/
│   │   ├── notifications.ts      # Firebase push notification helpers
│   │   └── scheduler.ts          # Cron jobs for birthdays & events
│   └── utils/
│       └── prisma.ts             # Prisma singleton client
├── prisma/
│   ├── schema.prisma             # Full database schema
│   └── seed.ts                   # Sample data + test logins
├── .env.example                  # All env vars documented
├── Dockerfile                    # For Railway deployment
└── package.json
```

---

## API Reference

### Auth
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | /api/auth/login | ✗ | Login with invite code + PIN |
| GET | /api/auth/me | ✓ | Get current user |
| PUT | /api/auth/fcm-token | ✓ | Update push token |
| PUT | /api/auth/pin | ✓ | Change PIN |

### Members
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | /api/members | ✓ | List all members |
| GET | /api/members/:id | ✓ | Get member detail |
| POST | /api/members | Admin | Add new member |
| PUT | /api/members/:id | ✓ | Edit member (own or admin) |
| DELETE | /api/members/:id | Admin | Remove member |

### Events
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | /api/events | ✓ | List all events |
| GET | /api/events/:id | ✓ | Event detail with attendees |
| POST | /api/events | ✓ | Create event |
| PUT | /api/events/:id | ✓ | Edit event |
| DELETE | /api/events/:id | ✓ | Delete event |
| POST | /api/events/:id/rsvp | ✓ | RSVP to event |
| POST | /api/events/:id/attendance | ✓ | Mark attendance |

### Photos
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | /api/photos/event/:eventId | ✓ | Get event photos |
| POST | /api/photos/upload | ✓ | Upload photos (multipart) |
| DELETE | /api/photos/:id | ✓ | Delete photo |

### Memories
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | /api/memories/on-this-day | ✓ | Events on today's date in past years |
| GET | /api/memories/milestones | ✓ | All milestones |
| POST | /api/memories/milestones | Admin | Add milestone |
| DELETE | /api/memories/milestones/:id | Admin | Delete milestone |

### Notifications
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | /api/notifications | ✓ | List notifications |
| PUT | /api/notifications/read-all | ✓ | Mark all read |
| PUT | /api/notifications/:id/read | ✓ | Mark one read |

---

## Step-by-Step Setup

### Step 1 — Install dependencies

```bash
cd nanma-backend
npm install
```

### Step 2 — Set up environment variables

```bash
cp .env.example .env
# Then edit .env with your values
```

### Step 3 — Set up Cloudinary (photo storage — free)

1. Go to https://cloudinary.com and create a free account
2. From the Dashboard, copy:
   - Cloud name
   - API Key
   - API Secret
3. Paste into `.env`:
```
CLOUDINARY_CLOUD_NAME="your_cloud_name"
CLOUDINARY_API_KEY="your_api_key"
CLOUDINARY_API_SECRET="your_api_secret"
```

### Step 4 — Set up Firebase (push notifications — free)

1. Go to https://console.firebase.google.com
2. Create a project called "nanma"
3. Go to Project Settings → Service Accounts
4. Click "Generate new private key" → download JSON
5. Minify the JSON to one line and paste into .env:
```
FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
```

### Step 5 — Run locally with a local PostgreSQL

```bash
# Option A: Use Docker for local Postgres
docker run -d \
  --name nanma-db \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=nanma \
  -p 5432:5432 \
  postgres:15

# Set in .env:
DATABASE_URL="postgresql://postgres:password@localhost:5432/nanma"
```

### Step 6 — Run database migrations + seed

```bash
# Generate Prisma client
npm run db:generate

# Create tables
npx prisma migrate dev --name init

# Seed with sample data
npm run db:seed
```

### Step 7 — Start development server

```bash
npm run dev
# Server runs on http://localhost:3000
# Test: http://localhost:3000/health
```

---

## Deploy to Railway (Production Hosting)

Railway is the recommended host — simple Git-based deploys, free PostgreSQL, ~$5/month for a family app.

### Step 1 — Create Railway account

Go to https://railway.app and sign up with GitHub.

### Step 2 — Create a new project

1. Click "New Project"
2. Select "Deploy from GitHub repo"
3. Connect your GitHub and select the `nanma-backend` repository

### Step 3 — Add PostgreSQL database

1. Inside your Railway project, click "+ New"
2. Select "Database" → "PostgreSQL"
3. Railway auto-creates a `DATABASE_URL` variable — it's shared automatically with your service

### Step 4 — Set environment variables in Railway

In your Railway service → "Variables" tab, add:

```
NODE_ENV=production
JWT_SECRET=<generate: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))">
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
```

### Step 5 — Deploy

Railway auto-deploys on every `git push`. The Dockerfile handles:
- Building TypeScript
- Running `prisma migrate deploy`
- Starting the server

### Step 6 — Get your API URL

In Railway, click your service → "Settings" → copy the public URL.
It looks like: `https://nanma-backend-production.up.railway.app`

### Step 7 — Seed the production database

```bash
# One-time: run seed against production DB
DATABASE_URL="your_railway_database_url" npm run db:seed
```

---

## Hook Mobile App to Backend

### Step 1 — Update the API base URL

Open `nanma-mobile/src/store/api.ts` and change:

```typescript
// Before (local dev)
const BASE_URL = 'http://localhost:3000/api';

// After (production)
const BASE_URL = 'https://nanma-backend-production.up.railway.app/api';
```

For development (local), use your machine's IP (not localhost) since the phone can't reach your laptop's localhost:

```typescript
// Android emulator: use 10.0.2.2
const BASE_URL = 'http://10.0.2.2:3000/api';

// Real phone on same WiFi: use your laptop's local IP
const BASE_URL = 'http://192.168.1.100:3000/api';  // find your IP with: ipconfig / ifconfig
```

### Step 2 — Test login flow

Use the seeded credentials:
```
Invite code: PRIYA001   PIN: 1234  (Admin — can add/delete members)
Invite code: RAVI001    PIN: 1234
Invite code: DEEPA01    PIN: 1234
```

### Step 3 — Add Firebase to the mobile app

**Android:**
- Copy `google-services.json` into `nanma-mobile/android/app/`
- In `android/build.gradle`: add `classpath 'com.google.gms:google-services:4.4.0'`
- In `android/app/build.gradle`: add `apply plugin: 'com.google.gms.google-services'`

**iOS:**
- Copy `GoogleService-Info.plist` into `nanma-mobile/ios/nanma/`
- In Xcode, drag `GoogleService-Info.plist` into the project navigator

### Step 4 — Register FCM token with backend

The mobile app already calls this on login. The App.tsx sends the token:

```typescript
// This already exists in App.tsx
requestFCMPermission().then(token => {
  if (token) {
    dispatch(setFcmToken(token));
    // Also POST to backend so server can send pushes
    fetch(`${BASE_URL}/auth/fcm-token`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${storedToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fcmToken: token }),
    });
  }
});
```

---

## Adding a New Family Member (Admin Flow)

1. Admin opens app → Members tab → "+" button
2. Fills in name, relation, birthday, phone
3. App calls `POST /api/members` with the data
4. Backend auto-generates an invite code (e.g. `RK9A2`)
5. Admin shares the invite code with the new member via WhatsApp/SMS
6. New member downloads the app, enters invite code + PIN `1234` (default)
7. They should change their PIN immediately via Settings

---

## Cost Summary

| Service | Plan | Cost |
|---|---|---|
| Railway (server) | Starter | ~$5/month |
| Railway (PostgreSQL) | Included | Free up to 1GB |
| Cloudinary (photos) | Free tier | Free up to 25GB |
| Firebase (FCM) | Spark (free) | Free |
| **Total** | | **~$5/month** |

---

## Useful Commands

```bash
# View database in browser UI
npm run db:studio

# Create a new migration after schema change
npx prisma migrate dev --name your_change_name

# Reset database (WARNING: deletes all data)
npx prisma migrate reset

# Check Railway logs
railway logs

# Open Railway shell
railway shell
```
