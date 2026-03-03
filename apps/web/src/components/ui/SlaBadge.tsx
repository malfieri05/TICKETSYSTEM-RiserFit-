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

// Dark-theme translucent badge styles
const SLA_CONFIG: Record<SlaStatusValue, { label: string; style: React.CSSProperties }> = {
  OK: {
    label: 'On Track',
    style: { background: 'rgba(34,197,94,0.15)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.3)' },
  },
  AT_RISK: {
    label: 'At Risk',
    style: { background: 'rgba(251,191,36,0.15)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)' },
  },
  BREACHED: {
    label: 'SLA Breached',
    style: { background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' },
  },
  RESOLVED: {
    label: 'Resolved',
    style: { background: '#222222', color: '#666666', border: '1px solid #2a2a2a' },
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
      className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', className)}
      style={config.style}
      title={`SLA: ${sla.elapsedHours.toFixed(1)}h elapsed of ${sla.targetHours}h target`}
    >
      <Icon className="h-3 w-3 shrink-0" />
      {showTime && sla.status !== 'RESOLVED'
        ? formatHours(sla.remainingHours)
        : config.label}
    </span>
  );
}

export function SlaProgressBar({ sla }: { sla: SlaStatus }) {
  if (sla.status === 'RESOLVED') return null;

  const pct = Math.min(100, sla.percentUsed);
  const barColor =
    sla.status === 'BREACHED' ? '#ef4444' :
    sla.status === 'AT_RISK'  ? '#f59e0b' :
    '#22c55e';

  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: '#2a2a2a' }}>
        <div
          className="h-1 rounded-full transition-all"
          style={{ width: `${pct}%`, background: barColor }}
        />
      </div>
      <span className="text-xs shrink-0" style={{ color: '#555555' }}>{pct.toFixed(0)}%</span>
    </div>
  );
}
