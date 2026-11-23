export const LOGO_SRC = '/images/avatars/logo.png';

export function LogoMark({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <img
      src={LOGO_SRC}
      alt="NestWell.BT"
      className={`${className} rounded-lg bg-white object-contain p-1 shadow-sm ring-1 ring-border`}
    />
  );
}

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`font-display text-[1.35rem] font-bold tracking-display text-fg ${className}`}>
      NestWell<span className="text-primary">.BT</span>
    </span>
  );
}