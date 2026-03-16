'use client';

import { useState } from 'react';

interface MaintenanceCountWithTooltipProps {
  count: number;
  categoryNames?: string[];
}

export function MaintenanceCountWithTooltip({
  count,
  categoryNames = [],
}: MaintenanceCountWithTooltipProps) {
  const [isHovered, setIsHovered] = useState(false);
  const countColor = count === 0 ? '#22c55e' : 'var(--color-danger)';

  return (
    <span
      className="relative inline-block"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <span style={{ color: countColor }}>({count})</span>
      {isHovered && (
        <div
          className="absolute left-0 top-full z-[100] mt-1 min-w-[280px] max-w-[320px] rounded-lg border px-3 py-2 text-left text-sm shadow-lg"
          style={{
            background: 'var(--color-bg-surface)',
            borderColor: 'var(--color-border-default)',
            color: 'var(--color-text-primary)',
          }}
        >
          <p className="whitespace-nowrap font-semibold">Active Maintenance Tickets:</p>
          {count === 0 ? (
            <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>No active tickets</p>
          ) : (
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs" style={{ listStylePosition: 'outside' }}>
              {categoryNames.map((name, i) => (
                <li key={`${name}-${i}`}>{name}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </span>
  );
}
