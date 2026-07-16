# Pigeon — Full Development Plan (v2)

## Context

Pigeon is a social media management platform for small businesses. It manages Facebook Pages and WhatsApp conversations from one clean dashboard. This version adds a complete role-based access control system (Owner / Admin / Moderator / User), full data encryption at rest, daily message archiving with configurable time, Owner-only site-wide controls, and hardened security against SQL injection, privilege escalation, and data theft.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| Database | PostgreSQL |
| ORM | Prisma (parameterized queries only — no raw SQL) |
| Real-time | Socket.IO (custom server) |
| WhatsApp | OpenWA (REST client) |
| Facebook | Graph API + Webhooks |
| Auth | NextAuth.js (credentials provider) |
| Encryption | AES-256-GCM (Node.js `crypto`) |
| Validation | Zod (strict schemas, no client-supplied role/status fields) |
| State | Zustand + React Query (TanStack) |
| Forms | React Hook Form + Zod |
| File uploads | Local disk / S3 (configurable) |

---

## Role System

### Hierarchy

```
Owner  >  Admin  >  Moderator  >  User
```

### Role Definitions

#### Owner
- Exactly **one** account. Set by seeding at installation — cannot be registered normally.
- Controls everything on the site:
  - Site name, primary colors/theme
  - Announcements and Changelog shown at site start (dashboard banner + first-login modal)
  - Assign any role to any user (Owner → Admin → Moderator → User)
  - Transfer ownership to another account
  - Ban / suspend / activate any account including Admins
  - Access to all platform features
  - Full Settings panel including all Owner-only tabs

#### Admin
- Assigned only by Owner.
- Can assign Moderator or User role to accounts (cannot assign Admin or Owner).
- Can ban / suspend / activate accounts that are **Moderator** or **User** (never Owner or other Admins).
- Full access to all platform features (Facebook, WhatsApp, Automation, Broadcast, Contacts).
- Access to admin panel (user list, account actions, reports overview).

#### Moderator
- Assigned by Owner or Admin.
- Access limited to: **view reports / complaints** and **reply to them**.
- Cannot access Facebook, WhatsApp, Automation, Broadcast, or Contacts sections.
- Cannot change any settings.
- Cannot change any user's role or status.

#### User
- Default role assigned on **every** new registration — regardless of what the client sends.
- Full access to all platform features (Facebook, WhatsApp, Automation, Broadcast, Contacts, Settings).
- Can configure their own appearance, notification, and personal settings only.
- Cannot access admin panel, user management, or site-wide settings.

### Role Assignment Rules (Enforced Server-Side Only)

```
Actor       →  Can assign roles
────────────────────────────────────────
Owner       →  admin, moderator, user
Admin       →  moderator, user
Moderator   →  (none)
User        →  (none)
```

- The `role` field is **never** accepted from the client on registration or profile updates.
- Every role-change API endpoint re-reads the actor's role from the database — never from the JWT token alone.
- All role changes are written to `AuditLog`.

### Account Status

| Status | Description |
|---|---|
| `active` | Normal login allowed |
| `suspended` | Temporary block — cannot login, shown as "Account suspended" |
| `banned` | Permanent block — cannot login, shown as "Account banned" |

- Suspending / banning the Owner account is impossible (enforced server-side).
- Admins cannot suspend/ban other Admins or the Owner.

---

## Data Encryption

All sensitive data is encrypted with **AES-256-GCM** before writing to the database and decrypted only at the application layer. The encryption key (`ENCRYPTION_KEY`) lives in `.env` and is never stored in the database.

### Encrypted fields

| Model | Encrypted fields |
|---|---|
| `FacebookPage` | `accessTokenEnc` |
| `WhatsAppAccount` | `openwaAuthEnc` |
| `FacebookMessage` | `contentEnc` |
| `WhatsAppMessage` | `contentEnc` |
| `FacebookComment` | `contentEnc` |
| `MessageArchive` | entire compressed payload |
| `AuditLog` | `detailsEnc` |

### `lib/encryption.ts`

```ts
// AES-256-GCM: encrypt(plaintext) → "iv:authTag:ciphertext" (base64)
export function encrypt(plaintext: string): string
export function decrypt(ciphertext: string): string
// Never throw plaintext in error messages
```

No search on encrypted content is done via SQL. Full-text search on messages is performed **after** decryption at the application layer (load page → decrypt → filter in memory for small sets, or maintain a separate encrypted search index for large sets).

---

## Message Logging & Daily Archiving

### How it works

1. Every incoming/outgoing Facebook and WhatsApp message is saved in real-time to the database (encrypted `contentEnc`).
2. A **Daily Archive Job** runs at a configurable time (Owner sets it in Site Settings, default 00:00 local time):
   - Fetches all messages from the previous day
   - Compresses them to JSON
   - Encrypts the compressed payload (AES-256-GCM)
   - Writes to `MessageArchive` table with date + source
   - Marks source messages as `archived = true`
   - Optionally deletes archived messages from live tables (configurable)
