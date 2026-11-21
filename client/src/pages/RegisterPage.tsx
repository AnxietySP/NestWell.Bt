import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, Baby, Eye, EyeOff, FileCheck2, HeartHandshake, Upload } from 'lucide-react';
import { api, parseApiError } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { AuthShell } from '../components/shared/AuthShell';
import { TermsAndConditionsModal } from '../components/shared/TermsAndConditionsModal';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { goToVerification } from './VerifyEmailPage';
import { dashboardFor } from './LoginPage';

const DZONGKHAGS = ['Thimphu', 'Paro', 'Chukha (Phuentsholing)', 'Punakha', 'Wangdue Phodrang', 'Sarpang (Gelephu)', 'Bumthang', 'Trashigang', 'Mongar', 'Samdrup Jongkhar', 'Trongsa', 'Haa', 'Tsirang', 'Dagana', 'Samtse', 'Zhemgang', 'Pemagatshel', 'Lhuentse', 'Trashiyangtse', 'Gasa'];
const MAX_FILE = 5 * 1024 * 1024;
const FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

const fileField = z
  .instanceof(File)
  .refine((f) => f.size <= MAX_FILE, 'File must be 5 MB or smaller.')
  .refine((f) => FILE_TYPES.includes(f.type), 'Use a JPG, PNG, WEBP or PDF.')
  .optional();

const schema = z
  .object({
    role: z.enum(['PARENT', 'CARETAKER']),
    fullName: z.string().trim().min(2, 'Enter your full name.'),
    email: z.string().trim().email('Enter a valid email. We’ll send your code here.'),
    phone: z.string().regex(/^\d{8}$/, 'Enter the 8-digit number after +975.'),
    dzongkhag: z.string().min(1),
    address: z.string().trim().min(3, 'Enter your area or village.'),
    password: z.string().min(8, 'Use at least 8 characters.'),
    confirmPassword: z.string(),
    yearsExperience: z.string().optional(),
    monthlyRateBtn: z.string().optional(),
    qualifications: z.string().optional(),
    skills: z.string().optional(),
    languages: z.string().optional(),
    bio: z.string().max(1500).optional(),
    idDocument: fileField,
    certificateDocument: fileField,
    acceptedTerms: z.boolean().refine((v) => v, 'Accept the Terms & Conditions to continue.'),
  })
  .superRefine((v, ctx) => {
    if (v.password !== v.confirmPassword) ctx.addIssue({ code: 'custom', path: ['confirmPassword'], message: 'Passwords do not match.' });
    if (v.role === 'CARETAKER') {
      if (!v.idDocument) ctx.addIssue({ code: 'custom', path: ['idDocument'], message: 'Upload your Citizenship ID for admin review.' });
      if (!v.certificateDocument) ctx.addIssue({ code: 'custom', path: ['certificateDocument'], message: 'Upload your institution certificate.' });
      if (!v.qualifications?.trim()) ctx.addIssue({ code: 'custom', path: ['qualifications'], message: 'List your qualifications.' });
      if (Number(v.monthlyRateBtn) < 3000) ctx.addIssue({ code: 'custom', path: ['monthlyRateBtn'], message: 'Minimum rate is Nu. 3,000.' });
    }
  });
type FormValues = z.infer<typeof schema>;

function FileInput({ label, value, onChange, error }: { label: string; value?: File; onChange: (f?: File) => void; error?: string }) {
  return (
    <div className="space-y-1.5">
      <span className="block text-sm font-semibold">{label}</span>
      <label className={`flex cursor-pointer items-center gap-3 rounded-control border border-dashed px-4 py-3 text-sm transition-colors hover:bg-surface-subtle focus-within:shadow-focus ${error ? 'border-danger' : 'border-border'}`}>
        {value ? <FileCheck2 className="h-5 w-5 shrink-0 text-success" aria-hidden /> : <Upload className="h-5 w-5 shrink-0 text-fg-muted" aria-hidden />}
        <span className="min-w-0 truncate">{value ? value.name : 'Choose JPG, PNG, WEBP or PDF (max 5 MB)'}</span>
        <input type="file" accept="image/*,.pdf" className="sr-only" onChange={(e) => onChange(e.target.files?.[0])} />
      </label>
      {error && <p role="alert" className="flex items-center gap-1.5 text-[13px] text-danger"><AlertCircle className="h-3.5 w-3.5" aria-hidden />{error}</p>}
    </div>
  );
}

