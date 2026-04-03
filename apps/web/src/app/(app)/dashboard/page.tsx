'use client';

import Link from 'next/link';
import type { ElementType, ReactNode } from 'react';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Ticket,
  Clock,
  BarChart2,
  MessageCircle,
  CheckCircle,
  MapPin,
} from 'lucide-react';
import {
  dashboardApi,
  reportingApi,
  type DashboardSummaryResponse,
} from '@/lib/api';
import { Header } from '@/components/layout/Header';
import { InstantTooltip } from '@/components/tickets/TicketTagCapsule';
import { ComboBox } from '@/components/ui/ComboBox';
import { SlidingSegmentedControl } from '@/components/ui/SlidingSegmentedControl';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { TOOLTIP_PORTAL_Z_INDEX, TOOLTIP_VIEWPORT_MARGIN } from '@/lib/tooltip-layer';

type Preset = 'today' | 'last7' | 'last30';

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function rangeForPreset(preset: Preset): { from: string; to: string } {
  const end = startOfToday();
  const start = new Date(end);
  if (preset === 'last7') start.setDate(start.getDate() - 6);
  else if (preset === 'last30') start.setDate(start.getDate() - 29);
  return { from: ymd(start), to: ymd(end) };
}

function StatCard({
  label,
  value,
  icon: Icon,
  color = 'indigo',
  headerTooltip,
  className,
}: {
  label: string;
  value: string | number;
  icon: ElementType;
  color?: 'indigo' | 'green' | 'amber' | 'red' | 'sky';
  /** When set, hovering or focusing the icon + title shows this definition. */
  headerTooltip?: string;
  className?: string;
}) {
  const tipId = useId();
  const iconStyle = {
    indigo: { background: 'var(--stat-icon-indigo-bg)', color: 'var(--stat-icon-indigo-fg)' },
    green:  { background: 'var(--stat-icon-green-bg)',  color: 'var(--stat-icon-green-fg)'  },
    amber:  { background: 'var(--stat-icon-amber-bg)',  color: 'var(--stat-icon-amber-fg)'  },
    red:    { background: 'var(--stat-icon-red-bg)',    color: 'var(--stat-icon-red-fg)'    },
    sky:    { background: 'var(--stat-icon-sky-bg)',    color: 'var(--stat-icon-sky-fg)'    },
  }[color];

  const headerRow = (
    <>
      <div
        className="rounded-xl p-3 shrink-0"
        style={iconStyle}
      >
        <Icon className="h-5 w-5 lg:h-6 lg:w-6" />
      </div>
      <p className="text-[0.7rem] lg:text-xs text-[var(--color-text-secondary)] font-bold uppercase tracking-[0.1em] leading-tight pt-0.5 min-w-0">
        {label}
      </p>
    </>
  );

  return (
    <div
      className={cn(
        'dashboard-card rounded-xl p-5 lg:p-6 flex flex-col min-h-[8.5rem]',
        className,
      )}
      style={{
        background: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border-default)',
      }}
    >
      {headerTooltip ? (
        <InstantTooltip
          content={headerTooltip}
          align="left"
          maxWidth="min(18rem, calc(100vw - 2rem))"
          tooltipId={tipId}
          className="block w-full shrink-0"
        >
          <div
            className="flex w-full shrink-0 cursor-help items-start gap-4 outline-none focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg-surface)]"
            tabIndex={0}
          >
            {headerRow}
          </div>
        </InstantTooltip>
      ) : (
        <div className="flex items-start gap-4 w-full shrink-0">{headerRow}</div>
      )}
      <div className="flex-1 flex items-center justify-center px-1 pt-1">
        <p className="text-3xl font-bold text-[var(--color-text-primary)] text-center tabular-nums lg:text-4xl">
          {value}
        </p>
      </div>
    </div>
  );
}

