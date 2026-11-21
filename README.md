# NestWell.BT — Trusted Long-Term Childcare Booking Platform in Bhutan

NestWell.BT connects families across Bhutan (Thimphu, Paro, Phuentsholing, Punakha, Gelephu, Bumthang, Samdrup Jongkhar, and beyond) with verified, trustworthy caretakers and nannies for stable, long-term childcare commitments (minimum 6 calendar months).

## Architecture Overview
- **Frontend (`client/`)**: React 18, Vite, TypeScript, Tailwind CSS, React Router v6, TanStack Query, React Hook Form + Zod, Framer Motion, Lucide React.
- **Backend (`server/`)**: Node.js, Express, TypeScript, MySQL 8 (`mysql2/promise` with ACID transactions), JWT Access + HttpOnly Refresh Token rotation, Multer secure file uploads, Helmet, Rate Limiting.
- **Database (`server/src/database/`)**: Relational schema (`schema.sql`) and realistic Bhutanese seed data (`seed.sql`).

## Core Business Rules Implemented
1. **Six-Month Minimum Contract Rule**: Enforced at UI date/duration selection, Zod validation, Express API service layer, and MySQL `CHECK (duration_months >= 6)` constraint.
2. **Separated Billing Cadence**: Contract duration (6–24 months) is decoupled from payment schedule (`MONTHLY_INSTALLMENT` or `QUARTERLY_MILESTONE`), supported by an extensible Bhutan Payment Gateway adapter (`RMA / BOBL / BDBL` ready).
3. **Strict Verification Workflow**: Caretakers remain unverified (`PENDING`) until an Administrator reviews their uploaded Citizenship/ID document and approves their profile.
4. **Overlap Prevention**: Transactional date-overlap locks prevent double-booking a caretaker across overlapping contract windows.
5. **Zero-Flash Light & Dark Mode**: OS preference detection, persistent `localStorage` state, and pre-paint inline theme script.

## Quick Start

### 1. Database Setup
Fresh install:
```bash
mysql -u root -p < server/src/database/schema.sql
mysql -u root -p < server/src/database/seed.sql
```
Existing database: run `server/src/database/migrations/002_email_verification.sql` once (read its header first).

### 2. Backend Setup
```bash
cd server
cp .env.example .env
# Update DB_PASSWORD and JWT secrets in .env (set DB_SSL=false for a local MySQL without TLS)
# EMAIL_PROVIDER=console prints verification codes in the server log; use smtp for real email
npm install
npm run dev
```

### 3. Frontend Setup
```bash
cd client
npm install
npm run dev
```

## Email Verification
Accounts are inactive until the **registered email** is confirmed. No session is issued at sign-up.

| Endpoint | Purpose |
| --- | --- |
| `POST /api/auth/register` | Creates an unverified account, emails a 6-digit code **and** a one-click link. (`/register/parent` and `/register/caretaker` remain as aliases.) |
| `POST /api/auth/verify-email` | `{ token }` from the link, or `{ email, code }`. On success marks the user verified and starts a session. |
| `POST /api/auth/resend-verification` | `{ email }`. 60 s per-account cooldown plus 6/hour/IP. Same reply for unknown or already-verified emails. |
| `POST /api/auth/login` | Correct password + unverified email → `403 EMAIL_NOT_VERIFIED` (and a fresh code if none is active). |

Security notes: only hashes are stored (SHA-256 for the link token, keyed HMAC for the code); codes expire after `EMAIL_VERIFICATION_TTL_MINUTES`; each wrong guess consumes one of `EMAIL_VERIFY_MAX_ATTEMPTS`; access tokens carry a `verified` claim that `authenticate` enforces, and refresh re-checks the database.

## Demo Seed Accounts (Password for all: `NestWell@2026`)
- **Admin**: `admin@nestwell.bt`
- **Parent**: `tashi.dorji@example.bt`
- **Verified Caretaker**: `dechen.wangmo@example.bt`
- **Pending Caretaker**: `sonam.choden@example.bt`
