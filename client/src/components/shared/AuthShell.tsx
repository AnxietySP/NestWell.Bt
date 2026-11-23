import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, CalendarRange, MailCheck } from 'lucide-react';
import { LogoMark, Wordmark } from './Logo';
import { ThemeToggle } from './ThemeToggle';

const PROMISES = [
  { icon: ShieldCheck, title: 'Every caretaker is ID-checked', body: 'An admin reviews each Citizenship ID before a profile goes live.' },
  { icon: CalendarRange, title: 'Care that lasts', body: 'Agreements run six months or longer, so children keep the same face.' },
  { icon: MailCheck, title: 'Real people, real inboxes', body: 'Accounts activate only after the registered email is confirmed.' },
];

/** Split layout used by sign in, sign up and email verification. */
export function AuthShell({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="grid min-h-screen bg-bg lg:grid-cols-[minmax(360px,5fr)_7fr]">
      <aside className="relative hidden overflow-hidden bg-primary text-primary-fg lg:flex lg:flex-col lg:justify-between lg:p-12">
        {/* Concentric arcs: the "nest". Decorative only. */}
        <svg aria-hidden viewBox="0 0 400 400" className="pointer-events-none absolute -bottom-24 -right-24 h-[520px] w-[520px] text-primary-fg/15">
          {[60, 110, 160, 210].map((r) => (
            <circle key={r} cx="200" cy="200" r={r} fill="none" stroke="currentColor" strokeWidth="2" />
          ))}
          <circle cx="200" cy="200" r="22" className="fill-accent" />
        </svg>

        {/* NestWell logo + name */}
        <Link to="/" className="relative flex items-center gap-3 self-start" aria-label="NestWell.BT home">
          <LogoMark className="h-12 w-12 !rounded-xl !p-1.5 !shadow-md" />
          <span className="font-display text-2xl font-bold tracking-display">NestWell.BT</span>
        </Link>

        <div className="relative max-w-md space-y-10">
          <h2 className="font-display text-4xl font-semibold leading-[1.1] tracking-display xl:text-[2.75rem]">
            Childcare you can check before you commit.
          </h2>
          <ul className="space-y-6">
            {PROMISES.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-4">
                <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-primary-fg/12">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <p className="font-semibold">{title}</p>
                  <p className="text-sm leading-relaxed text-primary-fg/75">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-sm text-primary-fg/60">Thimphu · Paro · Phuentsholing · Punakha and beyond</p>
      </aside>

      <main className="flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 sm:px-8">
          <Link to="/" className="flex items-center gap-2.5 lg:invisible" aria-label="NestWell.BT home">
            <LogoMark className="h-8 w-8" />
            <Wordmark className="text-lg" />
          </Link>
          <ThemeToggle />
        </div>
        <div className="flex flex-1 items-center justify-center px-5 pb-12 pt-2 sm:px-8">
          <div className={`w-full ${wide ? 'max-w-2xl' : 'max-w-md'}`}>{children}</div>
        </div>
      </main>
    </div>
  );
}