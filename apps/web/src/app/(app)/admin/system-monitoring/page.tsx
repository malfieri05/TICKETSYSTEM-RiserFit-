'use client';

import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { Header } from '@/components/layout/Header';
import { adminApi } from '@/lib/api';
import { AlertCircle, ExternalLink, Server, Database, Cloud, Activity } from 'lucide-react';

type SystemService = {
  id: string;
  name: string;
  category:
    | 'database'
    | 'cache'
    | 'storage'
    | 'email'
    | 'ai'
    | 'policy'
    | 'hosting'
    | 'monitoring'
    | 'other';
  roleDescription: string;
  status: 'healthy' | 'degraded' | 'unknown' | 'not_configured';
  statusReason?: string;
  criticality: 'critical' | 'important' | 'optional';
  lastCheckedAt: string;
  lastError?: string | null;
  details: {
    host?: string;
    region?: string;
    planHint?: string;
  };
  links: {
    label: string;
    url: string;
    kind: 'dashboard' | 'docs' | 'other';
  }[];
};

type SystemServicesResponse = {
  environment: { name: string; region?: string; version?: string | null };
  services: SystemService[];
};

function statusColor(status: SystemService['status']): { bg: string; text: string; label: string } {
  switch (status) {
    case 'healthy':
      return {
        bg: 'rgba(34,197,94,0.15)',
        text: '#4ade80',
        label: 'Healthy',
      };
    case 'degraded':
      return {
        bg: 'rgba(251,191,36,0.15)',
        text: '#fbbf24',
        label: 'Degraded',
      };
    case 'unknown':
      return {
        bg: 'rgba(148,163,184,0.15)',
        text: '#94a3b8',
        label: 'Unknown',
      };
    case 'not_configured':
    default:
      return {
        bg: 'rgba(148,163,184,0.08)',
        text: '#e5e7eb',
        label: 'Not configured',
      };
  }
}

function criticalityColor(crit: SystemService['criticality']): { bg: string; text: string } {
  if (crit === 'critical') {
    return { bg: 'rgba(239,68,68,0.1)', text: '#fca5a5' };
  }
  if (crit === 'important') {
    return { bg: 'rgba(59,130,246,0.1)', text: '#93c5fd' };
  }
  return { bg: 'rgba(148,163,184,0.1)', text: '#e5e7eb' };
}

function categoryIcon(category: SystemService['category']) {
  if (category === 'database') return Database;
  if (category === 'storage' || category === 'hosting') return Cloud;
  if (category === 'monitoring') return Activity;
  return Server;
}