export function RegisterPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const [showPass, setShowPass] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [formError, setFormError] = useState('');

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      role: params.get('role')?.toUpperCase() === 'CARETAKER' ? 'CARETAKER' : 'PARENT',
      fullName: '', email: '', phone: '', dzongkhag: 'Thimphu', address: '', password: '', confirmPassword: '',
      yearsExperience: '2', monthlyRateBtn: '15000', qualifications: '', skills: 'Infant Care, First Aid', languages: 'Dzongkha, English', bio: '',
      acceptedTerms: false,
    },
  });
  const { register, control, handleSubmit, watch, formState: { errors, isSubmitting } } = form;
  const role = watch('role');

  if (user) return <Navigate to={user.isEmailVerified ? dashboardFor(user.role) : '/verify-email'} replace />;

  const onSubmit = async (v: FormValues) => {
    setFormError('');
    const list = (s?: string) => (s ?? '').split(',').map((x) => x.trim()).filter(Boolean);
    const base = { fullName: v.fullName, email: v.email, phone: `+975${v.phone}`, dzongkhag: v.dzongkhag, address: v.address, password: v.password, role: v.role };
    try {
      let data;
      if (v.role === 'CARETAKER') {
        const fd = new FormData();
        Object.entries(base).forEach(([k, val]) => fd.append(k, val));
        fd.append('yearsExperience', v.yearsExperience || '0');
        fd.append('monthlyRateBtn', v.monthlyRateBtn || '15000');
        fd.append('qualifications', v.qualifications ?? '');
        fd.append('skills', JSON.stringify(list(v.skills)));
        fd.append('languages', JSON.stringify(list(v.languages)));
        fd.append('bio', v.bio ?? '');
        if (v.idDocument) fd.append('idDocument', v.idDocument);
        if (v.certificateDocument) fd.append('certificateDocument', v.certificateDocument);
        ({ data } = await api.post('/auth/register', fd));
      } else {
        ({ data } = await api.post('/auth/register', base));
      }
      goToVerification(navigate, { email: data.email, cooldownSeconds: data.resendAvailableInSeconds, emailDelivered: data.emailDelivered });
    } catch (err) {
      const info = parseApiError(err, 'Could not create your account. Check your details and try again.');
      if (info.code === 'EMAIL_UNVERIFIED') return goToVerification(navigate, { email: info.email ?? v.email });
      setFormError(info.message);
    }
  };

  const roles = [
    { value: 'PARENT', label: 'I need childcare', icon: Baby },
    { value: 'CARETAKER', label: 'I provide childcare', icon: HeartHandshake },
  ] as const;

  return (
    <AuthShell wide>
      <h1 className="text-3xl font-semibold sm:text-4xl">Create your account</h1>
      <p className="mt-2 text-fg-muted">We’ll email a 6-digit code to confirm it’s really you before anything is activated.</p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-6" noValidate>
        <Controller control={control} name="role" render={({ field }) => (
          <div role="radiogroup" aria-label="Account type" className="grid grid-cols-2 gap-1.5 rounded-card bg-surface-subtle p-1.5">
            {roles.map(({ value, label, icon: Icon }) => {
              const active = field.value === value;
              return (
                <button key={value} type="button" role="radio" aria-checked={active} onClick={() => field.onChange(value)} className={`relative flex items-center justify-center gap-2 rounded-control px-3 py-3 text-sm font-semibold transition-colors ${active ? 'text-fg' : 'text-fg-muted hover:text-fg'}`}>
                  {active && <motion.span layoutId="role-pill" className="absolute inset-0 rounded-control bg-surface shadow-soft" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
                  <Icon className="relative h-4 w-4" aria-hidden /><span className="relative">{label}</span>
                </button>
              );
            })}
          </div>
        )} />

        {formError && (
          <div role="alert" className="flex items-start gap-2.5 rounded-control border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {formError}
          </div>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <Input label="Full name" autoComplete="name" error={errors.fullName?.message} {...register('fullName')} />
          <Input label="Email" type="email" autoComplete="email" hint="Your verification code goes here." error={errors.email?.message} {...register('email')} />
          <Input label="Phone" inputMode="numeric" maxLength={8} autoComplete="tel-national" leftElement={<span className="text-sm font-medium">+975</span>} className="pl-14" error={errors.phone?.message} {...register('phone')} />
          <div className="space-y-1.5">
            <label htmlFor="dzongkhag" className="block text-sm font-semibold">Dzongkhag</label>
            <select id="dzongkhag" className="w-full rounded-control border border-border bg-surface px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:shadow-focus" {...register('dzongkhag')}>
              {DZONGKHAGS.map((d) => <option key={d}>{d}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2"><Input label="Area or village" autoComplete="street-address" error={errors.address?.message} {...register('address')} /></div>
          <Input label="Password" type={showPass ? 'text' : 'password'} autoComplete="new-password" error={errors.password?.message}
            rightElement={<button type="button" onClick={() => setShowPass((s) => !s)} aria-label={showPass ? 'Hide password' : 'Show password'} className="rounded-lg p-1.5 text-fg-muted hover:text-fg">{showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>}
            {...register('password')} />
          <Input label="Confirm password" type={showPass ? 'text' : 'password'} autoComplete="new-password" error={errors.confirmPassword?.message} {...register('confirmPassword')} />
        </div>

        <AnimatePresence initial={false}>
          {role === 'CARETAKER' && (
            <motion.section key="caretaker" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.28 }} className="overflow-hidden">
              <div className="space-y-5 rounded-card border border-border bg-surface-subtle/60 p-5">
                <div>
                  <h2 className="text-lg font-semibold">Your caregiver profile</h2>
                  <p className="text-sm text-fg-muted">An admin reviews your documents before parents can see you.</p>
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Input label="Years of experience" type="number" min={0} {...register('yearsExperience')} />
                  <Input label="Monthly rate (Nu.)" type="number" min={3000} error={errors.monthlyRateBtn?.message} {...register('monthlyRateBtn')} />
                  <div className="sm:col-span-2"><Input label="Qualifications" placeholder="e.g. ECCD diploma, pediatric first aid" error={errors.qualifications?.message} {...register('qualifications')} /></div>
                  <Input label="Skills" hint="Separate with commas." {...register('skills')} />
                  <Input label="Languages" hint="Separate with commas." {...register('languages')} />
                  <div className="space-y-1.5 sm:col-span-2">
                    <label htmlFor="bio" className="block text-sm font-semibold">About you</label>
                    <textarea id="bio" rows={3} className="w-full rounded-control border border-border bg-surface px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:shadow-focus" {...register('bio')} />
                  </div>
                  <Controller control={control} name="idDocument" render={({ field }) => <FileInput label="Citizenship ID (CID)" value={field.value} onChange={field.onChange} error={errors.idDocument?.message} />} />
                  <Controller control={control} name="certificateDocument" render={({ field }) => <FileInput label="Institution certificate" value={field.value} onChange={field.onChange} error={errors.certificateDocument?.message} />} />
                </div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        <div>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-border accent-[rgb(var(--color-primary))]" {...register('acceptedTerms')} />
            <span>I have read and accept the <button type="button" onClick={() => setTermsOpen(true)} className="font-semibold text-primary hover:underline">Terms &amp; Conditions</button>.</span>
          </label>
          {errors.acceptedTerms && <p role="alert" className="mt-1.5 text-[13px] text-danger">{errors.acceptedTerms.message}</p>}
        </div>

        <Button type="submit" size="lg" className="w-full" isLoading={isSubmitting}>Create account and send code</Button>
      </form>

      <p className="mt-8 text-center text-sm text-fg-muted">Already registered? <Link to="/login" className="font-semibold text-primary hover:underline">Sign in</Link></p>

      <TermsAndConditionsModal isOpen={termsOpen} onClose={() => setTermsOpen(false)} onAccept={() => { form.setValue('acceptedTerms', true, { shouldValidate: true }); setTermsOpen(false); }} />
    </AuthShell>
  );
}

export default RegisterPage;
