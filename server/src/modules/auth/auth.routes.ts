import fs from 'fs';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { Router, Request, Response, NextFunction, CookieOptions } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { RowDataPacket } from 'mysql2';
import { pool, withTransaction } from '../../config/db';
import { env } from '../../config/env';
import { AppError } from '../../middlewares/error.middleware';
import { authenticate } from '../../middlewares/auth.middleware';
import { uploadAvatar, uploadRegistration } from '../../middlewares/upload.middleware';
import {
  generateOpaqueToken,
  hashPassword,
  hashToken,
  signAccessToken,
  verifyPassword,
  Role,
} from '../../utils/security.utils';
import {
  hasActiveCode,
  issueVerification,
  resendCooldownRemaining,
  resendVerification,
  verifyWithCode,
  verifyWithToken,
} from './verification.service';
import { normalizeBhutanPhone } from './sms.service';

const router = Router();

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

const REFRESH_COOKIE = 'nw_rt';
const REFRESH_GRACE_MS = 10_000;

interface UserRow extends RowDataPacket {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  password_hash: string;
  role: Role;
  avatar_url: string | null;
  dzongkhag: string;
  address: string;
  is_active: number;
  is_verified: number;
  verification_code_hash: string | null;
  verification_sent_at: Date | null;
  token_expires_at: Date | null;
}

const USER_COLUMNS = `u.id, u.full_name, u.email, u.phone, u.password_hash, u.role, u.avatar_url, u.dzongkhag, u.address,
  u.is_active, u.is_verified, u.verification_code_hash, u.verification_sent_at, u.token_expires_at`;

async function findUserById(id: string): Promise<UserRow | undefined> {
  const [rows] = await pool.query<UserRow[]>(`SELECT ${USER_COLUMNS} FROM users u WHERE u.id = ? LIMIT 1`, [id]);
  return rows[0];
}

function serializeUser(u: UserRow) {
  return {
    id: u.id,
    fullName: u.full_name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    isEmailVerified: !!u.is_verified,
    avatarUrl: u.avatar_url,
    dzongkhag: u.dzongkhag,
    address: u.address,
  };
}

const refreshCookieOptions = (maxAgeMs?: number): CookieOptions => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: env.NODE_ENV === 'production',
  path: '/api/auth',
  ...(maxAgeMs ? { maxAge: maxAgeMs } : {}),
});

/** Creates a session for a VERIFIED user: access token in the body, rotating refresh token in an HttpOnly cookie. */
async function startSession(res: Response, user: UserRow): Promise<string> {
  if (!user.is_verified) throw new AppError('Verify your registered email address to continue.', 403, 'EMAIL_NOT_VERIFIED');
  const maxAge = env.JWT_REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000;
  const raw = generateOpaqueToken();
  await pool.execute('INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)', [
    uuidv4(),
    user.id,
    hashToken(raw),
    new Date(Date.now() + maxAge),
  ]);
  res.cookie(REFRESH_COOKIE, raw, refreshCookieOptions(maxAge));
  return signAccessToken({ sub: user.id, email: user.email, role: user.role, verified: true });
}