3. Archives are downloadable by Owner/Admin from Settings → Archives tab.

### `MessageArchive` model

```prisma
model MessageArchive {
  id           String   @id @default(uuid())
  source       String   // facebook | whatsapp
  archiveDate  DateTime // the day this archive covers
  payloadEnc   String   // encrypted compressed JSON
  sizeBytes    Int
  createdAt    DateTime @default(now())
}
```

### Cron job

`/api/cron/archive-messages` — triggered at the Owner-configured time via `setInterval` in the custom server. Configurable time stored as `Setting` key `archive_time` (e.g. `"00:00"`).

---

## Owner-Only Site Controls

Accessible only from **Settings → Site** tab (hidden from all non-Owner roles).

### Site Identity
- Site name (shown in browser tab, sidebar logo text, emails)
- Primary color override (hex — overrides default `#6D4AFF`)
- Dark theme override
- Logo upload

### Announcements
- Create a **banner announcement** shown at the top of the dashboard for all users.
- Fields: title, body, type (info / warning / success), start date, end date, active toggle.
- Multiple announcements can exist; only active ones are shown.

### Changelog
- Create **changelog entries** shown as a "What's New" modal the first time each user logs in after the entry is published.
- Fields: version string, title, body (markdown), published date.
- `UserChangelogSeen` junction table tracks which users have dismissed each entry.

### User Management (Owner + Admin)
- List all users with role, status, last login, created date.
- Owner sees all. Admin sees only Moderator and User accounts.
- Actions:
  - Change role (within permission rules above)
  - Suspend / ban / activate account
  - Force password reset
  - View audit log for a specific user

---

## Database Models (Prisma Schema)

