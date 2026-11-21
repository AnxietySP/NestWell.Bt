import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2, Mail } from 'lucide-react';
import { api, parseApiError } from '../../lib/api';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { formatCountdown, useCooldown } from '../../hooks/useCooldown';

const requestSchema = z.object({
  email: z.string().trim().email('Enter your registered email.'),
});

const resetSchema = z
  .object({
    otp: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code sent to your email.'),
    newPassword: z.string().min(8, 'Use at least 8 characters.'),
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, {
    path: ['confirm'],
    message: 'Passwords do not match.',
  });

export function ForgotPasswordModal({
  isOpen,
  onClose,
  initialEmail = '',
}: {
  isOpen: boolean;
  onClose: () => void;
  initialEmail?: string;
}) {
  const [step, setStep] = useState<'request' | 'reset' | 'done'>('request');
  const [serverMessage, setServerMessage] = useState('');
  const [serverError, setServerError] = useState('');
  const [targetEmail, setTargetEmail] = useState('');
  const { seconds, start } = useCooldown(`reset:${targetEmail}`);

  const requestForm = useForm<z.infer<typeof requestSchema>>({
    resolver: zodResolver(requestSchema),
    values: { email: initialEmail },
  });

  const resetForm = useForm<z.infer<typeof resetSchema>>({
    resolver: zodResolver(resetSchema),
    defaultValues: { otp: '', newPassword: '', confirm: '' },
  });

  const close = () => {
    onClose();
    window.setTimeout(() => {
      setStep('request');
      setServerError('');
      setServerMessage('');
      resetForm.reset();
    }, 250);
  };

  const sendOtp = async (v: z.infer<typeof requestSchema>) => {
    setServerError('');
    try {
      const { data } = await api.post('/auth/forgot-password/send-otp', {
        email: v.email,
      });
      setTargetEmail(v.email);
      start(45);
      setServerMessage(data.message);
      setStep('reset');
    } catch (err) {
      setServerError(parseApiError(err, 'Could not send the verification email.').message);
    }
  };

  const resetPassword = async (v: z.infer<typeof resetSchema>) => {
    setServerError('');
    try {
      await api.post('/auth/reset-password', {
        email: targetEmail,
        otp: v.otp,
        newPassword: v.newPassword,
      });
      setStep('done');
    } catch (err) {
      setServerError(parseApiError(err, 'Could not reset the password.').message);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      title="Reset your password"
      subtitle="We’ll email a 6-digit verification code to your registered address."
      maxWidth="max-w-md"
    >
      {step === 'request' && (
        <form onSubmit={requestForm.handleSubmit(sendOtp)} className="space-y-4" noValidate>
          <Input
            label="Registered email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            leftElement={<Mail className="h-4 w-4" />}
            error={requestForm.formState.errors.email?.message}
            {...requestForm.register('email')}
          />
          {serverError && (
            <p role="alert" className="text-sm text-danger">
              {serverError}
            </p>
          )}
          <Button
            type="submit"
            className="w-full"
            isLoading={requestForm.formState.isSubmitting}
          >
            <Mail className="h-4 w-4" aria-hidden /> Email me a code
          </Button>
        </form>
      )}

      {step === 'reset' && (
        <form onSubmit={resetForm.handleSubmit(resetPassword)} className="space-y-4" noValidate>
          <p className="rounded-control bg-primary-soft px-3.5 py-2.5 text-sm text-fg">
            {serverMessage}
          </p>
          <Input
            label="6-digit verification code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="123456"
            error={resetForm.formState.errors.otp?.message}
            {...resetForm.register('otp')}
          />
          <Input
            label="New password"
            type="password"
            autoComplete="new-password"
            error={resetForm.formState.errors.newPassword?.message}
            {...resetForm.register('newPassword')}
          />
          <Input
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            error={resetForm.formState.errors.confirm?.message}
            {...resetForm.register('confirm')}
          />
          {serverError && (
            <p role="alert" className="text-sm text-danger">
              {serverError}
            </p>
          )}
          <div className="flex gap-3">
            <Button
              type="submit"
              className="flex-1"
              isLoading={resetForm.formState.isSubmitting}
            >
              Save new password
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={seconds > 0}
              onClick={() => sendOtp({ email: targetEmail })}
            >
              {seconds > 0 ? formatCountdown(seconds) : 'Resend'}
            </Button>
          </div>
        </form>
      )}

      {step === 'done' && (
        <div className="space-y-4 text-center" role="status">
          <CheckCircle2 className="mx-auto h-12 w-12 text-success" aria-hidden />
          <p className="font-semibold">Password updated</p>
          <p className="text-sm text-fg-muted">
            You’ve been signed out everywhere. Sign in with your new password.
          </p>
          <Button className="w-full" onClick={close}>
            Back to sign in
          </Button>
        </div>
      )}
    </Modal>
  );
}