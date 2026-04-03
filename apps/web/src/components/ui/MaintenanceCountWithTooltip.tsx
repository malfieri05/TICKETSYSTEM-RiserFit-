'use client';

import { InstantTooltip } from '@/components/tickets/TicketTagCapsule';

interface MaintenanceCountWithTooltipProps {
  count: number;
  categoryNames?: string[];
}

export function MaintenanceCountWithTooltip({
  count,
  categoryNames = [],
}: MaintenanceCountWithTooltipProps) {
  const countColor = count === 0 ? '#22c55e' : 'var(--color-danger)';

  const content =
    count === 0 ? (
      <>
        <p className="whitespace-normal font-semibold">Active Maintenance Tickets:</p>
        <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          No active tickets
        </p>
      </>
    ) : (
      <>
        <p className="whitespace-normal font-semibold">Active Maintenance Tickets:</p>
        <ul
          className="mt-1 list-disc space-y-0.5 pl-5 text-xs"
          style={{ listStylePosition: 'outside' }}
        >
          {categoryNames.map((name, i) => (
            <li key={`${name}-${i}`} className="break-words">
              {name}
            </li>
          ))}
        </ul>
      </>
    );

  return (
    <InstantTooltip
      placement="below"
      align="left"
      content={content}
      className="relative inline-block"
    >
      <span style={{ color: countColor }}>({count})</span>
    </InstantTooltip>
  );
}
