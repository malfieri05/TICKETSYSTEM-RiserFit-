import { cn } from '@/lib/utils';
import { Clock, AlertTriangle, CheckCircle } from 'lucide-react';

export type SlaStatusValue = 'OK' | 'AT_RISK' | 'BREACHED' | 'RESOLVED';

export interface SlaStatus {
  status: SlaStatusValue;
  targetHours: number;
  elapsedHours: number;
  remainingHours: number;
  percentUsed: number;
}

const SLA_CONFIG: Record<SlaStatusValue, { label: string; className: string }> = {
  OK: {
    label: 'On Track',
    className: 'bg-green-50 text-green-700 border-green-200',
  },
  AT_RISK: {
    label: 'At Risk',
    className: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  BREACHED: {
    label: 'SLA Breached',
    className: 'bg-red-50 text-red-700 border-red-200',
  },
  RESOLVED: {
    label: 'Resolved',
    className: 'bg-gray-50 text-gray-500 border-gray-200',
  },
};

function formatHours(hours: number): string {
  if (hours < 0) return `${Math.abs(hours).toFixed(0)}h overdue`;
  if (hours < 1) return `${Math.round(hours * 60)}m left`;
  if (hours < 24) return `${hours.toFixed(1)}h left`;
  return `${(hours / 24).toFixed(1)}d left`;
}

interface SlaBadgeProps {
  sla: SlaStatus;
  showTime?: boolean;
  className?: string;
}

export function SlaBadge({ sla, showTime = false, className }: SlaBadgeProps) {
  const config = SLA_CONFIG[sla.status];

  const Icon = sla.status === 'BREACHED'
    ? AlertTriangle
    : sla.status === 'RESOLVED'
    ? CheckCircle
    : Clock;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border',
        config.className,
        className,
      )}
      title={`SLA: ${sla.elapsedHours.toFixed(1)}h elapsed of ${sla.targetHours}h target`}
    >
      <Icon className="h-3 w-3 shrink-0" />
      {showTime && sla.status !== 'RESOLVED'
        ? formatHours(sla.remainingHours)
        : config.label}
    </span>
  );
}

/** Compact progress bar for ticket list rows */
export function SlaProgressBar({ sla }: { sla: SlaStatus }) {
  if (sla.status === 'RESOLVED') return null;

  const pct = Math.min(100, sla.percentUsed);
  const barColor =
    sla.status === 'BREACHED' ? 'bg-red-500' :
    sla.status === 'AT_RISK'  ? 'bg-amber-400' :
    'bg-green-500';

  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={cn('h-1 rounded-full transition-all', barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-gray-400 shrink-0">{pct.toFixed(0)}%</span>
    </div>
  );
}
