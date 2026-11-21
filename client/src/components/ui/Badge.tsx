import React from 'react';

interface BadgeProps {
  variant?: 'verified' | 'pending' | 'rejected' | 'neutral' | 'accent';
  children: React.ReactNode;
}

export function Badge({ variant = 'neutral', children }: BadgeProps) {
  const styles: Record<NonNullable<BadgeProps['variant']>, string> = {
    verified: 'bg-success-soft text-success border-success/25',
    pending: 'bg-warning-soft text-warning border-warning/25',
    rejected: 'bg-danger-soft text-danger border-danger/25',
    accent: 'bg-accent/20 text-fg border-accent/40',
    neutral: 'bg-surface-subtle text-fg-muted border-border',
  };

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${styles[variant]}`}>
      {children}
    </span>
  );
}