```prisma
// ─── ENUMS ───────────────────────────────────────────────────────────────────

enum Role {
  owner
  admin
  moderator
  user
}

enum AccountStatus {
  active
  suspended
  banned
}

// ─── USERS & AUTH ─────────────────────────────────────────────────────────────

model User {
  id               String        @id @default(uuid())
  email            String        @unique
  passwordHash     String
  name             String?
  avatarUrl        String?
  role             Role          @default(user)
  status           AccountStatus @default(active)
  lastLoginAt      DateTime?
  forcePasswordReset Boolean     @default(false)
  createdAt        DateTime      @default(now())
  updatedAt        DateTime      @updatedAt

  auditLogsActed   AuditLog[]    @relation("ActorLogs")
  auditLogsTarget  AuditLog[]    @relation("TargetLogs")
  changelogsSeen   UserChangelogSeen[]
  reports          Report[]
  reportReplies    ReportReply[]
  sessions         UserSession[]
}

model UserSession {
  id         String   @id @default(uuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  token      String   @unique
  ipAddress  String?
  userAgent  String?
  expiresAt  DateTime
  createdAt  DateTime @default(now())
}

// ─── AUDIT LOG ────────────────────────────────────────────────────────────────

model AuditLog {
  id         String   @id @default(uuid())
  actorId    String
  actor      User     @relation("ActorLogs", fields: [actorId], references: [id])
  targetId   String?
  target     User?    @relation("TargetLogs", fields: [targetId], references: [id])
  action     String   // e.g. "role.change", "account.suspend", "settings.update", "broadcast.send"
  detailsEnc String   // encrypted JSON with before/after values
  ipAddress  String?
  createdAt  DateTime @default(now())
}

// ─── ANNOUNCEMENTS & CHANGELOG ───────────────────────────────────────────────

model Announcement {
  id        String   @id @default(uuid())
  title     String
  body      String
  type      String   @default("info")  // info | warning | success
  isActive  Boolean  @default(true)
  startsAt  DateTime?
  endsAt    DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Changelog {
  id          String   @id @default(uuid())
  version     String
  title       String
  body        String   // markdown
  publishedAt DateTime @default(now())
  createdAt   DateTime @default(now())

  seenBy      UserChangelogSeen[]
}

model UserChangelogSeen {
  userId      String
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  changelogId String
  changelog   Changelog @relation(fields: [changelogId], references: [id], onDelete: Cascade)
  seenAt      DateTime  @default(now())

  @@id([userId, changelogId])
}

// ─── REPORTS / COMPLAINTS ─────────────────────────────────────────────────────

model Report {
  id          String   @id @default(uuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  subject     String
  body        String
  status      String   @default("open")  // open | in_review | resolved | closed
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  replies     ReportReply[]
}

model ReportReply {
  id        String   @id @default(uuid())
  reportId  String
  report    Report   @relation(fields: [reportId], references: [id], onDelete: Cascade)
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  body      String
  createdAt DateTime @default(now())
}

// ─── FACEBOOK ────────────────────────────────────────────────────────────────

model FacebookPage {
  id               String   @id @default(uuid())
  pageId           String   @unique
  name             String
  accessTokenEnc   String   // AES-256-GCM encrypted
  webhookVerified  Boolean  @default(false)
  followersCount   Int?
  avatarUrl        String?
  connectedAt      DateTime @default(now())
  updatedAt        DateTime @updatedAt

  posts         FacebookPost[]
  conversations FacebookConversation[]
  comments      FacebookComment[]
  activityItems FacebookActivity[]
  autoRules     AutomationRule[]
}

model FacebookPost {
  id            String       @id @default(uuid())
  pageId        String
  page          FacebookPage @relation(fields: [pageId], references: [id])
  externalId    String?
  content       String
  mediaUrls     String[]
  status        String       // draft | scheduled | published | failed
  scheduledAt   DateTime?
  publishedAt   DateTime?
  reactions     Int          @default(0)
  commentsCount Int          @default(0)
  shares        Int          @default(0)
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt
}

model FacebookConversation {
  id              String       @id @default(uuid())
  pageId          String
  page            FacebookPage @relation(fields: [pageId], references: [id])
  externalId      String
  participantName String?
  participantId   String?
  unreadCount     Int          @default(0)
  lastMessageAt   DateTime?
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt

  messages FacebookMessage[]
}

model FacebookMessage {
  id             String               @id @default(uuid())
  conversationId String
  conversation   FacebookConversation @relation(fields: [conversationId], references: [id])
  externalId     String?
  fromPage       Boolean              @default(false)
  contentEnc     String               // AES-256-GCM encrypted
  attachments    Json?
  archived       Boolean              @default(false)
  sentAt         DateTime
  createdAt      DateTime             @default(now())
}

model FacebookComment {
  id          String       @id @default(uuid())
  pageId      String
  page        FacebookPage @relation(fields: [pageId], references: [id])
  externalId  String
  postId      String?
  authorName  String?
  authorId    String?
  contentEnc  String       // AES-256-GCM encrypted
  status      String       @default("new")  // new | replied | hidden | handled
  reactions   Int          @default(0)
  archived    Boolean      @default(false)
  postedAt    DateTime
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
}

model FacebookActivity {
  id        String       @id @default(uuid())
  pageId    String
  page      FacebookPage @relation(fields: [pageId], references: [id])
  type      String       // comment | reaction | message | post | automation
  summary   String
  metadata  Json?
  createdAt DateTime     @default(now())
}

// ─── WHATSAPP ────────────────────────────────────────────────────────────────

model WhatsAppAccount {
  id             String   @id @default(uuid())
  sessionName    String
  phoneNumber    String?
  status         String   @default("disconnected")
  openwaBaseUrl  String
  openwaAuthEnc  String   // AES-256-GCM encrypted
  webhookUrl     String?
  lastHeartbeat  DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  conversations WhatsAppConversation[]
  autoRules     AutomationRule[]
}

model WhatsAppConversation {
  id           String          @id @default(uuid())
  accountId    String
  account      WhatsAppAccount @relation(fields: [accountId], references: [id])
  contactPhone String
  contactName  String?
  unreadCount  Int             @default(0)
  lastMessageAt DateTime?
  createdAt    DateTime        @default(now())
  updatedAt    DateTime        @updatedAt

  messages WhatsAppMessage[]
  contact  Contact?          @relation(fields: [contactPhone], references: [phone])
}

model WhatsAppMessage {
  id             String               @id @default(uuid())
  conversationId String
  conversation   WhatsAppConversation @relation(fields: [conversationId], references: [id])
  externalId     String?
  fromMe         Boolean              @default(false)
  contentEnc     String?              // AES-256-GCM encrypted
  type           String               @default("text")
  mediaUrl       String?
  status         String               @default("sent")
  archived       Boolean              @default(false)
  sentAt         DateTime
  createdAt      DateTime             @default(now())
}

// ─── MESSAGE ARCHIVE ──────────────────────────────────────────────────────────

model MessageArchive {
  id           String   @id @default(uuid())
  source       String   // facebook | whatsapp
  archiveDate  DateTime // the calendar day this archive covers
  payloadEnc   String   // encrypted + compressed JSON
  sizeBytes    Int
  createdAt    DateTime @default(now())
}

// ─── CONTACTS ────────────────────────────────────────────────────────────────

model Contact {
  id             String   @id @default(uuid())
  name           String?
  phone          String   @unique
  email          String?
  avatarUrl      String?
  fbProfileId    String?
  notes          String?
  source         String?  // whatsapp | facebook | manual | import
  firstContactAt DateTime @default(now())
  lastMessageAt  DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  tags                ContactTag[]
  conversations       WhatsAppConversation[]
  broadcastRecipients BroadcastRecipient[]
}

model ContactTag {
  id        String  @id @default(uuid())
  contactId String
  contact   Contact @relation(fields: [contactId], references: [id], onDelete: Cascade)
  tag       String
}

// ─── AUTOMATION ───────────────────────────────────────────────────────────────

model AutomationRule {
  id              String           @id @default(uuid())
  name            String
  channel         String           // facebook | whatsapp
  fbPageId        String?
  fbPage          FacebookPage?    @relation(fields: [fbPageId], references: [id])
  waAccountId     String?
  waAccount       WhatsAppAccount? @relation(fields: [waAccountId], references: [id])
  trigger         String           // new_message | keyword | new_comment | comment_keyword | outside_hours | first_message | tagged_contact
  keywords        String[]
  replyMessage    String
  actions         Json?
  isActive        Boolean          @default(true)
  lastTriggeredAt DateTime?
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt
}

// ─── BROADCAST ────────────────────────────────────────────────────────────────

model Broadcast {
  id          String   @id @default(uuid())
  channel     String   // facebook | whatsapp
  name        String
  message     String
  attachments Json?
  status      String   @default("draft")
  scheduledAt DateTime?
  startedAt   DateTime?
  completedAt DateTime?
  totalCount  Int      @default(0)
  sentCount   Int      @default(0)
  failedCount Int      @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  recipients BroadcastRecipient[]
}

model BroadcastRecipient {
  id          String    @id @default(uuid())
  broadcastId String
  broadcast   Broadcast @relation(fields: [broadcastId], references: [id])
  contactId   String?
  contact     Contact?  @relation(fields: [contactId], references: [id])
  phone       String?
  status      String    @default("pending")
  sentAt      DateTime?
  errorMsg    String?
}

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────

model Notification {
  id        String   @id @default(uuid())
  type      String
  title     String
  body      String?
  isRead    Boolean  @default(false)
  metadata  Json?
  createdAt DateTime @default(now())
}

// ─── SETTINGS ─────────────────────────────────────────────────────────────────

model Setting {
  id        String   @id @default(uuid())
  key       String   @unique
  value     String
  updatedAt DateTime @updatedAt
}

// ─── WEBHOOK EVENTS ───────────────────────────────────────────────────────────

model WebhookEvent {
  id          String   @id @default(uuid())
  source      String
  externalId  String?
  payload     Json
  processed   Boolean  @default(false)
  processedAt DateTime?
  error       String?
  createdAt   DateTime @default(now())
}
```

