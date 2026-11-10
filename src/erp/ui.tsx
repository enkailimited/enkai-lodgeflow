/**
 * Shared page primitives: real loading, error-with-retry and empty states.
 */

import React from 'react';
import { AlertTriangle, Inbox, RefreshCw } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { PageHeader } from '../components/ui/DataPresentation';
import { EmptyState } from '../components/ui/StatusComponents';

export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sm text-[#718096]">
      <RefreshCw className="w-4 h-4 animate-spin" />
      <span>{label}</span>
    </div>
  );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-[#EF4444]/25 bg-[#EF4444]/5 p-5 flex items-start gap-3">
      <AlertTriangle className="w-5 h-5 text-[#DC2626] shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="text-sm font-semibold text-[#152B4A]">The data could not be loaded</p>
        <p className="text-xs text-[#718096] mt-1">{message}</p>
      </div>
      <Button variant="outline" size="sm" icon={<RefreshCw className="w-3.5 h-3.5" />} onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

export function EmptyBlock({ title, description }: { title: string; description: string }) {
  return (
    <EmptyState
      icon={<Inbox className="w-5 h-5" />}
      title={title}
      description={description}
    />
  );
}

export function Page({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-5">
      <PageHeader title={title} subtitle={subtitle} actions={actions} />
      {children}
    </div>
  );
}

export function Card({
  title,
  subtitle,
  actions,
  children,
  className = '',
}: {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`bg-white border border-[#E1EAF5] rounded-2xl shadow-xs ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-[#E1EAF5]">
          <div>
            {title && <h2 className="text-sm font-bold text-[#152B4A]">{title}</h2>}
            {subtitle && <p className="text-xs text-[#718096] mt-0.5">{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function money(value: number | null | undefined, currency = 'TZS'): string {
  if (value === null || value === undefined) return '—';
  return `${currency} ${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function dateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

export function dateOnly(value: string | null | undefined): string {
  if (!value) return '—';
  return value.slice(0, 10);
}
