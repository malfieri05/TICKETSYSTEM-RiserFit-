'use client';

import { InfoPopover } from '@/components/ui/InfoPopover';

type Props = {
  direction?: 'up' | 'down';
};

/** Shared copy for Lease IQ (drawer + ticket detail): classifications, not model confidence. */
export function LeaseIqHelpPopover({ direction = 'up' }: Props) {
  return (
    <InfoPopover ariaLabel="Lease IQ responsibility classifications" direction={direction}>
      <p className="text-xs leading-relaxed mb-2" style={{ color: 'var(--color-text-secondary)' }}>
        Maintenance ticket responsibility likelihood is determined by the location&apos;s lease agreement.
      </p>
      <ol className="list-decimal list-inside space-y-1 text-[11px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
        <li>Likely Landlord</li>
        <li>Likely Tenant</li>
        <li>Needs Human Review</li>
      </ol>
    </InfoPopover>
  );
}
