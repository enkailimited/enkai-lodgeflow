/**
 * Platform administration: tenant lifecycle, aggregate health and the platform
 * audit trail. Elevated access to a tenant workspace is read-only and audited.
 */

import { useState } from 'react';
import { Building2, Eye, Plus, RefreshCw, ShieldCheck, Activity } from 'lucide-react';
import { apiGet, apiPatch, apiPost, errorMessage } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useApi } from './useApi';
import { Card, EmptyBlock, ErrorBlock, LoadingBlock, Page, dateOnly, dateTime } from './ui';
import { Button } from '../components/ui/Button';
import { DataTable, StatCard, type DataTableColumn } from '../components/ui/DataPresentation';
import { StatusBadge } from '../components/ui/StatusComponents';
import { Modal } from '../components/ui/Modal';
import { FormField, Input } from '../components/ui/FormControls';
import type { AuditLog, Tenant } from './types';

interface PlatformHealth {
  database: string;
  counts: {
    tenants: number;
    active_tenants: number;
    business_users: number;
    rooms: number;
    open_alerts: number;
  };
  serverTime: string;
}

export function PlatformPage({ onEnterTenant }: { onEnterTenant: (tenantId: string, tenantName: string) => void }) {
  const { can } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    slug: '',
    ownerName: '',
    ownerEmail: '',
    ownerPassword: '',
    country: 'Tanzania',
    currency: 'TZS',
    branchName: 'Main Branch',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const tenants = useApi(() => apiGet<{ tenants: Tenant[] }>('/api/platform/tenants'));
  const health = useApi(() => apiGet<PlatformHealth>('/api/platform/health'));
  const audits = useApi(() => apiGet<{ logs: AuditLog[] }>('/api/platform/audit-logs?limit=50'));

  const canWrite = can('platform.tenants.write');
  const canReadAudit = can('platform.audit.read');

  async function createTenant() {
    setSaving(true);
    setFormError(null);
    try {
      await apiPost('/api/platform/tenants', {
        ...form,
        slug: form.slug.trim().toLowerCase(),
      });
      setCreateOpen(false);
      setForm({ name: '', slug: '', ownerName: '', ownerEmail: '', ownerPassword: '', country: 'Tanzania', currency: 'TZS', branchName: 'Main Branch' });
      setMessage({ tone: 'ok', text: 'Business created with an owner account.' });
      tenants.reload();
      health.reload();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(tenant: Tenant, status: string) {
    setMessage(null);
    try {
      await apiPatch(`/api/platform/tenants/${tenant.id}`, { status });
      setMessage({ tone: 'ok', text: `${tenant.name} is now ${status}.` });
      tenants.reload();
      health.reload();
    } catch (err) {
      setMessage({ tone: 'error', text: errorMessage(err) });
    }
  }

  const columns: DataTableColumn<Tenant>[] = [
    {
      key: 'name',
      header: 'Business',
      render: (row) => (
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg bg-[#EAF3FF] text-[#1769E8] flex items-center justify-center shrink-0">
            <Building2 className="w-3.5 h-3.5" />
          </span>
          <div>
            <p className="font-semibold text-[#152B4A]">{row.name}</p>
            <p className="text-[10px] text-[#8EA2BC]">{row.slug} · {row.email ?? 'no email'}</p>
          </div>
        </div>
      ),
    },
    { key: 'country', header: 'Country', render: (row) => row.country },
    { key: 'currency', header: 'Currency', render: (row) => row.currency },
    { key: 'created', header: 'Created', render: (row) => dateOnly(row.createdAt) },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <StatusBadge
          label={row.status}
          tone={row.status === 'ACTIVE' ? 'success' : row.status === 'SUSPENDED' ? 'warning' : row.status === 'DEACTIVATED' ? 'danger' : 'neutral'}
        />
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <div className="flex flex-wrap justify-end gap-1">
          {row.status === 'ACTIVE' && (
            <Button size="sm" variant="ghost" icon={<Eye className="w-3.5 h-3.5" />} onClick={() => onEnterTenant(row.id, row.name)}>
              Read workspace
            </Button>
          )}
          {canWrite && row.status !== 'ACTIVE' && (
            <Button size="sm" variant="ghost" onClick={() => setStatus(row, 'ACTIVE')}>Activate</Button>
          )}
          {canWrite && row.status === 'ACTIVE' && (
            <Button size="sm" variant="ghost" onClick={() => setStatus(row, 'SUSPENDED')}>Suspend</Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <Page
      title="Platform administration"
      subtitle="Tenants, platform health and audited cross-tenant access."
      actions={
        <div className="flex gap-2">
          <Button variant="outline" size="sm" icon={<RefreshCw className="w-3.5 h-3.5" />} onClick={() => { tenants.reload(); health.reload(); audits.reload(); }}>
            Refresh
          </Button>
          {canWrite && (
            <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => { setFormError(null); setCreateOpen(true); }}>
              New business
            </Button>
          )}
        </div>
      }
    >
      {message && (
        <div className={`rounded-xl border px-4 py-2.5 text-xs ${message.tone === 'ok' ? 'border-[#12B981]/30 bg-[#12B981]/8 text-[#0D7A54]' : 'border-[#EF4444]/25 bg-[#EF4444]/5 text-[#B42318]'}`}>
          {message.text}
        </div>
      )}

      {health.error ? (
        <ErrorBlock message={health.error} onRetry={health.reload} />
      ) : health.loading ? (
        <LoadingBlock />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard label="Businesses" value={health.data?.counts.tenants ?? 0} supportingText={`${health.data?.counts.active_tenants ?? 0} active`} icon={<Building2 className="w-5 h-5" />} iconTone="navy" />
          <StatCard label="Business users" value={health.data?.counts.business_users ?? 0} supportingText="Across all tenants" icon={<ShieldCheck className="w-5 h-5" />} iconTone="blue" />
          <StatCard label="Rooms" value={health.data?.counts.rooms ?? 0} supportingText="Active rooms platform-wide" icon={<Activity className="w-5 h-5" />} iconTone="green" />
          <StatCard label="Open CCTV alerts" value={health.data?.counts.open_alerts ?? 0} supportingText="Aggregate only — no room data" icon={<Activity className="w-5 h-5" />} iconTone="amber" />
        </div>
      )}

      <Card title="Businesses" subtitle={`${tenants.data?.tenants.length ?? 0} tenant(s) registered`}>
        {tenants.error ? (
          <ErrorBlock message={tenants.error} onRetry={tenants.reload} />
        ) : tenants.loading ? (
          <LoadingBlock />
        ) : (tenants.data?.tenants.length ?? 0) === 0 ? (
          <EmptyBlock title="No businesses yet" description="Create the first business to provision its owner account, branch and role templates." />
        ) : (
          <DataTable columns={columns} data={tenants.data?.tenants ?? []} rowKey={(row) => row.id} />
        )}
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card title="Platform health" subtitle="Database connectivity and aggregate counts">
          {health.error ? (
            <ErrorBlock message={health.error} onRetry={health.reload} />
          ) : health.loading ? (
            <LoadingBlock />
          ) : (
            <dl className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl border border-[#E1EAF5] px-3 py-2">
                <dt className="text-[10px] uppercase tracking-wide text-[#8EA2BC]">Database</dt>
                <dd className="mt-0.5 font-semibold text-[#0D7A54]">{health.data?.database}</dd>
              </div>
              <div className="rounded-xl border border-[#E1EAF5] px-3 py-2">
                <dt className="text-[10px] uppercase tracking-wide text-[#8EA2BC]">Server time</dt>
                <dd className="mt-0.5 font-semibold text-[#152B4A]">{dateTime(health.data?.serverTime)}</dd>
              </div>
            </dl>
          )}
        </Card>

        <Card title="Platform audit trail" subtitle="Cross-tenant access and tenant lifecycle events">
          {!canReadAudit ? (
            <p className="text-xs text-[#8EA2BC]">Your platform role cannot read audit logs.</p>
          ) : audits.error ? (
            <ErrorBlock message={audits.error} onRetry={audits.reload} />
          ) : audits.loading ? (
            <LoadingBlock />
          ) : (audits.data?.logs.length ?? 0) === 0 ? (
            <p className="text-xs text-[#8EA2BC]">No platform audit entries yet.</p>
          ) : (
            <ul className="divide-y divide-[#E1EAF5] text-xs max-h-64 overflow-y-auto">
              {audits.data?.logs.map((log) => (
                <li key={log.id} className="py-2">
                  <p className="font-semibold text-[#152B4A]">{log.action}</p>
                  <p className="text-[10px] text-[#8EA2BC]">
                    {log.actor_email ?? 'system'} · {dateTime(log.created_at)}
                    {log.entity_type ? ` · ${log.entity_type}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Modal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New business"
        description="Creates the tenant, its first branch, role templates and owner account atomically."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              loading={saving}
              onClick={createTenant}
              disabled={!form.name.trim() || !form.slug.trim() || !form.ownerName.trim() || !form.ownerEmail.trim() || form.ownerPassword.length < 8}
            >
              Create business
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          {formError && <p className="text-xs text-[#B42318]">{formError}</p>}
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Business name" required htmlFor="ten-name">
              <Input id="ten-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </FormField>
            <FormField label="Slug" required htmlFor="ten-slug" hint="Lowercase letters, numbers and hyphens.">
              <Input id="ten-slug" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="acacia-lodge" />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Default branch name" htmlFor="ten-branch">
              <Input id="ten-branch" value={form.branchName} onChange={(e) => setForm({ ...form, branchName: e.target.value })} />
            </FormField>
            <FormField label="Country" htmlFor="ten-country">
              <Input id="ten-country" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
            </FormField>
          </div>
          <FormField label="Owner name" required htmlFor="ten-owner">
            <Input id="ten-owner" value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Owner email" required htmlFor="ten-owner-email">
              <Input id="ten-owner-email" type="email" value={form.ownerEmail} onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })} />
            </FormField>
            <FormField label="Owner password" required htmlFor="ten-owner-password" hint="At least 8 characters.">
              <Input id="ten-owner-password" type="password" value={form.ownerPassword} onChange={(e) => setForm({ ...form, ownerPassword: e.target.value })} />
            </FormField>
          </div>
        </div>
      </Modal>
    </Page>
  );
}
