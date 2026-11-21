import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock, Inbox, Loader2, Lock, MailCheck, RefreshCw } from 'lucide-react';
import { api, parseApiError } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { AuthShell } from '../components/shared/AuthShell';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { OtpInput } from '../components/ui/OtpInput';
import { formatCountdown, startCooldown, useCooldown } from '../hooks/useCooldown';

type Status = 'idle' | 'verifying' | 'success' | 'expired' | 'locked' | 'invalid-link';

const codeSchema = z.object({ code: z.string().regex(/^\d{6}$/, 'Enter all 6 digits.') });
const emailSchema = z.object({ email: z.string().trim().email('Enter the email address you registered with.') });

const dashboardFor = (role: string) =>
  role === 'ADMIN' ? '/dashboard/admin' : role === 'CARETAKER' ? '/dashboard/caretaker' : '/dashboard/parent';

const maskEmail = (email: string) => {
  const [name, domain] = email.split('@');
  if (!domain) return email;
  return `${name.slice(0, 2)}${'•'.repeat(Math.max(1, Math.min(name.length - 2, 5)))}@${domain}`;
};

interface LocationState {
  email?: string;
  emailDelivered?: boolean;
}

export function VerifyEmailPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const { user, loginSuccess } = useAuth();

  const token = params.get('token');
  const state = (location.state ?? {}) as LocationState;
  const [email, setEmail] = useState(
    (params.get('email') || state.email || sessionStorage.getItem('nw_pending_email') || '').trim().toLowerCase()
  );

  const [status, setStatus] = useState<Status>('idle');
  const [linkChecking, setLinkChecking] = useState(!!token);
  const [message, setMessage] = useState('');
  const [codeError, setCodeError] = useState('');
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  const [resending, setResending] = useState(false);
  const [notice, setNotice] = useState(state.emailDelivered === false ? 'We could not send the email yet. Use "Resend email" below.' : '');
  const { seconds, start } = useCooldown(email || 'none');

  const codeForm = useForm<z.infer<typeof codeSchema>>({ resolver: zodResolver(codeSchema), defaultValues: { code: '' } });
  const emailForm = useForm<z.infer<typeof emailSchema>>({ resolver: zodResolver(emailSchema), defaultValues: { email: '' } });

  const finish = (accessToken: string, nextUser: Parameters<typeof loginSuccess>[1]) => {
    sessionStorage.removeItem('nw_pending_email');
    setLinkChecking(false);
    loginSuccess(accessToken, nextUser);
    setStatus('success');
    window.setTimeout(() => navigate(dashboardFor(nextUser.role), { replace: true }), 2200);
  };

  const handleFailure = (err: unknown) => {
    const info = parseApiError(err);
    setLinkChecking(false);
    if (info.email) setEmail(info.email);
    switch (info.code) {
      case 'TOKEN_EXPIRED':
        setStatus('expired');
        setMessage(info.message);
        break;
      case 'TOO_MANY_ATTEMPTS':
        setStatus('locked');
        setMessage(info.message);
        break;
      case 'INVALID_TOKEN':
        setStatus('invalid-link');
        setMessage(info.message);
        break;
      default:
        setStatus('idle');
        setCodeError(info.message);
        if (typeof info.attemptsLeft === 'number') setAttemptsLeft(info.attemptsLeft);
        codeForm.setValue('code', '');
        setShakeKey((k) => k + 1);
    }
  };

  // One-click link: /verify-email?token=...  (ref guard: StrictMode runs effects twice in development)
  const linkAttempted = useRef(false);
  useEffect(() => {
    if (!token || linkAttempted.current) return;
    linkAttempted.current = true;
    api
      .post('/auth/verify-email', { token })
      .then(({ data }) => finish(data.accessToken, data.user))
      .catch(handleFailure);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const submitCode = async ({ code }: { code: string }) => {
    setCodeError('');
    setNotice('');
    setStatus('verifying');
    try {
      const { data } = await api.post('/auth/verify-email', { email, code });
      finish(data.accessToken, data.user);
    } catch (err) {
      handleFailure(err);
    }
  };

  const resend = async () => {
    if (!email || seconds > 0) return;
    setResending(true);
    setCodeError('');
    try {
      const { data } = await api.post('/auth/resend-verification', { email });
      start(data.retryAfterSeconds ?? 60);
      setStatus('idle');
      setAttemptsLeft(null);
      setNotice(`A new code is on its way to ${maskEmail(email)}. The old one no longer works.`);
      codeForm.reset({ code: '' });
    } catch (err) {
      const info = parseApiError(err);
      if (info.code === 'RESEND_COOLDOWN' && info.retryAfterSeconds) start(info.retryAfterSeconds);
      setNotice('');
      setCodeError(info.message);
    } finally {
      setResending(false);
    }
  };

  const acceptEmail = ({ email: typed }: z.infer<typeof emailSchema>) => {
    const clean = typed.trim().toLowerCase();
    sessionStorage.setItem('nw_pending_email', clean);
    setEmail(clean);
  };

  // Already signed in and verified: nothing to do here.
  if (user?.isEmailVerified && status !== 'success') return <Navigate to={dashboardFor(user.role)} replace />;

  const resendLabel = seconds > 0 ? `Resend in ${formatCountdown(seconds)}` : 'Resend email';
  const renderResend = (primary = false) => (
    <Button variant={primary ? 'primary' : 'ghost'} size={primary ? 'lg' : 'sm'} onClick={resend} disabled={seconds > 0} isLoading={resending} className={primary ? 'w-full' : ''}>
      {!resending && <RefreshCw className="h-4 w-4" aria-hidden />}
      {resendLabel}
    </Button>
  );

  return (
    <AuthShell>
      <AnimatePresence mode="wait" initial={false}>
        {status === 'success' ? (
          <motion.div key="success" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center" role="status">
            <svg viewBox="0 0 80 80" className="mx-auto h-24 w-24" aria-hidden>
              <circle cx="40" cy="40" r="34" fill="none" strokeWidth="4" pathLength={1} strokeDasharray={1} className="animate-draw stroke-success" />
              <path d="M26 41l10 10 19-21" fill="none" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} className="animate-draw stroke-success" style={{ animationDelay: '0.5s' }} />
            </svg>
            <h1 className="mt-6 text-3xl font-semibold">Email verified</h1>
            <p className="mt-2 text-fg-muted">Your account is active. Taking you to your dashboard…</p>
            <Button className="mt-6" onClick={() => user && navigate(dashboardFor(user.role), { replace: true })}>
              Go to dashboard now
            </Button>
          </motion.div>
        ) : linkChecking ? (
          <motion.div key="link-verifying" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center" role="status">
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" aria-hidden />
            <h1 className="mt-5 text-2xl font-semibold">Confirming your email…</h1>
          </motion.div>
        ) : status === 'expired' || status === 'locked' || status === 'invalid-link' ? (
          <motion.div key="problem" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} role="alert">
            <span className="flex h-14 w-14 items-center justify-center rounded-card bg-warning-soft text-warning">
              {status === 'expired' ? <Clock className="h-7 w-7" aria-hidden /> : status === 'locked' ? <Lock className="h-7 w-7" aria-hidden /> : <AlertTriangle className="h-7 w-7" aria-hidden />}
            </span>
            <h1 className="mt-5 text-3xl font-semibold">
              {status === 'expired' ? 'That code has expired' : status === 'locked' ? 'Too many wrong codes' : 'This link can’t be used'}
            </h1>
            <p className="mt-2 text-fg-muted">{message}</p>
            <div className="mt-7 space-y-3">
              {email && status !== 'invalid-link' ? (
                renderResend(true)
              ) : (
                <Button size="lg" className="w-full" onClick={() => setStatus('idle')}>Enter a code instead</Button>
              )}
              <Link to="/login" className="block text-center text-sm font-semibold text-primary hover:underline">Back to sign in</Link>
            </div>
            {notice && <p className="mt-4 text-sm text-success" role="status">{notice}</p>}
            {codeError && <p className="mt-4 text-sm text-danger">{codeError}</p>}
          </motion.div>
        ) : !email ? (
          <motion.div key="ask-email" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <h1 className="text-3xl font-semibold">Verify your email</h1>
            <p className="mt-2 text-fg-muted">Enter the address you registered with and we’ll match it to the code in your inbox.</p>
            <form onSubmit={emailForm.handleSubmit(acceptEmail)} className="mt-7 space-y-4" noValidate>
              <Input label="Registered email" type="email" autoComplete="email" error={emailForm.formState.errors.email?.message} {...emailForm.register('email')} />
              <Button type="submit" size="lg" className="w-full">Continue</Button>
            </form>
          </motion.div>
        ) : (
          <motion.div key="entry" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <span className="flex h-14 w-14 items-center justify-center rounded-card bg-primary-soft text-primary">
              <MailCheck className="h-7 w-7" aria-hidden />
            </span>
            <h1 className="mt-5 text-3xl font-semibold">Check your inbox</h1>
            <p className="mt-2 text-fg-muted">
              We sent a 6-digit code to <strong className="font-semibold text-fg">{maskEmail(email)}</strong>. Enter it below, or tap the button in the email.
            </p>

            <form onSubmit={codeForm.handleSubmit(submitCode)} className="mt-8 space-y-4" noValidate>
              <div key={shakeKey} className={shakeKey ? 'animate-shake' : ''}>
                <Controller
                  control={codeForm.control}
                  name="code"
                  render={({ field }) => (
                    <OtpInput
                      value={field.value}
                      onChange={(v) => {
                        field.onChange(v);
                        if (codeError) setCodeError('');
                      }}
                      onComplete={(v) => submitCode({ code: v })}
                      disabled={status === 'verifying'}
                      invalid={!!codeError || !!codeForm.formState.errors.code}
                      autoFocus
                    />
                  )}
                />
              </div>
              <div aria-live="polite" className="min-h-[1.25rem] text-sm">
                {codeError ? (
                  <p role="alert" className="text-danger">{codeError}</p>
                ) : codeForm.formState.errors.code ? (
                  <p role="alert" className="text-danger">{codeForm.formState.errors.code.message}</p>
                ) : notice ? (
                  <p className="text-success">{notice}</p>
                ) : attemptsLeft === null ? (
                  <p className="text-fg-muted">Codes expire after a short while, so use the newest email.</p>
                ) : null}
              </div>
              <Button type="submit" size="lg" className="w-full" isLoading={status === 'verifying'}>
                Verify email
              </Button>
            </form>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-2 rounded-control bg-surface-subtle px-4 py-3">
              <p className="flex items-center gap-2 text-sm text-fg-muted">
                <Inbox className="h-4 w-4" aria-hidden /> Nothing arrived? Check spam, then
              </p>
              {renderResend()}
            </div>

            <div className="mt-6 flex items-center justify-between text-sm">
              <Link to="/register" className="inline-flex items-center gap-1.5 text-fg-muted hover:text-fg"><ArrowLeft className="h-4 w-4" aria-hidden /> Wrong address?</Link>
              <Link to="/login" className="font-semibold text-primary hover:underline">Back to sign in</Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </AuthShell>
  );
}

export default VerifyEmailPage;

/** Used by sign-in and sign-up to hand the user to the verification screen with the right context. */
export function goToVerification(
  navigate: ReturnType<typeof useNavigate>,
  opts: { email: string; cooldownSeconds?: number; emailDelivered?: boolean }
) {
  const email = opts.email.trim().toLowerCase();
  sessionStorage.setItem('nw_pending_email', email);
  if (opts.cooldownSeconds) startCooldown(email, opts.cooldownSeconds);
  navigate('/verify-email', { state: { email, emailDelivered: opts.emailDelivered ?? true } });
}
