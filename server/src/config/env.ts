import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

// Backwards compatibility: older .env files used CLIENT_URL and JWT_REFRESH_EXPIRES_IN ("14d").
const source: NodeJS.ProcessEnv = { ...process.env };
source.CLIENT_ORIGIN ??= source.CLIENT_URL;
if (!source.JWT_REFRESH_EXPIRES_DAYS && source.JWT_REFRESH_EXPIRES_IN) {
  const days = parseInt(source.JWT_REFRESH_EXPIRES_IN, 10);
  if (Number.isFinite(days)) source.JWT_REFRESH_EXPIRES_DAYS = String(days);
}

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().default(5001),
    CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),
    DB_HOST: z.string().default('localhost'),
    DB_PORT: z.coerce.number().default(3306),
    DB_USER: z.string().default('root'),
    DB_PASSWORD: z.string().default(''),
    DB_NAME: z.string().default('nestwell_bt'),
    DB_SSL: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
    JWT_ACCESS_SECRET: z.string().min(32).default('dev_access_secret_key_change_in_production_64chars_long_123456'),
    JWT_REFRESH_SECRET: z.string().min(32).default('dev_refresh_secret_key_change_in_production_64chars_long_654321'),
    JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
    JWT_REFRESH_EXPIRES_DAYS: z.coerce.number().default(14),

    // --- Email verification ---
    EMAIL_PROVIDER: z.enum(['smtp', 'console']).default('console'),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().default(587),
    SMTP_SECURE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    MAIL_FROM: z.string().default('NestWell.BT <no-reply@nestwell.bt>'),
    EMAIL_VERIFICATION_TTL_MINUTES: z.coerce.number().int().min(5).max(1440).default(30),
    EMAIL_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().min(10).max(3600).default(60),
    EMAIL_VERIFY_MAX_ATTEMPTS: z.coerce.number().int().min(3).max(10).default(5),
  })
  .superRefine((cfg, ctx) => {
    if (cfg.EMAIL_PROVIDER === 'smtp' && !cfg.SMTP_HOST) {
      ctx.addIssue({ code: 'custom', path: ['SMTP_HOST'], message: 'SMTP_HOST is required when EMAIL_PROVIDER=smtp' });
    }
    if (cfg.NODE_ENV === 'production' && cfg.EMAIL_PROVIDER === 'console') {
      ctx.addIssue({
        code: 'custom',
        path: ['EMAIL_PROVIDER'],
        message: 'EMAIL_PROVIDER=console only prints codes to the log and cannot be used in production',
      });
    }
  });

const parsed = envSchema.safeParse(source);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