export default function SystemMonitoringPage() {
  const { data, isLoading, isError } = useQuery<SystemServicesResponse>({
    queryKey: ['admin', 'system-services'],
    queryFn: async () => {
      const res = await adminApi.getSystemServices();
      return res.data;
    },
  });

  const env = data?.environment;
  const services = data?.services ?? [];

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--color-bg-page)' }}>
      <Header title="System Monitoring" />

      <div className="flex-1 p-6 space-y-6 overflow-auto">
        {/* Intro + environment summary */}
        <div
          className="rounded-xl p-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
          style={{
            background: 'var(--color-bg-surface)',
            border: '1px solid var(--color-border-default)',
          }}
        >
          <div className="space-y-1.5">
            <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              External Services Overview
            </h2>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              This page summarizes the external services that power the ticketing system. Use it to
              find dashboards, owners, and current service state.
            </p>
          </div>
          {env && (
            <div
              className="mt-3 md:mt-0 inline-flex flex-col md:flex-row md:items-center md:gap-4 text-xs rounded-lg px-3 py-2"
              style={{
                background: 'var(--color-bg-surface-raised)',
                border: '1px dashed var(--color-border-default)',
              }}
            >
              <div>
                <span className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                  Environment:
                </span>{' '}
                <span style={{ color: 'var(--color-text-muted)' }}>{env.name}</span>
              </div>
              {env.region && (
                <div>
                  <span className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                    Region:
                  </span>{' '}
                  <span style={{ color: 'var(--color-text-muted)' }}>{env.region}</span>
                </div>
              )}
              {env.version && (
                <div>
                  <span className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                    Version:
                  </span>{' '}
                  <span style={{ color: 'var(--color-text-muted)' }}>{env.version}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Content area */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2">
            <div
              className="h-6 w-6 rounded-full border-2 border-teal-500 border-t-transparent animate-spin"
            />
            <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              Loading system services…
            </span>
          </div>
        ) : isError ? (
          <div
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm"
            style={{
              background: 'rgba(239,68,68,0.12)',
              border: '1px solid rgba(239,68,68,0.3)',
              color: '#fca5a5',
            }}
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            Failed to load system services. Check API logs for details.
          </div>
        ) : services.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center h-40 gap-2 rounded-xl"
            style={{
              background: 'var(--color-bg-surface)',
              border: '1px dashed var(--color-border-default)',
            }}
          >
            <Activity className="h-6 w-6" style={{ color: 'var(--color-text-muted)' }} />
            <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
              No services defined
            </p>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              System monitoring will show external services once they are configured.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {services.map((svc) => {
              const statusCfg = statusColor(svc.status);
              const critCfg = criticalityColor(svc.criticality);
              const Icon = categoryIcon(svc.category);
              const lastChecked =
                svc.lastCheckedAt &&
                formatDistanceToNow(new Date(svc.lastCheckedAt), { addSuffix: true });

              return (
                <div
                  key={svc.id}
                  className="rounded-xl p-4 flex flex-col gap-3"
                  style={{
                    background: 'var(--color-bg-surface)',
                    border: '1px solid var(--color-border-default)',
                  }}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{ background: 'var(--color-bg-surface-raised)' }}
                      >
                        <Icon className="h-4 w-4" style={{ color: 'var(--color-text-secondary)' }} />
                      </div>
                      <div>
                        <p
                          className="text-sm font-semibold"
                          style={{ color: 'var(--color-text-primary)' }}
                        >
                          {svc.name}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                          {svc.roleDescription}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Chips */}
                  <div className="flex flex-wrap gap-2 text-[11px]">
                    <span
                      className="inline-flex items-center rounded-full px-2 py-0.5 font-medium"
                      style={{
                        background: statusCfg.bg,
                        color: statusCfg.text,
                      }}
                    >
                      {statusCfg.label}
                    </span>
                    <span
                      className="inline-flex items-center rounded-full px-2 py-0.5 font-medium"
                      style={{
                        background: critCfg.bg,
                        color: critCfg.text,
                      }}
                    >
                      {svc.criticality === 'critical'
                        ? 'Critical'
                        : svc.criticality === 'important'
                          ? 'Important'
                          : 'Optional'}
                    </span>
                    <span
                      className="inline-flex items-center rounded-full px-2 py-0.5 font-medium"
                      style={{
                        background: 'rgba(148,163,184,0.1)',
                        color: 'var(--color-text-muted)',
                      }}
                    >
                      {svc.category}
                    </span>
                  </div>

                  {/* Details */}
                  <div className="space-y-1.5 text-xs">
                    {svc.details.host && (
                      <div>
                        <span
                          className="font-medium"
                          style={{ color: 'var(--color-text-primary)' }}
                        >
                          Host:
                        </span>{' '}
                        <span style={{ color: 'var(--color-text-muted)' }}>
                          {svc.details.host}
                        </span>
                      </div>
                    )}
                    {svc.details.region && (
                      <div>
                        <span
                          className="font-medium"
                          style={{ color: 'var(--color-text-primary)' }}
                        >
                          Region:
                        </span>{' '}
                        <span style={{ color: 'var(--color-text-muted)' }}>
                          {svc.details.region}
                        </span>
                      </div>
                    )}
                    {svc.details.planHint && (
                      <div>
                        <span
                          className="font-medium"
                          style={{ color: 'var(--color-text-primary)' }}
                        >
                          Plan:
                        </span>{' '}
                        <span style={{ color: 'var(--color-text-muted)' }}>
                          {svc.details.planHint}
                        </span>
                      </div>
                    )}
                    {svc.statusReason && (
                      <div>
                        <span
                          className="font-medium"
                          style={{ color: 'var(--color-text-primary)' }}
                        >
                          Status detail:
                        </span>{' '}
                        <span style={{ color: 'var(--color-text-muted)' }}>
                          {svc.statusReason}
                        </span>
                      </div>
                    )}
                    {svc.lastError && (
                      <div className="flex items-start gap-1.5">
                        <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" style={{ color: '#fca5a5' }} />
                        <span className="text-[11px]" style={{ color: '#fca5a5' }}>
                          {svc.lastError}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Footer: links + last check */}
                  <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
                    <div className="flex flex-wrap gap-1.5">
                      {svc.links.map((link) => (
                        <a
                          key={link.url}
                          href={link.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors"
                          style={{
                            background: 'rgba(37,99,235,0.12)',
                            color: '#93c5fd',
                            border: '1px solid rgba(37,99,235,0.4)',
                          }}
                        >
                          <ExternalLink className="h-3 w-3" />
                          {link.label}
                        </a>
                      ))}
                    </div>
                    {lastChecked && (
                      <div className="text-right">
                        <span style={{ color: 'var(--color-text-muted)' }}>
                          Checked {lastChecked}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

