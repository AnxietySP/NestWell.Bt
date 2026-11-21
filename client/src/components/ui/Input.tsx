import React, { useId } from 'react';
import { AlertCircle } from 'lucide-react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  rightElement?: React.ReactNode;
  leftElement?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, rightElement, leftElement, className = '', id, ...props }, ref) => {
    const autoId = useId();
    const inputId = id || props.name || autoId;
    const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-semibold text-fg">
            {label}
          </label>
        )}
        <div className="relative">
          {leftElement && (
            <div className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-fg-muted">{leftElement}</div>
          )}
          <input
            ref={ref}
            id={inputId}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={`w-full rounded-control border bg-surface px-3.5 py-2.5 text-sm text-fg placeholder:text-fg-muted/60 transition-[border-color,box-shadow] focus:outline-none focus:shadow-focus ${
              error ? 'border-danger' : 'border-border hover:border-fg-muted/40 focus:border-primary'
            } ${leftElement ? 'pl-10' : ''} ${rightElement ? 'pr-11' : ''} ${className}`}
            {...props}
          />
          {rightElement && <div className="absolute inset-y-0 right-2 flex items-center">{rightElement}</div>}
        </div>
        {error ? (
          <p id={`${inputId}-error`} role="alert" className="flex items-start gap-1.5 text-[13px] text-danger">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {error}
          </p>
        ) : hint ? (
          <p id={`${inputId}-hint`} className="text-[13px] text-fg-muted">
            {hint}
          </p>
        ) : null}
      </div>
    );
  }
);

Input.displayName = 'Input';
