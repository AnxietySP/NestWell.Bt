import React from 'react';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  className = '',
  children,
  disabled,
  type = 'button',
  ...props
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-2 font-semibold rounded-control transition-[background-color,box-shadow,transform,color] duration-150 focus-visible:outline-none focus-visible:shadow-focus disabled:opacity-50 disabled:pointer-events-none active:translate-y-px';

  const variants: Record<NonNullable<ButtonProps['variant']>, string> = {
    primary: 'bg-primary text-primary-fg hover:bg-primary-hover shadow-soft',
    secondary: 'bg-accent text-accent-fg hover:brightness-95 shadow-soft',
    outline: 'border border-border bg-surface text-fg hover:bg-surface-subtle',
    ghost: 'text-fg-muted hover:text-fg hover:bg-surface-subtle',
    danger: 'bg-danger text-primary-fg hover:brightness-95',
  };

  const sizes: Record<NonNullable<ButtonProps['size']>, string> = {
    sm: 'text-[13px] px-3.5 py-2',
    md: 'text-sm px-[18px] py-2.5',
    lg: 'text-base px-6 py-3.5',
  };

  return (
    <button
      type={type}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      {...props}
    >
      {isLoading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}