---

## Project Structure

```
pigeon/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── layout.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx               # Sidebar + TopBar, role-aware nav
│   │   ├── dashboard/page.tsx
│   │   ├── facebook/page.tsx
│   │   ├── whatsapp/page.tsx
│   │   ├── automation/page.tsx
│   │   ├── broadcast/page.tsx
│   │   ├── contacts/page.tsx
│   │   ├── reports/page.tsx          # Moderator + Admin + Owner: complaints
│   │   ├── admin/
│   │   │   ├── users/page.tsx        # Admin + Owner: user management
│   │   │   └── audit/page.tsx        # Owner only: audit log
│   │   └── settings/page.tsx
│   ├── api/
│   │   ├── auth/[...nextauth]/route.ts
│   │   ├── facebook/
│   │   │   ├── webhook/route.ts
│   │   │   ├── pages/route.ts
│   │   │   ├── posts/route.ts
│   │   │   ├── messages/route.ts
│   │   │   └── comments/route.ts
│   │   ├── whatsapp/
│   │   │   ├── webhook/route.ts
│   │   │   ├── messages/route.ts
│   │   │   ├── contacts/route.ts
│   │   │   └── connection/route.ts
│   │   ├── admin/
│   │   │   ├── users/route.ts        # list, role-change, status-change
│   │   │   └── audit/route.ts
│   │   ├── owner/
│   │   │   ├── announcements/route.ts
│   │   │   ├── changelog/route.ts
│   │   │   └── site-settings/route.ts
│   │   ├── reports/route.ts
│   │   ├── automation/route.ts
│   │   ├── broadcast/route.ts
│   │   ├── contacts/route.ts
│   │   ├── settings/route.ts
│   │   └── dashboard/route.ts
│   └── layout.tsx
├── components/
│   ├── ui/                           # shadcn/ui
│   ├── layout/
│   │   ├── Sidebar.tsx               # role-aware: hides tabs Moderator cannot access
│   │   ├── TopBar.tsx
│   │   └── MobileNav.tsx
│   ├── dashboard/
│   │   ├── StatCard.tsx
│   │   ├── ActivityFeed.tsx
│   │   ├── AnnouncementBanner.tsx
│   │   └── ChangelogModal.tsx
│   ├── admin/
│   │   ├── UserTable.tsx
│   │   ├── RoleSelect.tsx            # only renders options within actor's permission
│   │   └── AuditLogTable.tsx
│   ├── reports/
│   │   ├── ReportList.tsx
│   │   └── ReportReplyBox.tsx
│   ├── facebook/  (same as before)
│   ├── whatsapp/  (same as before)
│   ├── automation/
│   ├── broadcast/
│   ├── contacts/
│   └── settings/
│       ├── FacebookPageSettings.tsx
│       ├── OpenWASettings.tsx
│       └── SiteSettings.tsx          # Owner only
├── lib/
│   ├── prisma.ts
│   ├── socket.ts
│   ├── facebook.ts
│   ├── openwa.ts
│   ├── auth.ts
│   ├── encryption.ts                 # AES-256-GCM encrypt/decrypt
│   ├── rate-limit.ts
│   ├── rbac.ts                       # role permission helpers + guards
│   ├── audit.ts                      # writeAuditLog(actor, target, action, details)
│   └── validators/
│       ├── auth.schema.ts
│       ├── user.schema.ts            # never includes role/status fields from client
│       ├── post.schema.ts
│       ├── message.schema.ts
│       ├── report.schema.ts
│       └── settings.schema.ts
├── middleware.ts                     # route protection + role gates
├── hooks/
├── store/
├── server/
│   └── socket-server.ts
├── prisma/
│   ├── schema.prisma
│   └── seed.ts                       # creates the one Owner account
├── public/
├── styles/
├── .env.example
├── next.config.ts
├── tailwind.config.ts
└── package.json
```

