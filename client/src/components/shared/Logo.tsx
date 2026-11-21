export function LogoMark({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} role="img" aria-label="NestWell.BT">
      <rect width="40" height="40" rx="11" className="fill-primary" />
      {/* The nest: an open arc holding a small saffron sun/child. */}
      <path d="M9 22.5c1.6 6 6 9.5 11 9.5s9.4-3.5 11-9.5" fill="none" stroke="rgb(var(--color-primary-fg))" strokeWidth="3" strokeLinecap="round" />
      <circle cx="20" cy="17" r="4.5" className="fill-accent" />
    </svg>
  );
}

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`font-display text-[1.35rem] font-bold tracking-display text-fg ${className}`}>
      NestWell<span className="text-primary">.BT</span>
    </span>
  );
}
