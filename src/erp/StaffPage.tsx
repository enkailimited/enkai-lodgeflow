/**
 * Staff directory and role assignment. Passwords are hashed by the server;
 * role keys come from the business role catalog for this tenant.
 */

import { useState } from 'react';
import { Plus, RefreshCw, UserCog } from 'lucide-react';
import { apiGet, apiPatch, apiPost, errorMessage } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useApi } from './useApi';
import { Card, EmptyBlock, ErrorBlock, LoadingBlock, Page, dateOnly, dateTime } from './ui';
import { Button } from '../components/ui/Button';
import { DataTable, type DataTableColumn } from '../components/ui/DataPresentation';
import { StatusBadge } from '../components/ui/StatusComponents';
import { Modal } from '../components/ui/Modal';
import { FormField, Input, Select } from '../components/ui/FormControls';
import type { Branch, Role, StaffMember } from './types';

export function StaffPage() {
  const { can, user } = useAuth();
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ email: '', displayName: '', phone: '', password: '', roleKey: '', branchId: '' });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const staff = useApi(() => apiGet<{ staff: StaffMember[] }>('/api/staff'));
  const roles = useApi(() => apiGet<{ roles: Role[] }>('/api/staff/roles'));
  const branches = useApi(() => apiGet<{ branches: Branch[] }>('/api/branches'));

  const canWrite = can('staff.write');

  async function createStaff() {
    setSaving(true);
    setFormError(null);
    try {
      await apiPost('/api/staff', {
        email: form.email,
        displayName: form.displayName,
        phone: form.phone || null,
        password: form.password,
        roleKey: form.roleKey,
        branchId: form.branchId || null,
      });
      setFormOpen(false);
      setForm({ email: '', displayName: '', phone: '', password: '', roleKey: '', branchId: '' });
      setMessage({ tone: 'ok', text: 'Staff account created.' });
      staff.reload();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(member: StaffMember, status: string) {
    setMessage(null);
    try {
      await apiPatch(`/api/staff/${member.id}`, { status });
      setMessage({ tone: 'ok', text: `${member.displayName} is now ${status}.` });
      staff.reload();
    } catch (err) {
      setMessage({ tone: 'error', text: errorMessage(err) });
    }
  }

  const columns: DataTableColumn<StaffMember>[] = [
    {
      key: 'name',
      header: 'Staff member',
      render: (row) => (
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-full bg-[#082B59] text-white text-[10px] font-bold flex items-center justify-center shrink-0">
            {row.displayName.slice(0, 2).toUpperCase()}
          </span>
          <div>
            <p className="font-semibold text-[#152B4A]">{row.displayName}</p>
            <p className="text-[10px] text-[#8EA2BC]">{row.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'roles',
      header: 'Roles',
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.roles.length === 0 ? <span className="text-[#8EA2BC]">No role</span> : row.roles.map((role) => (
            <StatusBadge key={role} label={role.replace(/_/g, ' ')} tone="navy" />
          ))}
        </div>
      ),
    },
    { key: 'phone', header: 'Phone', render: (row) => row.phone ?? '—' },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <StatusBadge label={row.status} tone={row.status === 'ACTIVE' ? 'success' : row.status === 'SUSPENDED' ? 'warning' : 'danger'} />
      ),
    },
    { key: 'lastLogin', header: 'Last sign-in', render: (row) => (row.lastLoginAt ? dateTime(row.lastLoginAt) : 'Never') },
    { key: 'created', header: 'Added', render: (row) => dateOnly(row.createdAt) },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) =>
        canWrite && row.id !== user?.id ? (
          <Select
            value={row.status}
            onChange={(e) => changeStatus(row, e.target.value)}
            options={['ACTIVE', 'SUSPENDED', 'DEACTIVATED'].map((value) => ({ value, label: value }))}
            className="h-7 text-[10px] w-32"
            aria-label={`Change status for ${row.displayName}`}
          />
        ) : null,
    },
  ];

  return (
    <Page
      title="Staff"
      subtitle="Accounts, roles and access status for this business."
      actions={
        <div className="flex gap-2">
          <Button variant="outline" size="sm" icon={<RefreshCw className="w-3.5 h-3.5" />} onClick={staff.reload}>
            Refresh
          </Button>
          {canWrite && (
            <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => { setFormError(null); setFormOpen(true); }}>
              Add staff
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

      <Card title="Staff directory" subtitle={`${staff.data?.staff.length ?? 0} account(s)`}>
        {staff.error ? (
          <ErrorBlock message={staff.error} onRetry={staff.reload} />
        ) : staff.loading ? (
          <LoadingBlock />
        ) : (staff.data?.staff.length ?? 0) === 0 ? (
          <EmptyBlock title="No staff accounts" description="Add a staff account and assign a role to delegate work." />
        ) : (
          <DataTable columns={columns} data={staff.data?.staff ?? []} rowKey={(row) => row.id} />
        )}
      </Card>

      <Card title="Role templates" subtitle="Seeded per business; permissions are enforced by the API">
        {roles.loading ? (
          <LoadingBlock />
        ) : (roles.data?.roles.length ?? 0) === 0 ? (
          <p className="text-xs text-[#8EA2BC]">No roles found for this business.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
            {roles.data?.roles.map((role) => (
              <div key={role.id} className="rounded-xl border border-[#E1EAF5] bg-[#F9FBFE] px-3 py-2.5">
                <p className="text-xs font-semibold text-[#152B4A] flex items-center gap-1.5">
                  <UserCog className="w-3.5 h-3.5 text-[#1769E8]" />
                  {role.name}
                </p>
                <p className="text-[10px] text-[#8EA2BC] mt-0.5">{role.description ?? role.key}</p>
                <p className="text-[10px] text-[#5B6B82] mt-1">{role.permissions.length} permission(s)</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        title="Add staff account"
        description="The account is scoped to this business only."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button loading={saving} onClick={createStaff} disabled={!form.email || !form.displayName || form.password.length < 8 || !form.roleKey}>
              Create account
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          {formError && <p className="text-xs text-[#B42318]">{formError}</p>}
          <FormField label="Full name" required htmlFor="staff-name">
            <Input id="staff-name" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Email" required htmlFor="staff-email">
              <Input id="staff-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </FormField>
            <FormField label="Phone" htmlFor="staff-phone">
              <Input id="staff-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </FormField>
          </div>
          <FormField label="Temporary password" required htmlFor="staff-password" hint="At least 8 characters. The user should change it after signing in.">
            <Input id="staff-password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Role" required htmlFor="staff-role">
              <Select id="staff-role" value={form.roleKey} onChange={(e) => setForm({ ...form, roleKey: e.target.value })}
                options={[{ value: '', label: 'Select a role' }, ...(roles.data?.roles ?? []).map((role) => ({ value: role.key, label: role.name }))]} />
            </FormField>
            <FormField label="Branch" htmlFor="staff-branch" hint="Optional: restrict to one branch.">
              <Select id="staff-branch" value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}
                options={[{ value: '', label: 'All branches' }, ...(branches.data?.branches ?? []).map((branch) => ({ value: branch.id, label: branch.name }))]} />
            </FormField>
          </div>
        </div>
      </Modal>
    </Page>
  );
}