---

## RBAC Implementation (`lib/rbac.ts`)

```ts
// Role hierarchy weight
const ROLE_WEIGHT: Record<Role, number> = {
  owner: 4, admin: 3, moderator: 2, user: 1,
}

// Check if actor can assign targetRole to someone
export function canAssignRole(actorRole: Role, targetRole: Role): boolean {
  if (actorRole === 'owner') return true
  if (actorRole === 'admin') return targetRole === 'moderator' || targetRole === 'user'
  return false
}

// Check if actor can change status of target
export function canChangeStatus(actorRole: Role, targetRole: Role): boolean {
  if (actorRole === 'owner') return targetRole !== 'owner'  // owner cannot suspend self via normal UI
  if (actorRole === 'admin') return targetRole === 'moderator' || targetRole === 'user'
  return false
}

// Page-level access guard — used in middleware.ts and API routes
export function canAccessRoute(role: Role, route: string): boolean {
  if (route.startsWith('/owner') || route.startsWith('/api/owner')) return role === 'owner'
  if (route.startsWith('/admin') || route.startsWith('/api/admin')) return role === 'owner' || role === 'admin'
  if (route.startsWith('/reports') || route.startsWith('/api/reports')) return role !== 'user'  // mod, admin, owner
  // All other dashboard routes: owner, admin, user — NOT moderator
  return role !== 'moderator'
}
```

### Middleware (`middleware.ts`)

1. Read session JWT → extract `userId` only (never trust `role` from JWT).
2. Re-fetch `role` and `status` from DB on every sensitive request.
3. If `status !== 'active'` → redirect to `/suspended` or `/banned`.
4. If `canAccessRoute(role, pathname)` returns false → redirect to `/unauthorized`.
5. Apply rate limiting on `/api/auth/*` (10 req/min) and `/api/broadcast/*` (5 req/min).

---

## Security Hardening

### SQL Injection Prevention
- Prisma uses parameterized queries for all DB operations. **Never use `prisma.$queryRaw`** with string interpolation.
- If raw queries are ever needed, use tagged template literals: `prisma.$queryRaw\`SELECT ... WHERE id = ${userId}\``
- All inputs validated by Zod before touching the ORM.

### Privilege Escalation Prevention
- `role` and `status` fields are **stripped from all client input** by Zod schemas — they are never in the validated output.
- On registration, `role` is hardcoded to `'user'` in the server action — not taken from request body.
- Role changes only via `/api/admin/users` (Admin/Owner) and `/api/owner/users` (Owner), with server-side `canAssignRole()` check.
- The JWT stores only `userId`. Role is re-queried from DB on every API request that requires role checking.

### Session Security
- NextAuth JWT signed with `NEXTAUTH_SECRET` (min 32 random bytes).
- httpOnly, secure, sameSite=strict cookies.
- `UserSession` table tracks active sessions — logout invalidates the DB record.
- Force-password-reset flag causes redirect to `/reset-password` on next login before allowing dashboard access.

### Input Validation
- Every API route runs Zod `parse()` (throws on invalid input → 400 response).
- File uploads: validate MIME type against allowlist, reject path traversal in filenames, store outside `/public`.