function HorizontalBar({
  label,
  count,
  max,
  color = '#6366f1',
}: {
  label: string;
  count: number;
  max: number;
  color?: string;
}) {
  const pct = max > 0 ? Math.max(2, Math.round((count / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-36 text-[var(--color-text-secondary)] truncate shrink-0">{label}</span>
      <div
        className="flex-1 rounded-full h-2.5 overflow-hidden"
        style={{ background: 'var(--color-border-default)' }}
      >
        <div
          className="h-2.5 rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="w-8 text-right text-[var(--color-text-muted)] font-medium">{count}</span>
    </div>
  );
}

/** Fixed visual height; header stays put, list scrolls inside. */
const BREAKDOWN_PANEL_CLASS =
  'dashboard-card flex min-h-[12rem] h-[min(22rem,60vh)] flex-col overflow-hidden rounded-xl p-5';

function BreakdownPanelScrollBody({
  isEmpty,
  children,
}: {
  isEmpty: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
      {isEmpty ? (
        <div className="flex flex-1 flex-col items-center justify-center py-6 text-center">
          <p className="text-sm text-[var(--color-text-muted)]">No data.</p>
        </div>
      ) : (
        <div className="space-y-2.5 pr-1">{children}</div>
      )}
    </div>
  );
}

function formatTickCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
}

function formatDateLabel(iso: string): string {
  const [, m, d] = iso.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(m, 10) - 1]} ${parseInt(d, 10)}`;
}

const TOOLTIP_W = 136; // px — used for left/right side placement
const TOOLTIP_GAP = 14; // px gap between vertical rule and tooltip edge

function VolumeLineChart({ data }: { data: { date: string; count: number; closed: number }[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const chartWrapRef = useRef<HTMLDivElement>(null);
  const chartTipRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ idx: number; x: number; y: number } | null>(null);
  const [svgWidth, setSvgWidth] = useState(800);
  const [tipFixed, setTipFixed] = useState({ left: 0, top: 0 });

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSvgWidth(el.getBoundingClientRect().width);
    });
    ro.observe(el);
    setSvgWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  const PAD_L = 52;
  const PAD_R = 28;
  const PAD_T = 20;
  const PAD_B = 44;
  const H = 240;
  const innerW = Math.max(1, svgWidth - PAD_L - PAD_R);
  const innerH = H - PAD_T - PAD_B;

  const maxCount = data.length ? Math.max(...data.map((d) => d.count), 1) : 1;

  function niceYMax(v: number): number {
    if (v <= 5) return 5;
    if (v <= 10) return 10;
    const exp = Math.pow(10, Math.floor(Math.log10(v)));
    const norm = v / exp;
    const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
    return nice * exp;
  }
  const yMax = niceYMax(maxCount);
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * yMax));

  function ptX(i: number) {
    return PAD_L + (data.length < 2 ? innerW / 2 : (i / (data.length - 1)) * innerW);
  }
  function ptY(count: number) {
    return PAD_T + innerH - (count / yMax) * innerH;
  }

  // Catmull-Rom → Cubic Bezier smooth path
  function makeSmoothPath(fill: boolean): string {
    if (data.length === 0) return '';
    if (data.length === 1) {
      const x = ptX(0);
      const y = ptY(data[0].count);
      return fill ? `M ${x} ${y} L ${x} ${PAD_T + innerH} Z` : `M ${x} ${y}`;
    }
    const pts = data.map((d, i) => [ptX(i), ptY(d.count)] as [number, number]);
    const segs: string[] = [`M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`];
    const alpha = 0.35;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(pts.length - 1, i + 2)];
      const cp1x = p1[0] + (p2[0] - p0[0]) * alpha;
      const cp1y = p1[1] + (p2[1] - p0[1]) * alpha;
      const cp2x = p2[0] - (p3[0] - p1[0]) * alpha;
      const cp2y = p2[1] - (p3[1] - p1[1]) * alpha;
      segs.push(`C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`);
    }
    if (fill) {
      const last = pts[pts.length - 1];
      const baseline = PAD_T + innerH;
      segs.push(`L ${last[0].toFixed(2)} ${baseline} L ${pts[0][0].toFixed(2)} ${baseline} Z`);
    }
    return segs.join(' ');
  }

  // X axis tick positions (max 6 labels)
  const xTickIndices: number[] = (() => {
    if (data.length === 0) return [];
    if (data.length <= 7) return data.map((_, i) => i);
    const count = 6;
    return Array.from({ length: count }, (_, i) =>
      Math.round((i / (count - 1)) * (data.length - 1)),
    );
  })();

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (data.length === 0) return;
    const rect = svgRef.current!.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const relX = mouseX - PAD_L;
    if (relX < 0 || relX > innerW) { setHover(null); return; }
    const frac = relX / innerW;
    const idx = Math.max(0, Math.min(data.length - 1, Math.round(frac * (data.length - 1))));
    setHover({ idx, x: ptX(idx), y: ptY(data[idx].count) });
  }

  const gradId = 'vol-area-grad';
  const hoverPt = hover ? data[hover.idx] : null;

  // Position tooltip to the RIGHT of the rule, unless that would overflow — then flip LEFT.
  // Always maintain a gap between the rule and the tooltip edge.
  const tooltipLeft: number = (() => {
    if (!hover) return 0;
    const rightPos = hover.x + TOOLTIP_GAP;
    if (rightPos + TOOLTIP_W <= svgWidth - PAD_R) return rightPos;
    return hover.x - TOOLTIP_GAP - TOOLTIP_W;
  })();

  // Clamp tooltip vertically so it doesn't overflow above PAD_T
  const tooltipTop = hover ? Math.max(PAD_T, Math.min(hover.y - 16, H - PAD_B - 80)) : 0;

  useLayoutEffect(() => {
    if (!hover || !hoverPt || typeof window === 'undefined') return;
    const wrap = chartWrapRef.current;
    const tip = chartTipRef.current;
    const m = TOOLTIP_VIEWPORT_MARGIN;
    const run = () => {
      if (!wrap) return;
      const wr = wrap.getBoundingClientRect();
      let left = wr.left + tooltipLeft;
      let top = wr.top + tooltipTop;
      const w = tip?.getBoundingClientRect().width ?? TOOLTIP_W;
      const h = tip?.getBoundingClientRect().height ?? 80;
      left = Math.max(m, Math.min(window.innerWidth - m - w, left));
      top = Math.max(m, Math.min(window.innerHeight - m - h, top));
      setTipFixed({ left, top });
    };
    run();
    const raf = requestAnimationFrame(run);
    window.addEventListener('resize', run);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', run);
    };
  }, [hover, hoverPt, tooltipLeft, tooltipTop]);

  return (
    <div ref={chartWrapRef} className="relative select-none" style={{ height: H }}>
      <svg
        ref={svgRef}
        width="100%"
        height={H}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHover(null)}
        style={{ cursor: data.length > 0 ? 'crosshair' : 'default', overflow: 'visible' }}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {/* Horizontal grid lines + Y axis labels */}
        {yTicks.map((tick) => {
          const y = ptY(tick);
          return (
            <g key={tick}>
              <line
                x1={PAD_L} y1={y} x2={svgWidth - PAD_R} y2={y}
                stroke="var(--color-border-subtle)"
                strokeWidth="1"
                strokeDasharray={tick === 0 ? undefined : '4 4'}
              />
              <text x={PAD_L - 8} y={y + 4} textAnchor="end" fontSize="11" fill="var(--color-text-muted)">
                {formatTickCount(tick)}
              </text>
            </g>
          );
        })}

        {/* Area fill */}
        {data.length > 0 && <path d={makeSmoothPath(true)} fill={`url(#${gradId})`} />}

        {/* Line */}
        {data.length > 0 && (
          <path
            d={makeSmoothPath(false)}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {/* X axis labels */}
        {xTickIndices.map((i) => (
          <text key={i} x={ptX(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--color-text-muted)">
            {formatDateLabel(data[i].date)}
          </text>
        ))}

        {/* Hover: vertical rule + dot */}
        {hover && hoverPt && (
          <>
            <line
              x1={hover.x} y1={PAD_T} x2={hover.x} y2={PAD_T + innerH}
              stroke="var(--color-accent)"
              strokeWidth="1"
              strokeDasharray="4 3"
              opacity="0.5"
            />
            <circle
              cx={hover.x} cy={hover.y} r="5"
              fill="var(--color-accent)"
              stroke="var(--color-bg-surface)"
              strokeWidth="2.5"
            />
          </>
        )}
      </svg>

      {hover &&
        hoverPt &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={chartTipRef}
            className="pointer-events-none fixed box-border min-w-[9rem] w-max max-w-[min(22rem,calc(100vw-1rem))] rounded-xl px-3.5 py-3 leading-snug shadow-[var(--shadow-panel)] break-words"
            style={{
              left: tipFixed.left,
              top: tipFixed.top,
              zIndex: TOOLTIP_PORTAL_Z_INDEX,
              background: 'var(--color-bg-surface-raised)',
              border: '1px solid var(--color-border-default)',
              color: 'var(--color-text-primary)',
            }}
          >
            <p className="text-xs font-semibold text-[var(--color-text-secondary)] mb-2">
              {formatDateLabel(hoverPt.date)}
            </p>
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs shrink-0 text-[var(--color-text-muted)]">Created</span>
                <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--color-accent)' }}>
                  {hoverPt.count}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs shrink-0 text-[var(--color-text-muted)]">Closed</span>
                <span className="text-sm font-bold tabular-nums text-[var(--color-text-primary)]">
                  {hoverPt.closed}
                </span>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

function formatHoursLabel(h: number | null): string {
  if (h == null) return '—';
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

const PRESET_SEGMENTS: { key: Preset; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'last7', label: 'Last 7 days' },
  { key: 'last30', label: 'Last 30 days' },
];

const KPI_PRESET_OPTIONS = PRESET_SEGMENTS.map((s) => ({
  value: s.key,
  label: s.label,
}));

const VOLUME_SEGMENT_OPTIONS = [
  { value: '1d', label: '1d' },
  { value: '7d', label: '1w' },
  { value: '30d', label: '1m' },
  { value: 'all', label: 'All' },
] as const;

const AVG_FIRST_RESPONSE_TOOLTIP =
  'Time between ticket creation and first action.';

const AVG_RESOLUTION_TOOLTIP =
  'Time between ticket creation and ticket closed.';

function isAdminDashboardSummary(
  d: unknown,
): d is DashboardSummaryResponse {
  return (
    typeof d === 'object' &&
    d !== null &&
    'newTickets' in d &&
    'supportByType' in d
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const initRange = useMemo(() => rangeForPreset('last7'), []);
  const [preset, setPreset] = useState<Preset>('last7');
  const [manualRange, setManualRange] = useState(false);
  const [rangeFrom, setRangeFrom] = useState(initRange.from);
  const [rangeTo, setRangeTo] = useState(initRange.to);

  const presetBounds = useMemo(() => rangeForPreset(preset), [preset]);

  useEffect(() => {
    if (!manualRange) {
      setRangeFrom(presetBounds.from);
      setRangeTo(presetBounds.to);
    }
  }, [presetBounds, manualRange]);

  const selectPreset = useCallback((p: Preset) => {
    setManualRange(false);
    setPreset(p);
  }, []);

  const onDateFromChange = useCallback((v: string) => {
    setManualRange(true);
    setRangeFrom(v);
  }, []);

  const onDateToChange = useCallback((v: string) => {
    setManualRange(true);
    setRangeTo(v);
  }, []);

  const rangeValid = Boolean(rangeFrom && rangeTo && rangeFrom <= rangeTo);

  const skipForStudio = user?.role === 'STUDIO_USER';

  const {
    data,
    isLoading,
    isError,
    error: summaryError,
    refetch: refetchSummary,
  } = useQuery({
    queryKey: ['dashboard-summary', rangeFrom, rangeTo],
    queryFn: () =>
      dashboardApi.summary(undefined, { from: rangeFrom, to: rangeTo }),
    enabled: !skipForStudio && rangeValid,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
  });

  const rawSummary = data?.data;
  const summary = isAdminDashboardSummary(rawSummary) ? rawSummary : undefined;

  const [volumeRange, setVolumeRange] = useState<'1d' | '7d' | '30d' | 'all'>('all');
  const volumeDays =
    volumeRange === '1d' ? 1 : volumeRange === '7d' ? 7 : volumeRange === '30d' ? 30 : 0;

  const { data: volumeRes } = useQuery({
    queryKey: ['dashboard', 'reporting-volume', volumeDays],
    queryFn: () => reportingApi.volumeByDay(volumeDays),
    enabled: !skipForStudio,
    refetchOnWindowFocus: false,
  });


  const { data: resolutionRes } = useQuery({
    queryKey: ['dashboard', 'reporting-resolution-time'],
    queryFn: () => reportingApi.resolutionTime(),
    enabled: !skipForStudio,
    refetchOnWindowFocus: false,
  });

  const { data: completionOwnerRes } = useQuery({
    queryKey: ['dashboard', 'reporting-completion-owners'],
    queryFn: () => reportingApi.completionByOwner(),
    enabled: !skipForStudio,
    refetchOnWindowFocus: false,
  });

  const { data: workflowTimingRes } = useQuery({
    queryKey: ['dashboard', 'reporting-workflow-timing'],
    queryFn: () => reportingApi.workflowTiming(),
    enabled: !skipForStudio,
    refetchOnWindowFocus: false,
  });

  const [selectedWorkflowId, setSelectedWorkflowId] = useState('');

  const volume = volumeRes?.data ?? [];
  const resolutionTime = resolutionRes?.data ?? [];
  const completionByOwner = completionOwnerRes?.data ?? [];
  const workflowTimingData = workflowTimingRes?.data?.workflows ?? [];
  const activeWorkflow =
    workflowTimingData.find((w) => w.workflowId === selectedWorkflowId) ?? workflowTimingData[0];

  const maxSupportDept = Math.max(...(summary?.supportByDepartment?.map((s) => s.count) ?? [1]), 1);
  const maxSupportType = Math.max(...(summary?.supportByType?.map((s) => s.count) ?? [1]), 1);
  const maxMaintenanceCat = Math.max(
    ...(summary?.maintenanceByCategory?.map((m) => m.count) ?? [1]),
    1,
  );
  const maxMaintenanceLoc = Math.max(
    ...(summary?.maintenanceByLocation?.map((m) => m.count) ?? [1]),
    1,
  );
  const maxResolution = Math.max(...resolutionTime.map((r) => r.avgHours), 1);

  if (skipForStudio) {
    return (
      <div className="flex flex-col h-full" style={{ background: 'var(--color-bg-page)' }}>
        <Header title="Dashboard" />
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-[var(--color-text-secondary)] max-w-md">
            Studio dashboard metrics live on the portal. Use the Dashboard tab there for your scoped summary.
          </p>
          <Link
            href="/portal?tab=dashboard"
            className="text-sm font-medium text-[var(--color-accent)] hover:underline"
          >
            Open portal dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--color-bg-page)' }}>
      <Header title="Dashboard" />

      <div className="flex-1 overflow-y-auto w-full px-4 py-6 sm:px-6 lg:px-8 xl:px-10 space-y-6 max-w-[1920px] mx-auto">
        {!rangeValid && (
          <p className="text-sm text-center text-[var(--color-text-muted)]">
            Choose a valid date range (from ≤ to).
          </p>
        )}

        {rangeValid && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 xl:items-stretch">
            {/* Left: KPI grid — each half matches 2 of the 4 breakdown boxes below */}
            <div className="flex min-h-0 w-full flex-col xl:h-full xl:min-h-0">
              {isLoading ? (
                <div className="grid min-h-[20rem] w-full grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:min-h-0 xl:h-full xl:grid-cols-4 xl:grid-rows-[1fr_1fr]">
                  <div
                    className="col-span-full min-h-[8.5rem] shrink-0 rounded-xl animate-pulse sm:col-span-2 md:col-span-3 xl:col-span-3 xl:row-start-1 xl:min-h-0 xl:h-full min-w-0"
                    style={{ background: 'var(--color-bg-surface-inset)' }}
                  />
                  <div
                    className="min-h-[8.5rem] rounded-xl animate-pulse xl:col-start-4 xl:row-start-1 xl:min-h-0 xl:h-full min-w-0"
                    style={{ background: 'var(--color-bg-surface-inset)' }}
                  />
                  <div
                    className="min-h-[8.5rem] rounded-xl animate-pulse xl:col-start-1 xl:row-start-2 xl:min-h-0 xl:h-full min-w-0"
                    style={{ background: 'var(--color-bg-surface-inset)' }}
                  />
                  <div
                    className="min-h-[8.5rem] rounded-xl animate-pulse xl:col-start-2 xl:row-start-2 xl:min-h-0 xl:h-full min-w-0"
                    style={{ background: 'var(--color-bg-surface-inset)' }}
                  />
                  <div
                    className="min-h-[8.5rem] rounded-xl animate-pulse xl:col-start-3 xl:row-start-2 xl:min-h-0 xl:h-full min-w-0"
                    style={{ background: 'var(--color-bg-surface-inset)' }}
                  />
                  <div
                    className="min-h-[8.5rem] rounded-xl animate-pulse xl:col-start-4 xl:row-start-2 xl:min-h-0 xl:h-full min-w-0"
                    style={{ background: 'var(--color-bg-surface-inset)' }}
                  />
                </div>
              ) : isError ? (
                <div
                  className="w-full rounded-xl p-4 flex flex-col gap-3"
                  style={{
                    background: 'var(--color-bg-surface)',
                    border: '1px solid var(--color-border-default)',
                  }}
                >
                  <p className="text-sm font-medium text-[var(--color-danger)]">
                    Couldn&apos;t load KPI metrics
                  </p>
                  <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                    {summaryError &&
                    typeof summaryError === 'object' &&
                    'response' in summaryError &&
                    typeof (summaryError as { response?: { status?: number } }).response?.status ===
                    'number'
                      ? `Server error (HTTP ${(summaryError as { response: { status: number } }).response.status}). If you just deployed, run database migrations on the API.`
                      : 'Check your connection and try again.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => void refetchSummary()}
                    className="text-xs font-medium rounded-lg px-3 py-2 border border-[var(--color-border-default)] text-[var(--color-accent)] hover:bg-[var(--color-btn-secondary-hover)] self-start"
                  >
                    Retry
                  </button>
                </div>
              ) : !summary ? (
                <div
                  className="w-full rounded-xl p-6 flex flex-col items-center justify-center gap-2 text-center min-h-[12rem]"
                  style={{
                    background: 'var(--color-bg-surface)',
                    border: '1px solid var(--color-border-default)',
                  }}
                >
                  <Ticket className="h-10 w-10 text-[var(--color-text-muted)]" />
                  <p className="text-sm font-medium text-[var(--color-text-secondary)]">
                    No KPI data available
                  </p>
                </div>
              ) : (
                <div className="grid min-h-[20rem] w-full grid-cols-1 items-stretch gap-4 min-w-0 sm:grid-cols-2 md:grid-cols-3 xl:min-h-0 xl:h-full xl:grid-cols-4 xl:grid-rows-[1fr_1fr]">
                  <div
                    className="dashboard-card col-span-full flex min-h-[8.5rem] w-full shrink-0 flex-col rounded-xl px-6 py-4 sm:col-span-2 md:col-span-3 xl:col-span-3 xl:row-start-1 xl:min-h-0 xl:h-full"
                    style={{
                      background: 'var(--color-bg-surface)',
                      border: '1px solid var(--color-border-default)',
                    }}
                  >
                    {/* Card label */}
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)] mb-3 shrink-0">
                      Timeframe
                    </p>
                    {/* Controls — vertically centred in remaining space */}
                    <div className="flex flex-1 flex-col items-center justify-center gap-3 min-h-0">
                      {/* Preset buttons */}
                      <SlidingSegmentedControl
                        options={KPI_PRESET_OPTIONS}
                        value={manualRange ? null : preset}
                        onChange={(v) => selectPreset(v as Preset)}
                        aria-label="Date range preset"
                        size="sm"
                        className="w-fit max-w-full shrink-0"
                      />
                      {/* Custom date range — single row, subordinate to presets */}
                      <div className="flex shrink-0 flex-wrap items-center justify-center gap-2">
                        <label
                          htmlFor="kpi-range-from"
                          className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-text-muted)]"
                        >
                          From
                        </label>
                        <input
                          id="kpi-range-from"
                          type="date"
                          value={rangeFrom}
                          onChange={(e) => onDateFromChange(e.target.value)}
                          className="shrink-0 rounded-lg border px-2.5 py-1.5 text-sm"
                          style={{
                            borderColor: 'var(--color-border-default)',
                            background: 'var(--color-bg-surface-inset)',
                            color: 'var(--color-text-primary)',
                            width: '8.5rem',
                          }}
                        />
                        <span className="text-[var(--color-text-muted)] text-xs select-none">→</span>
                        <label
                          htmlFor="kpi-range-to"
                          className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-text-muted)]"
                        >
                          To
                        </label>
                        <input
                          id="kpi-range-to"
                          type="date"
                          value={rangeTo}
                          onChange={(e) => onDateToChange(e.target.value)}
                          className="shrink-0 rounded-lg border px-2.5 py-1.5 text-sm"
                          style={{
                            borderColor: 'var(--color-border-default)',
                            background: 'var(--color-bg-surface-inset)',
                            color: 'var(--color-text-primary)',
                            width: '8.5rem',
                          }}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex min-h-[8.5rem] min-w-0 xl:col-start-4 xl:row-start-1 xl:min-h-0 xl:h-full">
                    <StatCard
                      label="Avg response time"
                      value={formatHoursLabel(summary.avgFirstResponseHours)}
                      icon={MessageCircle}
                      color="sky"
                      headerTooltip={AVG_FIRST_RESPONSE_TOOLTIP}
                      className="h-full min-h-[8.5rem] w-full min-w-0 xl:min-h-0"
                    />
                  </div>
                  <div className="flex min-h-[8.5rem] min-w-0 xl:col-start-1 xl:row-start-2 xl:min-h-0 xl:h-full">
                    <StatCard
                      label="New Tickets"
                      value={summary.newTickets}
                      icon={Ticket}
                      color="indigo"
                      className="h-full min-h-[8.5rem] w-full min-w-0 xl:min-h-0"
                    />
                  </div>
                  <div className="flex min-h-[8.5rem] min-w-0 xl:col-start-2 xl:row-start-2 xl:min-h-0 xl:h-full">
                    <StatCard
                      label="In progress"
                      value={summary.inProgressTickets}
                      icon={Clock}
                      color="amber"
                      className="h-full min-h-[8.5rem] w-full min-w-0 xl:min-h-0"
                    />
                  </div>
                  <div className="flex min-h-[8.5rem] min-w-0 xl:col-start-3 xl:row-start-2 xl:min-h-0 xl:h-full">
                    <StatCard
                      label="Closed"
                      value={summary.closedTickets}
                      icon={CheckCircle}
                      color="green"
                      className="h-full min-h-[8.5rem] w-full min-w-0 xl:min-h-0"
                    />
                  </div>
                  <div className="flex min-h-[8.5rem] min-w-0 xl:col-start-4 xl:row-start-2 xl:min-h-0 xl:h-full">
                    <StatCard
                      label="Avg resolution"
                      value={formatHoursLabel(summary.avgCompletionHours)}
                      icon={Clock}
                      color="indigo"
                      headerTooltip={AVG_RESOLUTION_TOOLTIP}
                      className="h-full min-h-[8.5rem] w-full min-w-0 xl:min-h-0"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Right: ticket volume — same xl:grid-cols-2 cell = half of 4-col below */}
            <div className="flex min-h-0 w-full min-w-0 flex-col xl:h-full xl:min-h-0">
              <div
                className="dashboard-card rounded-xl px-6 pt-5 pb-4"
                style={{
                  background: 'var(--color-bg-surface)',
                  border: '1px solid var(--color-border-default)',
                }}
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-1">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--color-text-muted)] mb-1">
                      Ticket Volume
                    </p>
                    <div className="flex items-baseline gap-3">
                      <span className="text-4xl font-bold text-[var(--color-text-primary)]">
                        {volume.reduce((s, d) => s + d.count, 0).toLocaleString()}
                      </span>
                      <span className="text-sm text-[var(--color-text-muted)]">
                        {volumeRange === '1d' && 'last 24 h'}
                        {volumeRange === '7d' && 'last 7 days'}
                        {volumeRange === '30d' && 'last 30 days'}
                        {volumeRange === 'all' && 'all time'}
                      </span>
                    </div>
                  </div>
                  <SlidingSegmentedControl
                    options={[...VOLUME_SEGMENT_OPTIONS]}
                    value={volumeRange}
                    onChange={(v) =>
                      setVolumeRange(v as '1d' | '7d' | '30d' | 'all')
                    }
                    aria-label="Ticket volume time range"
                    size="sm"
                    className="w-fit shrink-0"
                  />
                </div>
                <div className="mt-4">
                  {volume.length === 0 ? (
                    <div className="flex items-center justify-center py-16 text-sm text-[var(--color-text-muted)]">
                      No ticket data yet.
                    </div>
                  ) : (
                    <VolumeLineChart data={volume} />
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {summary && rangeValid ? (
          <>
            {/* Support | Maintenance breakdown — 2 groups, 4 boxes total */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* ── Support ────────────────────────────────────────── */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2.5 px-1">
                  <span className="w-[3px] h-[1.1rem] rounded-full shrink-0" style={{ background: '#6366f1' }} />
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--color-text-secondary)]">Support</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1">
                  {/* Support by Department */}
                  <div
                    className={BREAKDOWN_PANEL_CLASS}
                    style={{
                      background: 'var(--color-bg-surface)',
                      border: '1px solid var(--color-border-default)',
                    }}
                  >
                    <h3 className="mb-3 shrink-0 text-sm font-semibold text-[var(--color-text-primary)]">
                      By Department
                    </h3>
                    <BreakdownPanelScrollBody
                      isEmpty={(summary.supportByDepartment ?? []).length === 0}
                    >
                      {(summary.supportByDepartment ?? []).map((row) => (
                        <HorizontalBar
                          key={row.deptId}
                          label={row.deptName}
                          count={row.count}
                          max={maxSupportDept}
                          color="#6366f1"
                        />
                      ))}
                    </BreakdownPanelScrollBody>
                  </div>

                  {/* Support by Topic */}
                  <div
                    className={BREAKDOWN_PANEL_CLASS}
                    style={{
                      background: 'var(--color-bg-surface)',
                      border: '1px solid var(--color-border-default)',
                    }}
                  >
                    <div className="mb-3 flex shrink-0 items-center gap-2">
                      <BarChart2 className="h-4 w-4 text-[var(--color-text-muted)]" />
                      <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                        By Topic
                      </h3>
                    </div>
                    <BreakdownPanelScrollBody isEmpty={(summary.supportByType ?? []).length === 0}>
                      {(summary.supportByType ?? []).map((row) => (
                        <HorizontalBar
                          key={row.typeId}
                          label={row.typeName}
                          count={row.count}
                          max={maxSupportType}
                          color="#6366f1"
                        />
                      ))}
                    </BreakdownPanelScrollBody>
                  </div>
                </div>
              </div>

              {/* ── Maintenance ────────────────────────────────────── */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2.5 px-1">
                  <span className="w-[3px] h-[1.1rem] rounded-full shrink-0" style={{ background: '#0ea5e9' }} />
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--color-text-secondary)]">Maintenance</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1">
                  {/* Maintenance by Location */}
                  <div
                    className={BREAKDOWN_PANEL_CLASS}
                    style={{
                      background: 'var(--color-bg-surface)',
                      border: '1px solid var(--color-border-default)',
                    }}
                  >
                    <div className="mb-3 flex shrink-0 items-center gap-2">
                      <MapPin className="h-4 w-4 text-[var(--color-text-muted)]" />
                      <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                        By Location
                      </h3>
                    </div>
                    <BreakdownPanelScrollBody
                      isEmpty={(summary.maintenanceByLocation ?? []).length === 0}
                    >
                      {(summary.maintenanceByLocation ?? []).map((row) => (
                        <HorizontalBar
                          key={row.locationId}
                          label={row.locationName}
                          count={row.count}
                          max={maxMaintenanceLoc}
                          color="#0ea5e9"
                        />
                      ))}
                    </BreakdownPanelScrollBody>
                  </div>

                  {/* Maintenance by Category */}
                  <div
                    className={BREAKDOWN_PANEL_CLASS}
                    style={{
                      background: 'var(--color-bg-surface)',
                      border: '1px solid var(--color-border-default)',
                    }}
                  >
                    <h3 className="mb-3 shrink-0 text-sm font-semibold text-[var(--color-text-primary)]">
                      By Category
                    </h3>
                    <BreakdownPanelScrollBody
                      isEmpty={(summary.maintenanceByCategory ?? []).length === 0}
                    >
                      {(summary.maintenanceByCategory ?? []).map((row) => (
                        <HorizontalBar
                          key={row.categoryId}
                          label={row.categoryName}
                          count={row.count}
                          max={maxMaintenanceCat}
                          color="#0ea5e9"
                        />
                      ))}
                    </BreakdownPanelScrollBody>
                  </div>
                </div>
              </div>
            </div>

            {/* Avg resolution by category */}
            <div
              className="dashboard-card rounded-xl p-5"
              style={{
                background: 'var(--color-bg-surface)',
                border: '1px solid var(--color-border-default)',
              }}
            >
              <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-4">
                Avg Resolution Time by Category
              </h3>
              {resolutionTime.length === 0 ? (
                <p className="text-sm text-[var(--color-text-secondary)] text-center py-4">
                  No resolved tickets yet.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {resolutionTime.map((row) => (
                    <div key={row.categoryName} className="flex items-center gap-3 text-sm">
                      <span className="w-36 text-[var(--color-text-secondary)] truncate shrink-0">
                        {row.categoryName}
                      </span>
                      <div
                        className="flex-1 rounded-full h-2 overflow-hidden"
                        style={{ background: 'var(--color-border-default)' }}
                      >
                        <div
                          className="h-2 rounded-full bg-emerald-500 transition-all"
                          style={{
                            width: `${Math.max(2, Math.round((row.avgHours / maxResolution) * 100))}%`,
                          }}
                        />
                      </div>
                      <span className="w-14 text-right text-[var(--color-text-muted)] font-medium">
                        {formatHoursLabel(row.avgHours)}
                      </span>
                      <span className="w-16 text-right text-[var(--color-text-secondary)] text-xs">
                        {row.ticketCount} tickets
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Completion time by owner */}
            <div
              className="dashboard-card rounded-xl p-5"
              style={{
                background: 'var(--color-bg-surface)',
                border: '1px solid var(--color-border-default)',
              }}
            >
              <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-4">
                Avg Completion Time by Owner
              </h3>
              {completionByOwner.length === 0 ? (
                <p className="text-sm text-[var(--color-text-secondary)] text-center py-4">
                  No completed tickets with owners yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr
                        className="border-b border-[var(--color-border-default)] text-[var(--color-text-muted)] text-xs uppercase tracking-wide"
                        style={{ background: 'var(--color-bg-content-header)' }}
                      >
                        <th className="text-left py-2 pr-4">Owner</th>
                        <th className="text-right py-2 pr-4">Avg Completion</th>
                        <th className="text-right py-2 pr-2">Closed Tickets</th>
                      </tr>
                    </thead>
                    <tbody>
                      {completionByOwner.map((row) => (
                        <tr key={row.userId} className="border-b border-[var(--color-border-default)]">
                          <td className="py-1.5 pr-4 text-[var(--color-text-primary)]">{row.userName}</td>
                          <td className="py-1.5 pr-4 text-right text-[var(--color-text-primary)]">
                            {row.avgHours == null ? '—' : formatHoursLabel(row.avgHours)}
                          </td>
                          <td className="py-1.5 pr-2 text-right text-[var(--color-text-secondary)]">
                            {row.closedCount}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Workflow timing */}
            <div
              className="dashboard-card rounded-xl p-5"
              style={{
                background: 'var(--color-bg-surface)',
                border: '1px solid var(--color-border-default)',
              }}
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                  Workflow / Subtask Completion Timing
                </h3>
                {workflowTimingData.length > 1 && (
                  <ComboBox
                    placeholder="Select workflow"
                    clearable={false}
                    options={workflowTimingData.map((w) => ({
                      value: w.workflowId,
                      label: w.workflowName,
                    }))}
                    value={selectedWorkflowId || activeWorkflow?.workflowId || ''}
                    onChange={(v) => setSelectedWorkflowId(v)}
                    className="min-w-[180px]"
                  />
                )}
              </div>
              <div className="max-h-[400px] overflow-y-auto">
                {workflowTimingData.length === 0 ? (
                  <p className="text-sm text-[var(--color-text-secondary)] text-center py-8">
                    No workflow timing data available.
                  </p>
                ) : activeWorkflow ? (
                  <div className="space-y-4">
                    <div
                      className="flex flex-wrap items-center gap-2 text-sm"
                      style={{ color: 'var(--color-text-secondary)' }}
                    >
                      <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>
                        {activeWorkflow.workflowName}
                      </span>
                      <span>·</span>
                      <span>
                        Avg ticket completion:{' '}
                        {formatHoursLabel(activeWorkflow.avgTicketCompletionHours)}
                      </span>
                    </div>
                    {activeWorkflow.steps.length === 0 ? (
                      <p className="text-sm text-[var(--color-text-secondary)] py-4">
                        No step data available.
                      </p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr
                            className="border-b border-[var(--color-border-default)] text-[var(--color-text-muted)] text-xs uppercase tracking-wide"
                            style={{ background: 'var(--color-bg-content-header)' }}
                          >
                            <th className="text-left py-2 pr-4">Step</th>
                            <th className="text-right py-2 pr-4">Avg Completion</th>
                            <th className="text-right py-2 pr-2">Avg Active Work</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeWorkflow.steps.map((step) => (
                            <tr key={step.stepId} className="border-b border-[var(--color-border-default)]">
                              <td className="py-2 pr-4 text-[var(--color-text-primary)]">{step.stepName}</td>
                              <td className="py-2 pr-4 text-right text-[var(--color-text-primary)]">
                                {formatHoursLabel(step.avgSubtaskCompletionHours)}
                              </td>
                              <td className="py-2 pr-2 text-right text-[var(--color-text-secondary)]">
                                {formatHoursLabel(step.avgActiveWorkHours)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
