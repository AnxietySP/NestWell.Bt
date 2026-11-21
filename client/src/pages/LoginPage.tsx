import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { AlertCircle, Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { api, parseApiError } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { AuthShell } from '../components/shared/AuthShell';
import { ForgotPasswordModal } from '../components/shared/ForgotPasswordModal';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { goToVerification } from './VerifyEmailPage';

const schema = z.object({
  email: z.string().trim().email('Enter the email you registered with.'),
  password: z.string().min(1, 'Enter your password.'),
});
type FormValues = z.infer<typeof schema>;

export const dashboardFor = (role: string) =>
  role === 'ADMIN' ? '/dashboard/admin' : role === 'CARETAKER' ? '/dashboard/caretaker' : '/dashboard/parent';

export function LoginPage() {
  const navigate = useNavigate();
  const { user, loginSuccess } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState('');
  const [lockout, setLockout] = useState(0);
  const [resetOpen, setResetOpen] = useState(false);

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } });
  const { errors, isSubmitting } = form.formState;

  useEffect(() => {
    if (lockout <= 0) return;
    const id = window.setTimeout(() => setLockout((s) => s - 1), 1000);
    return () => window.clearTimeout(id);
  }, [lockout]);

  if (user) return <Navigate to={user.isEmailVerified ? dashboardFor(user.role) : '/verify-email'} replace />;

  const onSubmit = async (values: FormValues) => {
    setFormError('');
    try {
      const { data } = await api.post('/auth/login', values);
      loginSuccess(data.accessToken, data.user);
      navigate(dashboardFor(data.user.role), { replace: true });
    } catch (err) {
      const info = parseApiError(err, 'Unable to sign in. Please check your details.');
      if (info.code === 'EMAIL_NOT_VERIFIED') {
        goToVerification(navigate, { email: info.email ?? values.email, cooldownSeconds: info.retryAfterSeconds });
        return;
      }
      if (info.retryAfterSeconds) setLockout(info.retryAfterSeconds);
      setFormError(info.message);
    }
  };

  return (
    <AuthShell>
      <h1 className="text-3xl font-semibold sm:text-4xl">Welcome back</h1>
      <p className="mt-2 text-fg-muted">Sign in to manage bookings, children and care agreements.</p>

      <form onSubmit={form.handleSubmit(onSubmit)} className="mt-8 space-y-5" noValidate>
        {formError && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} role="alert" className="flex items-start gap-2.5 rounded-control border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{lockout > 0 ? `Too many attempts. Try again in ${lockout}s.` : formError}</span>
          </motion.div>
        )}

        <Input label="Email" type="email" autoComplete="email" placeholder="you@example.bt" leftElement={<Mail className="h-4 w-4" />} error={errors.email?.message} {...form.register('email')} />

        <div className="space-y-1.5">
          <Input
            label="Password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            leftElement={<Lock className="h-4 w-4" />}
            error={errors.password?.message}
            rightElement={
              <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="rounded-lg p-1.5 text-fg-muted hover:text-fg">
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            }
            {...form.register('password')}
          />
          <div className="text-right">
            <button type="button" onClick={() => setResetOpen(true)} className="text-sm font-semibold text-primary hover:underline">
              Forgot password?
            </button>
          </div>
        </div>

        <Button type="submit" size="lg" className="w-full" isLoading={isSubmitting} disabled={lockout > 0}>
          {lockout > 0 ? `Locked for ${lockout}s` : 'Sign in'}
        </Button>
      </form>

      <p className="mt-8 text-center text-sm text-fg-muted">
        New to NestWell.BT?{' '}
        <Link to="/register" className="font-semibold text-primary hover:underline">Create an account</Link>
      </p>

      <ForgotPasswordModal isOpen={resetOpen} onClose={() => setResetOpen(false)} initialEmail={form.getValues('email')} />
    </AuthShell>
  );
}

export default LoginPage;
