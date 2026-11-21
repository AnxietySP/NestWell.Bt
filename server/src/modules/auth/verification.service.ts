import { RowDataPacket } from 'mysql2';
import { PoolConnection } from 'mysql2/promise';
import { pool } from '../../config/db';
import { env } from '../../config/env';
import { AppError } from '../../middlewares/error.middleware';
import { generateOpaqueToken, generateOtp, hashOtp, hashToken, safeEqualHex } from '../../utils/security.utils';
import { sendVerificationEmail } from './email.service';

type Executor = Pick<PoolConnection, 'execute' | 'query'>;

export interface VerificationUserRow extends RowDataPacket {
  id: string;
  full_name: string;
  email: string;
  role: 'PARENT' | 'CARETAKER' | 'ADMIN';
  is_active: number;
  is_verified: number;
  verification_code_hash: string | null;
  verification_attempts: number;
  verification_sent_at: Date | null;
  token_expires_at: Date | null;
}

const COLUMNS =
  'id, full_name, email, role, is_active, is_verified, verification_code_hash, verification_attempts, verification_sent_at, token_expires_at';

export function resendCooldownRemaining(sentAt: Date | null): number {
  if (!sentAt) return 0;
  const elapsed = (Date.now() - new Date(sentAt).getTime()) / 1000;
  return Math.max(0, Math.ceil(env.EMAIL_RESEND_COOLDOWN_SECONDS - elapsed));
}

export function hasActiveCode(user: Pick<VerificationUserRow, 'verification_code_hash' | 'token_expires_at'>): boolean {
  return !!user.verification_code_hash && !!user.token_expires_at && new Date(user.token_expires_at).getTime() > Date.now();
}

/**
 * Generates a fresh link token + 6-digit code (replacing any previous pair), stores only
 * their hashes, and emails the plaintext values to the user's registered address.
 */
export async function issueVerification(
  user: { id: string; email: string; full_name: string },
  executor: Executor = pool
): Promise<{ expiresAt: Date }> {
  const token = generateOpaqueToken();
  const code = generateOtp();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + env.EMAIL_VERIFICATION_TTL_MINUTES * 60_000);

  await executor.execute(
    `UPDATE users
        SET verification_token = ?, verification_code_hash = ?, verification_attempts = 0,
            verification_sent_at = ?, token_expires_at = ?
      WHERE id = ?`,
    [hashToken(token), hashOtp(user.id, code), now, expiresAt, user.id]
  );

  const link = `${env.CLIENT_ORIGIN.replace(/\/$/, '')}/verify-email?token=${token}`;
  await sendVerificationEmail({
    to: user.email,
    name: user.full_name,
    code,
    link,
    expiresInMinutes: env.EMAIL_VERIFICATION_TTL_MINUTES,
  });

  return { expiresAt };
}

/** Marks the account verified and burns the token and code so neither can be replayed. */
async function finalize(userId: string): Promise<VerificationUserRow> {
  const [result]: any = await pool.execute(
    `UPDATE users
        SET is_verified = TRUE, email_verified_at = ?, verification_token = NULL,
            verification_code_hash = NULL, verification_attempts = 0, token_expires_at = NULL
      WHERE id = ? AND is_verified = FALSE`,
    [new Date(), userId]
  );
  if (result.affectedRows !== 1) {
    // Lost a race with a concurrent verification of the same account; the account is verified either way.
  }
  const [rows] = await pool.query<VerificationUserRow[]>(`SELECT ${COLUMNS} FROM users WHERE id = ? LIMIT 1`, [userId]);
  return rows[0];
}

function assertCanActivate(user: VerificationUserRow) {
  if (!user.is_active) throw new AppError('This account has been deactivated. Contact support.', 403, 'ACCOUNT_DISABLED');
}

/** One-click path: the token from the emailed link. */
export async function verifyWithToken(token: string): Promise<VerificationUserRow> {
  const [rows] = await pool.query<(VerificationUserRow & { verification_token: string })[]>(
    `SELECT ${COLUMNS}, verification_token FROM users WHERE verification_token = ? LIMIT 1`,
    [hashToken(token)]
  );
  const user = rows[0];
  if (!user) {
    throw new AppError(
      'This verification link is invalid or has already been used. If you already verified, sign in.',
      400,
      'INVALID_TOKEN'
    );
  }
  assertCanActivate(user);
  if (!user.token_expires_at || new Date(user.token_expires_at).getTime() < Date.now()) {
    throw new AppError('This verification link has expired. Request a new one.', 410, 'TOKEN_EXPIRED', {
      email: user.email,
    });
  }
  return finalize(user.id);
}

/** Manual path: email + 6-digit code. Every guess consumes an attempt before it is compared. */
export async function verifyWithCode(email: string, code: string): Promise<VerificationUserRow> {
  const [rows] = await pool.query<VerificationUserRow[]>(`SELECT ${COLUMNS} FROM users WHERE email = ? LIMIT 1`, [email]);
  const user = rows[0];
  const invalid = () => new AppError('That code is not valid. Check the email and try again.', 400, 'INVALID_CODE');

  if (!user || user.is_verified || !user.verification_code_hash) throw invalid();
  assertCanActivate(user);

  if (!user.token_expires_at || new Date(user.token_expires_at).getTime() < Date.now()) {
    throw new AppError('This code has expired. Request a new one.', 410, 'TOKEN_EXPIRED', { email: user.email });
  }

  // Atomic attempt counter: concurrent guesses cannot exceed the limit.
  const [bump]: any = await pool.execute(
    'UPDATE users SET verification_attempts = verification_attempts + 1 WHERE id = ? AND verification_attempts < ?',
    [user.id, env.EMAIL_VERIFY_MAX_ATTEMPTS]
  );
  if (bump.affectedRows !== 1) {
    throw new AppError('Too many incorrect attempts. Request a new code.', 429, 'TOO_MANY_ATTEMPTS', { email: user.email });
  }

  if (!safeEqualHex(hashOtp(user.id, code), user.verification_code_hash)) {
    const left = Math.max(0, env.EMAIL_VERIFY_MAX_ATTEMPTS - (user.verification_attempts + 1));
    throw new AppError(
      left > 0
        ? `That code is not correct. ${left} ${left === 1 ? 'attempt' : 'attempts'} left.`
        : 'That code is not correct. Request a new code.',
      400,
      'INVALID_CODE',
      { attemptsLeft: left }
    );
  }
  return finalize(user.id);
}

/**
 * Resend with a per-account cooldown. Returns the same shape for unknown and already
 * verified addresses so the endpoint cannot be used to discover which emails are registered.
 */
export async function resendVerification(email: string): Promise<{ retryAfterSeconds: number }> {
  const [rows] = await pool.query<VerificationUserRow[]>(`SELECT ${COLUMNS} FROM users WHERE email = ? LIMIT 1`, [email]);
  const user = rows[0];
  const cooldown = env.EMAIL_RESEND_COOLDOWN_SECONDS;

  if (!user || user.is_verified || !user.is_active) return { retryAfterSeconds: cooldown };

  const remaining = resendCooldownRemaining(user.verification_sent_at);
  if (remaining > 0) {
    throw new AppError(`Please wait ${remaining} seconds before requesting another email.`, 429, 'RESEND_COOLDOWN', {
      retryAfterSeconds: remaining,
    });
  }
  try {
    await issueVerification(user);
  } catch (err) {
    console.error('[verification] email delivery failed:', err);
    throw new AppError('We could not send the email right now. Try again in a few minutes.', 502, 'EMAIL_DELIVERY_FAILED');
  }
  return { retryAfterSeconds: cooldown };
}