async function sendPasswordResetEmail(toEmail: string, fullName: string, otp: string) {
  const provider = (process.env.EMAIL_PROVIDER || 'smtp').toLowerCase();
  if (provider === 'console') {
    console.log(`[password-reset] OTP for ${toEmail}: ${otp}`);
    return;
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: process.env.MAIL_FROM || `"NestWell.BT" <${process.env.SMTP_USER}>`,
    to: toEmail,
    subject: 'NestWell.BT — Password Reset Verification Code',
    text: `Hello ${fullName || 'there'},\n\nYour NestWell.BT password reset verification code is: ${otp}\n\nThis code expires in 10 minutes. If you did not request a password reset, please ignore this email.`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px;">
        <h2 style="margin: 0 0 12px; color: #111827;">Reset your NestWell.BT password</h2>
        <p style="color: #4b5563; font-size: 14px; line-height: 1.5;">
          Hello ${fullName || 'there'},<br/>
          Use the 6-digit verification code below to reset your password. It expires in <strong>10 minutes</strong>.
        </p>
        <div style="margin: 24px 0; padding: 16px; background: #f3f4f6; border-radius: 10px; text-align: center; font-size: 28px; font-weight: 700; letter-spacing: 6px; color: #111827;">
          ${otp}
        </div>
        <p style="color: #6b7280; font-size: 12px;">If you did not request this code, you can safely ignore this email.</p>
      </div>
    `,
  });
}

const limiter = (windowMs: number, max: number, message: string) =>
  rateLimit({ windowMs, max, standardHeaders: true, legacyHeaders: false, message: { message, code: 'RATE_LIMITED' } });

const registerLimiter = limiter(60 * 60 * 1000, 10, 'Too many sign-up attempts. Try again in an hour.');
const verifyLimiter = limiter(15 * 60 * 1000, 30, 'Too many verification attempts. Try again in a few minutes.');
const resendLimiter = limiter(60 * 60 * 1000, 6, 'Too many verification emails requested. Try again in an hour.');

/* ------------------------------------------------------------------ */
/* Schemas                                                            */
/* ------------------------------------------------------------------ */

const stringList = z.preprocess((v) => {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    try {
      const parsed = JSON.parse(v);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      /* fall through to comma split */
    }
    return v.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return undefined;
}, z.array(z.string().max(60)).max(20).optional());

const registerSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(160),
  phone: z.string().min(8).max(20),
  password: z.string().min(8).max(128),
  role: z.enum(['PARENT', 'CARETAKER']).default('PARENT'),
  dzongkhag: z.string().trim().min(2).max(80),
  address: z.string().trim().max(255).optional(),
  bio: z.string().max(1500).optional(),
  yearsExperience: z.coerce.number().int().min(0).max(50).optional(),
  monthlyRateBtn: z.coerce.number().min(3000).max(200000).optional(),
  qualifications: z.string().max(255).optional(),
  skills: stringList,
  languages: stringList,
});

const emailField = z.string().trim().toLowerCase().email();

const verifySchema = z
  .object({
    token: z.string().trim().min(32).max(200).optional(),
    email: emailField.optional(),
    code: z.preprocess((v) => (typeof v === 'string' ? v.replace(/\s/g, '') : v), z.string().regex(/^\d{6}$/, 'Enter the 6-digit code.')).optional(),
  })
  .refine((v) => !!v.token || (!!v.email && !!v.code), { message: 'Provide a verification token, or an email and 6-digit code.' });

const resendSchema = z.object({ email: emailField });
const loginSchema = z.object({ email: emailField, password: z.string().min(1) });
const sendOtpSchema = z.object({ email: emailField, phone: z.string().optional() });
const resetPasswordSchema = z.object({
  email: emailField,
  phone: z.string().optional(),
  otp: z.string().trim().length(6),
  newPassword: z.string().min(8).max(128),
});

/* ------------------------------------------------------------------ */
/* POST /auth/register  (+ /register/parent, /register/caretaker)     */
/* Creates an UNVERIFIED account and emails a code + link. No session. */
/* ------------------------------------------------------------------ */

const registrationFiles = uploadRegistration.fields([
  { name: 'idDocument', maxCount: 1 },
  { name: 'certificateDocument', maxCount: 1 },
  { name: 'avatar', maxCount: 1 },
]);

function registerHandler(forcedRole?: 'PARENT' | 'CARETAKER') {
  return async (req: Request, res: Response, next: NextFunction) => {
    const files = (req.files ?? {}) as Record<string, Express.Multer.File[]>;
    const discardUploads = () => Object.values(files).flat().forEach((f) => fs.unlink(f.path, () => undefined));

    try {
      const data = registerSchema.parse({ ...req.body, role: forcedRole ?? req.body?.role });
      const phone = normalizeBhutanPhone(data.phone);
      const idDoc = files.idDocument?.[0];
      const certDoc = files.certificateDocument?.[0];
      const avatar = files.avatar?.[0];

      if (data.role === 'CARETAKER' && !idDoc) {
        throw new AppError('Upload your Citizenship ID (CID) document to register as a caretaker.', 400, 'ID_DOCUMENT_REQUIRED');
      }

      const [existing] = await pool.query<(RowDataPacket & { email: string; is_verified: number })[]>(
        'SELECT email, is_verified FROM users WHERE email = ? OR phone = ? LIMIT 1',
        [data.email, phone]
      );
      if (existing[0]) {
        if (existing[0].email === data.email && !existing[0].is_verified) {
          throw new AppError(
            'This email is already registered but not verified yet. Enter the code we sent, or request a new one.',
            409,
            'EMAIL_UNVERIFIED',
            { email: data.email }
          );
        }
        throw new AppError('An account with this email or phone number already exists.', 409, 'ACCOUNT_EXISTS');
      }

      const userId = uuidv4();
      const passwordHash = await hashPassword(data.password);

      await withTransaction(async (conn) => {
        await conn.execute(
          `INSERT INTO users (id, full_name, email, phone, password_hash, role, is_verified, avatar_url, dzongkhag, address, is_active)
           VALUES (?, ?, ?, ?, ?, ?, FALSE, ?, ?, ?, TRUE)`,
          [
            userId,
            data.fullName,
            data.email,
            phone,
            passwordHash,
            data.role,
            avatar ? `/images/avatars/${avatar.filename}` : null,
            data.dzongkhag,
            data.address ?? '',
          ]
        );

        if (data.role === 'CARETAKER') {
          await conn.execute(
            `INSERT INTO caretaker_profiles
               (user_id, bio, years_experience, qualifications, skills_json, languages_json, monthly_rate_btn,
                verification_status, id_document_path, certificate_document_path, is_available)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, TRUE)`,
            [
              userId,
              data.bio || null,
              data.yearsExperience ?? 1,
              data.qualifications ?? '',
              JSON.stringify(data.skills ?? []),
              JSON.stringify(data.languages?.length ? data.languages : ['Dzongkha', 'English']),
              data.monthlyRateBtn ?? 15000,
              `uploads/${idDoc!.filename}`,
              certDoc ? `uploads/${certDoc.filename}` : null,
            ]
          );
        }
      });

      let emailDelivered = true;
      let expiresAt: Date | null = null;
      try {
        ({ expiresAt } = await issueVerification({ id: userId, email: data.email, full_name: data.fullName }));
      } catch (err) {
        emailDelivered = false;
        console.error('[register] verification email failed:', err);
      }

      res.status(201).json({
        message: emailDelivered
          ? `We sent a verification code to ${data.email}.`
          : 'Your account was created, but we could not send the email. Use "Resend" on the next screen.',
        email: data.email,
        requiresVerification: true,
        emailDelivered,
        expiresAt,
        resendAvailableInSeconds: emailDelivered ? env.EMAIL_RESEND_COOLDOWN_SECONDS : 0,
      });
    } catch (err: any) {
      discardUploads();
      if (err?.code === 'ER_DUP_ENTRY') {
        return next(new AppError('An account with this email or phone number already exists.', 409, 'ACCOUNT_EXISTS'));
      }
      next(err);
    }
  };
}

router.post('/register', registerLimiter, registrationFiles, registerHandler());
router.post('/register/parent', registerLimiter, registrationFiles, registerHandler('PARENT'));
router.post('/register/caretaker', registerLimiter, registrationFiles, registerHandler('CARETAKER'));

/* ------------------------------------------------------------------ */
/* POST /auth/verify-email   { token } | { email, code }               */
/* ------------------------------------------------------------------ */

router.post('/verify-email', verifyLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = verifySchema.parse(req.body);
    const verified = body.token ? await verifyWithToken(body.token) : await verifyWithCode(body.email!, body.code!);

    const user = (await findUserById(verified.id))!;
    const accessToken = await startSession(res, user);
    res.json({ message: 'Email verified. Welcome to NestWell.BT.', accessToken, user: serializeUser(user) });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/* POST /auth/resend-verification   { email }                          */
/* ------------------------------------------------------------------ */

router.post('/resend-verification', resendLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = resendSchema.parse(req.body);
    const { retryAfterSeconds } = await resendVerification(email);
    res.json({
      message: 'If that address has an unverified account, a new code is on its way.',
      retryAfterSeconds,
      expiresInMinutes: env.EMAIL_VERIFICATION_TTL_MINUTES,
    });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/* POST /auth/login  (progressive lockout: 3 fails -> 1 min, then 5)   */
/* ------------------------------------------------------------------ */

interface LoginAttemptRecord {
  failedCount: number;
  lockoutTier: number;
  lockedUntil: number | null;
}
const loginAttempts = new Map<string, LoginAttemptRecord>();
const DUMMY_HASH = '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4J/HS.iK72';

router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const now = Date.now();
    const record = loginAttempts.get(email) ?? { failedCount: 0, lockoutTier: 0, lockedUntil: null };

    if (record.lockedUntil && record.lockedUntil > now) {
      const retryAfterSeconds = Math.ceil((record.lockedUntil - now) / 1000);
      return res.status(429).json({
        message: `Too many failed login attempts. Try again in ${retryAfterSeconds} seconds.`,
        code: 'LOCKED_OUT',
        retryAfterSeconds,
      });
    }

    const [rows] = await pool.query<UserRow[]>(`SELECT ${USER_COLUMNS} FROM users u WHERE u.email = ? LIMIT 1`, [email]);
    const user = rows[0];
    const validPassword = await verifyPassword(password, user ? user.password_hash : DUMMY_HASH);

    if (!user || !validPassword) {
      record.failedCount += 1;
      if (record.lockoutTier === 0 && record.failedCount >= 3) {
        Object.assign(record, { lockoutTier: 1, failedCount: 0, lockedUntil: now + 60_000 });
        loginAttempts.set(email, record);
        return res.status(429).json({
          message: 'Account temporarily locked for 1 minute after 3 failed attempts.',
          code: 'LOCKED_OUT',
          retryAfterSeconds: 60,
        });
      }
      if (record.lockoutTier >= 1) {
        Object.assign(record, { lockoutTier: record.lockoutTier + 1, failedCount: 0, lockedUntil: now + 300_000 });
        loginAttempts.set(email, record);
        return res.status(429).json({
          message: 'Account locked for 5 minutes due to repeated failed attempts.',
          code: 'LOCKED_OUT',
          retryAfterSeconds: 300,
        });
      }
      loginAttempts.set(email, record);
      const remaining = 3 - record.failedCount;
      return res.status(401).json({
        message: `Invalid email or password. ${remaining} attempt${remaining === 1 ? '' : 's'} left before 1-minute lockout.`,
        code: 'INVALID_CREDENTIALS',
      });
    }

    loginAttempts.delete(email);

    if (!user.is_active) throw new AppError('This account has been deactivated. Contact support.', 403, 'ACCOUNT_DISABLED');

    if (!user.is_verified) {
      let retryAfterSeconds = resendCooldownRemaining(user.verification_sent_at);
      if (!hasActiveCode(user) && retryAfterSeconds === 0) {
        try {
          await issueVerification(user);
          retryAfterSeconds = env.EMAIL_RESEND_COOLDOWN_SECONDS;
        } catch (err) {
          console.error('[login] could not send verification email:', err);
        }
      }
      throw new AppError(
        'Verify your registered email address before signing in. We sent you a code.',
        403,
        'EMAIL_NOT_VERIFIED',
        { email: user.email, retryAfterSeconds }
      );
    }

    const accessToken = await startSession(res, user);
    res.json({ user: serializeUser(user), accessToken });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/* POST /auth/refresh  — rotating HttpOnly cookie, DB-backed           */
/* ------------------------------------------------------------------ */

router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const raw: string | undefined = req.cookies?.[REFRESH_COOKIE];
    if (!raw) throw new AppError('Not signed in.', 401);

    const [rows] = await pool.query<(UserRow & { rt_id: string; revoked: number; revoked_at: Date | null; rt_expires: Date })[]>(
      `SELECT rt.id AS rt_id, rt.revoked, rt.revoked_at, rt.expires_at AS rt_expires, ${USER_COLUMNS}
         FROM refresh_tokens rt JOIN users u ON u.id = rt.user_id
        WHERE rt.token_hash = ? LIMIT 1`,
      [hashToken(raw)]
    );
    const row = rows[0];
    const reject = () => {
      res.clearCookie(REFRESH_COOKIE, refreshCookieOptions());
      return new AppError('Session expired. Please sign in again.', 401);
    };

    if (!row) throw reject();
    if (row.revoked) {
      const justRotated = row.revoked_at && Date.now() - new Date(row.revoked_at).getTime() < REFRESH_GRACE_MS;
      if (justRotated) throw new AppError('Session refresh already in progress.', 401, 'REFRESH_RACE');
      await pool.execute('UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = ?', [row.id]);
      throw reject();
    }
    if (new Date(row.rt_expires).getTime() < Date.now() || !row.is_active || !row.is_verified) throw reject();

    const [rotated]: any = await pool.execute('UPDATE refresh_tokens SET revoked = TRUE, revoked_at = ? WHERE id = ? AND revoked = FALSE', [new Date(), row.rt_id]);
    if (rotated.affectedRows !== 1) throw reject();

    const accessToken = await startSession(res, row);
    res.json({ accessToken, user: serializeUser(row) });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const raw: string | undefined = req.cookies?.[REFRESH_COOKIE];
    if (raw) await pool.execute('UPDATE refresh_tokens SET revoked = TRUE WHERE token_hash = ?', [hashToken(raw)]);
    res.clearCookie(REFRESH_COOKIE, refreshCookieOptions());
    res.json({ message: 'Signed out.' });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/* GET /auth/me, PATCH /auth/me/avatar                                 */
/* ------------------------------------------------------------------ */

router.get('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await findUserById(req.user!.sub);
    if (!user) throw new AppError('User not found', 404);
    res.json({ user: serializeUser(user) });
  } catch (err) {
    next(err);
  }
});

router.patch('/me/avatar', authenticate, uploadAvatar.single('avatar'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    let avatarUrl: string | null;
    if (req.file) avatarUrl = `/images/avatars/${req.file.filename}`;
    else if (req.body?.removeAvatar) avatarUrl = null;
    else throw new AppError('Choose an image to upload.', 400);

    await pool.execute('UPDATE users SET avatar_url = ? WHERE id = ?', [avatarUrl, req.user!.sub]);
    const user = (await findUserById(req.user!.sub))!;
    res.json({ avatarUrl, user: serializeUser(user) });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/* Password reset via Email OTP                                        */
/* ------------------------------------------------------------------ */

interface OtpRecord {
  otp: string;
  userId: string;
  expiresAt: number;
}
const passwordResetOtps = new Map<string, OtpRecord>();

router.post('/forgot-password/send-otp', verifyLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = sendOtpSchema.parse(req.body);

    const [rows] = await pool.query<(RowDataPacket & { id: string; full_name: string; phone: string })[]>(
      'SELECT id, full_name, phone FROM users WHERE email = ? LIMIT 1',
      [data.email]
    );
    if (rows.length === 0) {
      throw new AppError('No account found with that registered email address.', 404);
    }

    // If the frontend still sends a phone field, validate it only when non-empty
    if (data.phone && data.phone.trim()) {
      const phone = normalizeBhutanPhone(data.phone);
      if (normalizeBhutanPhone(rows[0].phone) !== phone) {
        throw new AppError('The phone number does not match the registered +975 number for this account.', 400);
      }
    }

    const otp = crypto.randomInt(100000, 1000000).toString();
    passwordResetOtps.set(data.email, {
      otp,
      userId: rows[0].id,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });

    await sendPasswordResetEmail(data.email, rows[0].full_name, otp);

    res.json({ message: `A 6-digit verification code has been sent to ${data.email}.` });
  } catch (err) {
    next(err);
  }
});

router.post('/reset-password', verifyLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = resetPasswordSchema.parse(req.body);
    const entry = passwordResetOtps.get(data.email);

    if (!entry) {
      throw new AppError('No active verification code request found. Please request a new code.', 400);
    }
    if (Date.now() > entry.expiresAt) {
      passwordResetOtps.delete(data.email);
      throw new AppError('This code has expired. Request a new code to continue.', 400);
    }
    if (entry.otp !== data.otp.trim()) {
      throw new AppError('Incorrect 6-digit code. Please check your email inbox and try again.', 400);
    }

    await pool.execute('UPDATE users SET password_hash = ? WHERE id = ?', [await hashPassword(data.newPassword), entry.userId]);
    await pool.execute('UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = ?', [entry.userId]);
    passwordResetOtps.delete(data.email);
    loginAttempts.delete(data.email);

    res.json({ message: 'Password reset successfully. You can now sign in with your new password.' });
  } catch (err) {
    next(err);
  }
});

export default router;