### CSRF Protection
- NextAuth includes CSRF token on form submissions.
- State-changing API routes check `Origin` / `Referer` header matches `NEXTAUTH_URL`.

### XSS Prevention
- React escapes content by default. Never use `dangerouslySetInnerHTML` without explicit DOMPurify sanitization.
- Announcement/Changelog body rendered via a safe markdown renderer (e.g. `react-markdown` with no raw HTML).

### Brute Force / Rate Limiting (`lib/rate-limit.ts`)
- In-memory sliding window per IP (upgrade to Redis if scaling).
- Login: 5 attempts / 15 min → temporary IP lock.
- Registration: 3 accounts / hour per IP.
- Password reset: 3 requests / hour per email.
- Broadcast send: 5 requests / min.

### Webhook Security
- Facebook: validate `X-Hub-Signature-256` on every POST — reject if invalid.
- OpenWA: validate a shared `OPENWA_WEBHOOK_SECRET` header — reject if missing/wrong.
- Webhook deduplication: check `WebhookEvent.externalId` before processing.

### Audit Trail
- `writeAuditLog()` called on: role changes, status changes, broadcast sends, login/logout, settings saves, archive downloads.
- `detailsEnc` stores before/after values encrypted.
- Audit log is append-only — no DELETE endpoint exists.

### Data Exposure
- Never return `passwordHash`, `accessTokenEnc`, `openwaAuthEnc`, or `detailsEnc` in API responses.
- API responses for messages decrypt content at the application layer and return plaintext — encryption is transparent to the frontend.
- Error messages never include SQL errors, stack traces, or credentials.

---

## Design System

### Colors (Tailwind extend)

```ts
colors: {
  pigeon: {
    purple: '#6D4AFF',
    dark:   '#5637D8',
    light:  '#F3F0FF',
    bg:     '#F8F7FC',
    border: '#E9E6F0',
    text:   '#25222D',
    muted:  '#777280',
  },
  fb:      '#1877F2',
  wa:      '#25D366',
  success: '#22A06B',
  warning: '#F59E0B',
  danger:  '#E5484D',
}
```

### Component Conventions
- Cards: `rounded-2xl bg-white border border-pigeon-border shadow-sm`
- Primary button: `bg-pigeon-purple hover:bg-pigeon-dark text-white rounded-xl`
- Secondary button: `bg-pigeon-light text-pigeon-purple rounded-xl`
- Sidebar active: `bg-pigeon-light text-pigeon-purple font-medium`
- Role badge: `owner` → gold, `admin` → purple, `moderator` → blue, `user` → gray

---

## Phase 1 — Project Scaffolding & Design System

1. Init Next.js + install all dependencies
   ```bash
   npx create-next-app@latest pigeon --typescript --tailwind --app --src-dir=false
   npm install prisma @prisma/client next-auth socket.io socket.io-client
   npm install zod react-hook-form @hookform/resolvers
   npm install zustand @tanstack/react-query
   npm install bcryptjs @types/bcryptjs axios date-fns lucide-react clsx tailwind-merge
   npx shadcn-ui@latest init
   npx shadcn-ui@latest add button card input textarea select tabs badge avatar dialog sheet dropdown-menu tooltip separator skeleton switch
   ```

2. Configure Tailwind (colors, Inter font), shadcn theme

3. Write Prisma schema (all models above) → `prisma migrate dev --name init`

4. Seed Owner account (`prisma/seed.ts`):
   ```ts
   // role hardcoded to 'owner' — only place it's set to owner
   await prisma.user.create({ data: { email: OWNER_EMAIL, passwordHash: hash, role: 'owner', status: 'active' } })
   ```

5. Create `.env`:
   ```
   DATABASE_URL=postgresql://...
   NEXTAUTH_SECRET=...              # min 32 random bytes
   NEXTAUTH_URL=http://localhost:3000
   ENCRYPTION_KEY=...               # 32 bytes hex for AES-256-GCM
   FACEBOOK_APP_ID=...
   FACEBOOK_APP_SECRET=...
   FACEBOOK_WEBHOOK_VERIFY_TOKEN=...
   OPENWA_WEBHOOK_SECRET=...
   OWNER_EMAIL=...                  # used by seed only
   OWNER_PASSWORD=...               # used by seed only
   ```

6. Custom Next.js server (`server/socket-server.ts`) + shared `io` export

7. `lib/encryption.ts` — AES-256-GCM encrypt/decrypt

8. `lib/rbac.ts` — permission helpers

9. `lib/audit.ts` — `writeAuditLog()`

10. NextAuth credentials provider — re-queries `role` + `status` from DB, blocks suspended/banned accounts

11. Middleware — route guards using `canAccessRoute()`

12. Sidebar — role-aware: Moderator sees only Reports link; others see full nav

