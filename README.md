# NestWell.BT — Trusted Long-Term Childcare Booking Platform in Bhutan

NestWell.BT connects families across Bhutan (Thimphu, Paro, Phuentsholing, Punakha, Gelephu, Bumthang, Samdrup Jongkhar, and beyond) with verified, trustworthy caretakers and nannies for stable, long-term childcare commitments (minimum 6 calendar months).

## Architecture Overview
- **Frontend (`client/`)**: React 18, Vite, TypeScript, Tailwind CSS, React Router v7, React Hook Form + Zod, Framer Motion, Lucide React.
- **Backend (`server/`)**: Node.js, Express, TypeScript, MySQL 8 (`mysql2/promise` with ACID transactions), JWT access tokens + rotating HttpOnly refresh-token cookie, Nodemailer (SMTP) for email, Multer file uploads, Helmet, rate limiting.
- **Database (`server/src/database/`)**: Relational schema (`schema.sql`), realistic Bhutanese seed data (`seed.sql`), and incremental migrations (`migrations/`).

## Core Business Rules Implemented
1. **Six-Month Minimum Contract Rule**: Enforced at UI date/duration selection, Zod validation, Express API service layer, and MySQL `CHECK (duration_months >= 6)` constraint.
2. **Separated Billing Cadence**: Contract duration (6–24 months) is decoupled from payment schedule (`MONTHLY_INSTALLMENT` or `QUARTERLY_MILESTONE`), supported by an extensible Bhutan Payment Gateway adapter (`RMA / BOBL / BDBL` ready).
3. **Strict Verification Workflow**: Caretakers remain unverified (`PENDING`) until an Administrator reviews their uploaded Citizenship/ID document and approves their profile.
4. **Registered-Email Verification**: No account can sign in, and no session is issued, until the email address used at sign-up is confirmed (see [Email Verification](#email-verification)).
5. **Overlap Prevention**: Transactional date-overlap locks prevent double-booking a caretaker across overlapping contract windows.
6. **One Live Contract Per Child**: When a parent confirms a contract, every other `PENDING` or `ACCEPTED` request for the same child with overlapping dates is removed in the same transaction, and the affected caretakers are notified.
7. **Zero-Flash Light & Dark Mode**: OS preference detection, persistent `localStorage` state, and pre-paint inline theme script.

## Quick Start

### 1. Database Setup
Fresh install:
```bash
mysql -u root -p < server/src/database/schema.sql
mysql -u root -p < server/src/database/seed.sql
```
Existing database: run `server/src/database/migrations/002_email_verification.sql` once (read its header first). A server started against a database without these columns fails registration with `Unknown column 'is_verified'`.

### 2. Backend Setup
```bash
cd server
cp .env.example .env
# Fill in DB_*, JWT secrets, and the email settings below
npm install
npm run dev
```

### 3. Frontend Setup
```bash
cd client
npm install
npm run dev
```
The Vite dev server proxies `/api` to the backend. The target is `http://localhost:5001` by default; set `API_TARGET` to override it. Keep it in line with `PORT` in `server/.env`.

## Environment Variables (`server/.env`)

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `5001` | API port. Must match the Vite proxy target. |
| `CLIENT_ORIGIN` | `http://localhost:5173` | CORS origin, and the base URL used in emailed verification links. (`CLIENT_URL` is still accepted.) |
| `DB_HOST` `DB_PORT` `DB_USER` `DB_PASSWORD` `DB_NAME` | — | MySQL connection. |
| `DB_SSL` | `true` | Cloud databases (e.g. Aiven) need TLS. Set `false` for a local MySQL without TLS. |
| `JWT_ACCESS_SECRET` `JWT_REFRESH_SECRET` | — | At least 32 characters each. Use long random values in production. |
| `JWT_ACCESS_EXPIRES_IN` | `15m` | Access token lifetime. |
| `JWT_REFRESH_EXPIRES_DAYS` | `14` | Refresh cookie and session lifetime. |
| `EMAIL_PROVIDER` | `console` | `smtp` sends real email. `console` prints the code and link in the server log (development only; the server refuses to start with it in production). |
| `MAIL_FROM` | `NestWell.BT <no-reply@nestwell.bt>` | Sender shown on verification emails. |
| `SMTP_HOST` `SMTP_PORT` `SMTP_SECURE` `SMTP_USER` `SMTP_PASS` | `587`, `false` | SMTP server. Use `SMTP_SECURE=true` with port 465, `false` with 587 (STARTTLS). |
| `EMAIL_VERIFICATION_TTL_MINUTES` | `30` | How long a code and link stay valid. |
| `EMAIL_RESEND_COOLDOWN_SECONDS` | `60` | Minimum gap between verification emails to the same account. |
| `EMAIL_VERIFY_MAX_ATTEMPTS` | `5` | Wrong codes allowed before a new code is required. |
| `TWILIO_*` or `SMS_GATEWAY_URL` `SMS_API_KEY` | — | Optional. Only the phone-OTP password reset uses SMS. |

**SMTP example (Gmail):** turn on 2-Step Verification, create an *App Password*, then set `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_SECURE=false`, `SMTP_USER=you@gmail.com`, `SMTP_PASS=<16-character app password>`, `EMAIL_PROVIDER=smtp`. Your normal Gmail password will not work.

## Authentication & Security

### Email Verification
Accounts are inactive until the **registered email** is confirmed. No session is issued at sign-up.

| Endpoint | Purpose |
| --- | --- |
| `POST /api/auth/register` | Creates an unverified account and emails a 6-digit code **and** a one-click link. (`/register/parent` and `/register/caretaker` remain as aliases.) |
| `POST /api/auth/verify-email` | `{ token }` from the link, or `{ email, code }`. On success marks the user verified and starts a session. |
| `POST /api/auth/resend-verification` | `{ email }`. Per-account cooldown plus an IP limit. Gives the same reply for unknown or already-verified emails. |
| `POST /api/auth/login` | Correct password with an unverified email returns `403 EMAIL_NOT_VERIFIED` (and a fresh code if none is active). |

How it works:
- Only hashes are stored: SHA-256 for the link token, a keyed HMAC for the 6-digit code.
- Codes and links are single-use and expire after `EMAIL_VERIFICATION_TTL_MINUTES`.
- Every wrong guess consumes one of `EMAIL_VERIFY_MAX_ATTEMPTS`; after that a new code is required.
- Access tokens carry a `verified` claim that the `authenticate` middleware enforces. The refresh endpoint re-checks the database.
- The frontend verification page supports both the emailed link and manual code entry, with expired, locked and invalid-link states and a resend button with a countdown that survives page reloads.

### Sessions
- Access token (default 15 minutes) is held in memory by the client.
- Refresh token is an opaque, hashed, **rotating** HttpOnly cookie (`nw_rt`, path `/api/auth`, default 14 days). Refresh calls are single-flighted on the client.
- Replaying an old refresh token after a 10-second grace window revokes every session for that user.
- Logout and password reset revoke refresh tokens server-side.

### Login Lockout (Login Timeout)
Failed sign-ins are tracked per email address:

| Failures | Result |
| --- | --- |
| 3 wrong passwords | Locked for **1 minute** (`429`, with `retryAfterSeconds`) |
| Any further failure after unlocking | Locked for **5 minutes** |
| Successful login | Counter reset |

The sign-in page shows a live countdown and disables the button while locked. An unverified account with the right password is **not** counted as a failure; it is sent to the verification screen.

> The lockout counter lives in server memory, so it resets on restart and is per-process. If you run more than one server instance, move it to Redis or the database.

### Rate Limits

| Scope | Limit |
| --- | --- |
| All API routes | 300 requests / 15 min / IP |
| `POST /auth/register` | 10 / hour / IP |
| `POST /auth/verify-email`, password reset | 30 / 15 min / IP |
| `POST /auth/resend-verification` | 6 / hour / IP, plus the per-account cooldown |

If the API runs behind a reverse proxy, configure Express `trust proxy` so limits apply to real client IPs.

### Password Reset
Reset codes are sent by SMS to the phone number on the account (Twilio or a custom gateway; see `.env.example`). A successful reset signs the user out everywhere.

## Notifications
Each user can read, mark as read, and delete their own notifications.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/notifications` | List the signed-in user's notifications. |
| `PATCH /api/notifications/:id/read` · `PATCH /api/notifications/read-all` | Mark one or all as read. |
| `DELETE /api/notifications/:id` | Delete one (scoped to the signed-in user). |
| `DELETE /api/notifications` | Clear all of the signed-in user's notifications. |

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Unknown column 'is_verified' in 'field list'` on sign-up | The migration has not been applied. Run `002_email_verification.sql`. |
| No verification email arrives | Check `EMAIL_PROVIDER=smtp` and the `SMTP_*` values. For Gmail use an app password. Check spam. With `console` the code is printed in the server terminal. |
| Existing accounts can no longer sign in | They have `is_verified = 0`. Mark them verified in SQL, or let them verify through the login flow. |
| `Cannot reach NestWell.BT` in the browser | The API is not running, or `API_TARGET` / `PORT` do not match. |
| Locked out during testing | Wait out the countdown, or restart the server (the counter is in memory). |

## Demo Seed Accounts (Password for Admin: `NestWell@2026`)
- **Admin**: `admin@nestwell.bt`

## Demo Seed Accounts (Password for Parents and Caretakers `123456789`)
- **Parent**: `anxiety.sonam13@gmail.com`
- **Verified Caretaker**: `sonamphuntshoop@gmail.com`

## Known Limitations
- Uploaded ID documents are currently served from a public `/uploads` path. Serve them only through an authenticated admin route before going live.
- Login lockout and password-reset codes are stored in memory (see above).
- `EMAIL_PROVIDER=console` is for local development only.