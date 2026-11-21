import React from 'react';
import { ShieldCheck, FileText } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

interface TermsAndConditionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  audience?: 'PARENT' | 'CARETAKER' | 'BOTH';
  onAccept?: () => void;
}

export function TermsAndConditionsModal({
  isOpen,
  onClose,
  audience = 'BOTH',
  onAccept,
}: TermsAndConditionsModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="NestWell.BT Terms & Conditions"
      subtitle="Mandatory 6-Month Childcare Placement Agreement, Screening & Conduct Policy"
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2 rounded-xl bg-primary/10 px-3.5 py-2.5 text-xs font-medium text-primary">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          <span>
            Applies to all registered Parents, Guardians, and Verified Caretakers in Bhutan.
          </span>
        </div>

        <div className="max-h-[340px] overflow-y-auto rounded-2xl border border-border bg-surface-subtle/60 p-4 space-y-4 text-xs text-fg leading-relaxed">
          <section className="space-y-1">
            <h4 className="font-serif text-sm font-semibold text-fg">
              1. Minimum 6-Month Placement Commitment
            </h4>
            <p className="text-fg-muted">
              All placements arranged through NestWell.BT carry a minimum duration of six (6) consecutive calendar months to ensure emotional stability, consistent daily routines, and reliable care for the child.
            </p>
          </section>

          <section className="space-y-1">
            <h4 className="font-serif text-sm font-semibold text-fg">
              2. Identity & Qualification Verification (Caretakers)
            </h4>
            <p className="text-fg-muted">
              Caretakers must upload a valid Bhutanese Citizenship ID (CID) and an authentic ECCD or institutional training certificate. Falsified credentials result in immediate account termination and permanent removal from NestWell.BT.
            </p>
          </section>

          <section className="space-y-1">
            <h4 className="font-serif text-sm font-semibold text-fg">
              3. Monthly BTN Compensation & Billing Schedule (Parents)
            </h4>
            <p className="text-fg-muted">
              Parents agree to compensate the caretaker at the agreed monthly Bhutanese Ngultrum (BTN) rate on time according to the selected monthly or quarterly installment schedule, with no unauthorized deductions.
            </p>
          </section>

          <section className="space-y-1">
            <h4 className="font-serif text-sm font-semibold text-fg">
              4. Non-Overlapping Bookings & Exclusivity
            </h4>
            <p className="text-fg-muted">
              A caretaker may hold only one active full-time 6-month placement per calendar date window. NestWell.BT automatically blocks overlapping bookings on the same dates to protect families and caretakers from scheduling conflicts.
            </p>
          </section>

          <section className="space-y-1">
            <h4 className="font-serif text-sm font-semibold text-fg">
              5. Child Safety, Privacy & Household Confidentiality
            </h4>
            <p className="text-fg-muted">
              Encrypted child medical notes, allergy instructions, and household addresses are strictly confidential and may only be used by the assigned caretaker for the child’s welfare.
            </p>
          </section>

          <section className="space-y-1">
            <h4 className="font-serif text-sm font-semibold text-fg">
              6. Contract Expiration, Renewal & Notice Period
            </h4>
            <p className="text-fg-muted">
              Upon completion of the 6-month contract term, parents may renew the agreement with the same caretaker for another 6+ months or select a different verified caretaker. Early termination requires 30 days written notice except in cases of safety or misconduct.
            </p>
          </section>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <span className="inline-flex items-center gap-1.5 text-[11px] text-fg-muted">
            <FileText className="h-3.5 w-3.5 text-primary" />
            {audience === 'CARETAKER'
              ? 'Caretaker Onboarding Policy v2.0'
              : audience === 'PARENT'
              ? 'Family Placement Policy v2.0'
              : 'NestWell.BT Platform Policy v2.0'}
          </span>

          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
            {onAccept && (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  onAccept();
                  onClose();
                }}
              >
                I Have Read & Accept
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