13. Dashboard — stat cards + `AnnouncementBanner` + `ChangelogModal` (checks `UserChangelogSeen`)

---

## Phase 2 — Facebook Integration

*(Same as original plan — webhook, posts, scheduler, messages, comments, activity, auto replies)*

Changes vs original:
- `FacebookMessage.content` → `contentEnc` (encrypt on write, decrypt on read)
- `FacebookComment.content` → `contentEnc` (same)
- All writes go through `lib/facebook.ts` helpers that call `encrypt()` before Prisma insert
- All reads decrypt before returning from API route

---

## Phase 3 — WhatsApp / OpenWA Integration

*(Same as original plan)*

Changes:
- `WhatsAppMessage.content` → `contentEnc` (encrypt/decrypt at application layer)

---

## Phase 4 — Automation Section

*(Same as original plan)*

---

## Phase 5 — Broadcast Section

*(Same as original plan)*

---

## Phase 6 — Contacts Section

*(Same as original plan)*

---

## Phase 7 — Reports / Complaints Section

### Who can access
- User: submit a new report
- Moderator, Admin, Owner: view all reports, reply, change status

### UI
- `/reports` page — list of reports with status filter
- Each report: subject, body, user, status, replies thread
- Reply box (Moderator / Admin / Owner)
- Status change: open → in_review → resolved / closed

### API
- `POST /api/reports` — User submits (Zod validates subject + body length, no HTML)
- `GET /api/reports` — Mod/Admin/Owner lists (paginated)
- `POST /api/reports/[id]/reply` — Mod/Admin/Owner replies
- `PATCH /api/reports/[id]/status` — Mod/Admin/Owner changes status

---

## Phase 8 — Admin / User Management Section

### `/admin/users` (Admin + Owner)
- Paginated user table: name, email, role badge, status badge, last login, created date
- Admin sees: Moderators + Users only
- Owner sees: everyone
- Actions column: Change Role dropdown (shows only assignable roles) → confirmation dialog → `writeAuditLog()`
- Suspend / Ban / Activate button → confirmation → `writeAuditLog()`
- Force Password Reset button
- Click row → user detail with full audit history for that user

### `/admin/audit` (Owner only)
- Full audit log table: timestamp, actor, target, action, IP
- Filter by action type, actor, date range
- Read-only — no delete

---

## Phase 9 — Owner Site Controls (Settings → Site tab)

Only visible when `session.role === 'owner'`.

### Site Identity
- Site name input → stored as `Setting` key `site_name`
- Primary color picker → `site_primary_color`
- Logo upload → `site_logo_url`
- Dark theme override → `site_dark_theme`

### Message Archive Settings
- Archive time picker (HH:MM) → `Setting` key `archive_time`
- Keep archived messages in live DB toggle → `archive_keep_live`
- Download archive button (lists `MessageArchive` records by date)

### Announcements
- Create / edit / delete announcements
- Each: title, body, type, start/end date, active toggle

### Changelog
- Create / edit changelog entries
- Each: version, title, markdown body, published date
- Preview button (renders markdown)

---

## Real-Time Architecture

```
Browser ──WebSocket──► Custom Next.js server (socket-server.ts)
                              │ shared `io`
                              ▼
                       API Route Handlers
                              │
     ┌────────────────────────┼───────────────────────┐
     ▼                        ▼                        ▼
fb:page:{pageId}      wa:conv:{convId}        broadcast:{id}:progress
(messages/comments)   (messages)              (send progress)
                              │
                      broadcast to all
                      (unread counts, notifications, announcements)
```

---

## Cron / Background Jobs

| Job | Route | Interval |
|---|---|---|
| Publish scheduled posts | `/api/cron/publish-posts` | Every 1 minute |
| Send scheduled broadcasts | `/api/cron/send-broadcasts` | Every 1 minute |
| Facebook page sync | `/api/cron/fb-sync` | Every 15 minutes |
| OpenWA heartbeat check | `/api/cron/wa-heartbeat` | Every 30 seconds |
| **Daily message archive** | `/api/cron/archive-messages` | Owner-configured time (default 00:00) |
| Notifications cleanup | `/api/cron/notifications-cleanup` | Daily |

Archive job reads `Setting.archive_time`, compares to current local time, runs once per day.

---

## Settings Page Tabs

| Tab | Visible to | Content |
|---|---|---|
| General | All | Business name, timezone, date format, business hours, language |
| Facebook Pages | Owner, Admin, User | Connect Page, webhook status, reconnect/disconnect |
| OpenWA | Owner, Admin, User | Base URL, auth (masked), session, QR, test |
| Notifications | All | Toggle per event type |
| Appearance | All | Light/dark, compact, sidebar default, RTL |
| **Site** | **Owner only** | Site name, colors, logo, archive time, announcements, changelog |
| **Archives** | **Owner, Admin** | Download / browse message archives |

