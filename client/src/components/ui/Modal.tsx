import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  maxWidth?: string;
}

export function Modal({ isOpen, onClose, title, subtitle, children, maxWidth = 'max-w-xl' }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previouslyFocused?.focus?.();
    };
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-fg/40 backdrop-blur-sm"
            aria-hidden
          />
          {/* Rises from the bottom edge on phones, settles in place on larger screens. */}
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            className={`relative z-10 w-full ${maxWidth} max-h-[92vh] overflow-y-auto rounded-t-sheet border border-border bg-surface p-6 shadow-elevated outline-none sm:rounded-sheet`}
          >
            <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
              <div>
                <h3 className="text-xl font-semibold text-fg">{title}</h3>
                {subtitle && <p className="mt-1 text-sm text-fg-muted">{subtitle}</p>}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close dialog"
                className="rounded-control p-1.5 text-fg-muted transition-colors hover:bg-surface-subtle hover:text-fg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="pt-5">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