---

## Implementation Order

### Sprint 1 — Foundation + Security Core
1. Next.js init + all dependencies
2. Tailwind + shadcn
3. Prisma schema + migrate + seed (Owner account)
4. `lib/encryption.ts` + `lib/rbac.ts` + `lib/audit.ts`
5. Custom server + Socket.IO
6. NextAuth (re-queries role from DB, blocks suspended/banned)
7. Middleware (route guards + rate limiting)
8. Sidebar (role-aware nav)
9. TopBar + Dashboard shell
10. `AnnouncementBanner` + `ChangelogModal`

### Sprint 2 — Facebook
11. Facebook OAuth + Page connect
12. Webhook endpoint + signature validation
13. Posts, Scheduler, Messages (encrypted), Comments (encrypted), Activity, Auto Replies

### Sprint 3 — WhatsApp
14. OpenWA settings + encryption
15. Connection tab (QR + status)
16. WhatsApp webhook
17. Chats (encrypted messages), Contacts, Auto Replies, Broadcast

### Sprint 4 — Roles, Admin, Reports
18. `/admin/users` — user table, role change, status change + audit log writes
19. `/admin/audit` — Owner-only audit log table
20. `/reports` — submit (User) + review/reply (Mod/Admin/Owner)
21. Owner Site Controls (Settings → Site tab)
22. Announcements CRUD
23. Changelog CRUD

### Sprint 5 — Shared Sections
24. Automation page
25. Broadcast page
26. Contacts page
27. Remaining Settings tabs
28. Notifications bell

### Sprint 6 — Message Archiving
29. `MessageArchive` model migration
30. `/api/cron/archive-messages` — encrypt + compress + store
31. Owner-configurable time setting
32. Archive download endpoint (Owner/Admin only, streams encrypted archive)

### Sprint 7 — Polish
33. Dark mode
34. RTL / Arabic
35. Loading skeletons + empty states
36. Toast notifications
37. Full error handling (no stack traces exposed)
38. Mobile responsive
39. Docker Compose

---

## Verification Plan

1. **Role enforcement** — register a new account → verify role is `user` regardless of request body → promote to moderator via admin panel → verify moderator cannot access Facebook/WhatsApp routes → verify only Owner can promote to admin
2. **Privilege escalation** — attempt to send `{ "role": "owner" }` in registration or profile update body → verify it is stripped and ignored
3. **Suspended account** — suspend a user account via admin panel → verify login returns "Account suspended" → activate again → verify login works
4. **Encryption** — check database rows directly for `FacebookMessage` and `WhatsAppMessage` → verify `contentEnc` is ciphertext, not plaintext → verify messages display correctly in UI
5. **SQL injection** — attempt `' OR '1'='1` in search fields → verify Prisma parameterization prevents any data leakage
6. **Archive job** — set archive time to 1 minute from now → trigger job → verify `MessageArchive` record created, `archived = true` on source messages, payload is encrypted
7. **Announcements** — Owner creates announcement → all users see banner on dashboard → Owner sets end date to past → banner disappears
8. **Changelog** — Owner creates changelog entry → existing users see modal on next login → user dismisses → modal does not reappear → new user logs in → sees modal
9. **Audit log** — Owner changes a user's role → entry appears in `/admin/audit` with correct actor, target, action, before/after values
10. **Facebook + WhatsApp real-time** — message arrives via webhook → appears in chat tab without page refresh → encrypted in DB, decrypted in UI

---

## Docker Compose

```yaml
version: '3.9'
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: pigeon
      POSTGRES_USER: pigeon
      POSTGRES_PASSWORD: pigeon_secret
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  app:
    build: .
    ports:
      - "3000:3000"
    env_file: .env
    depends_on:
      - db

volumes:
  postgres_data:
```

---

## Key Files to Create First

| Priority | File | Purpose |
|---|---|---|
| 1 | `prisma/schema.prisma` | All models including roles, audit, archive |
| 2 | `prisma/seed.ts` | Create the one Owner account |
| 3 | `lib/encryption.ts` | AES-256-GCM encrypt/decrypt |
| 4 | `lib/rbac.ts` | Role permission helpers |
| 5 | `lib/audit.ts` | Audit log writer |
| 6 | `lib/auth.ts` | NextAuth — re-queries role from DB |
| 7 | `middleware.ts` | Route guards + rate limiting |
| 8 | `server/socket-server.ts` | Custom server + Socket.IO |
| 9 | `lib/prisma.ts` | Prisma singleton |
| 10 | `lib/validators/` | Zod schemas (no role/status from client) |
| 11 | `app/layout.tsx` | Root providers |
| 12 | `components/layout/Sidebar.tsx` | Role-aware navigation |
