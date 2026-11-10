/**
 * Business settings: profile, currency/timezone and branches.
 * Tenant scope always comes from the signed-in session.
 */

import { useEffect, useState } from 'react';
import { Building2, Plus, RefreshCw, Save } from 'lucide-react';
import { apiGet, apiPatch, apiPost, errorMessage } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useApi } from './useApi';
import { Card, ErrorBlock, LoadingBlock, Page } from './ui';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/StatusComponents';
import { Modal } from '../components/ui/Modal';
import { FormField, Input, Select } from '../components/ui/FormControls';
import type { Branch } from './types';

interface BusinessProfile {
  id: string;
  name: string;
  legalName: string | null;
  email: string | null;
  phone: string | null;
  country: string;
  currency: string;
  timezone: string;
  status: string;
}

export function SettingsPage() {
  const { can, refresh } = useAuth();
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [branchOpen, setBranchOpen] = useState(false);
  const [branchForm, setBranchForm] = useState({ name: '', code: '', address: '', city: '', phone: '', isDefault: false });
  const [formError, setFormError] = useState<string | null>(null);

  const business = useApi(() => apiGet<{ business: BusinessProfile }>('/api/business/profile'));
  const branches = useApi(() => apiGet<{ branches: Branch[] }>('/api/branches'));

  const canWrite = can('business.write');
  const canBranch = can('branch.write');

  useEffect(() => {
    if (business.data?.business) setProfile(business.data.business);
  }, [business.data]);

  async function saveProfile() {
    if (!profile) return;
    setSaving(true);
    setMessage(null);
    try {
      await apiPatch('/api/business/profile', {
        name: profile.name,
        legalName: profile.legalName || null,
        email: profile.email || null,
        phone: profile.phone || null,
        country: profile.country || null,
        currency: profile.currency,
        timezone: profile.timezone,
      });
      setMessage({ tone: 'ok', text: 'Business profile saved.' });
      business.reload();
      await refresh();
    } catch (err) {
      setMessage({ tone: 'error', text: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  async function createBranch() {
    setSaving(true);
    setFormError(null);
    try {
      await apiPost('/api/branches', {
        name: branchForm.name,
        code: branchForm.code || null,
        address: branchForm.address || null,
        city: branchForm.city || null,
        phone: branchForm.phone || null,
        isDefault: branchForm.isDefault,
      });
      setBranchOpen(false);
      setBranchForm({ name: '', code: '', address: '', city: '', phone: '', isDefault: false });
      setMessage({ tone: 'ok', text: 'Branch created.' });
      branches.reload();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function toggleBranch(branch: Branch) {
    setMessage(null);
    try {
      await apiPatch(`/api/branches/${branch.id}`, { status: branch.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' });
      branches.reload();
    } catch (err) {
      setMessage({ tone: 'error', text: errorMessage(err) });
    }
  }

  return (
    <Page
      title="Settings"
      subtitle="Business profile, reporting currency and branch structure."
      actions={
        <Button variant="outline" size="sm" icon={<RefreshCw className="w-3.5 h-3.5" />} onClick={() => { business.reload(); branches.reload(); }}>
          Refresh
        </Button>
      }
    >
      {message && (
        <div className={`rounded-xl border px-4 py-2.5 text-xs ${message.tone === 'ok' ? 'border-[#12B981]/30 bg-[#12B981]/8 text-[#0D7A54]' : 'border-[#EF4444]/25 bg-[#EF4444]/5 text-[#B42318]'}`}>
          {message.text}
        </div>
      )}

      <Card title="Business profile" subtitle="Shown on invoices and used for reporting defaults">
        {business.error ? (
          <ErrorBlock message={business.error} onRetry={business.reload} />
        ) : business.loading || !profile ? (
          <LoadingBlock />
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField label="Business name" required htmlFor="biz-name">
                <Input id="biz-name" value={profile.name} disabled={!canWrite} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
              </FormField>
              <FormField label="Legal name" htmlFor="biz-legal">
                <Input id="biz-legal" value={profile.legalName ?? ''} disabled={!canWrite} onChange={(e) => setProfile({ ...profile, legalName: e.target.value })} />
              </FormField>
              <FormField label="Email" htmlFor="biz-email">
                <Input id="biz-email" type="email" value={profile.email ?? ''} disabled={!canWrite} onChange={(e) => setProfile({ ...profile, email: e.target.value })} />
              </FormField>
              <FormField label="Phone" htmlFor="biz-phone">
                <Input id="biz-phone" value={profile.phone ?? ''} disabled={!canWrite} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
              </FormField>
              <FormField label="Country" htmlFor="biz-country">
                <Input id="biz-country" value={profile.country} disabled={!canWrite} onChange={(e) => setProfile({ ...profile, country: e.target.value })} />
              </FormField>
              <FormField label="Currency" htmlFor="biz-currency" hint="Phase 3 room pricing is TZS; finance records use the business currency.">
                <Select id="biz-currency" value={profile.currency} disabled={!canWrite} onChange={(e) => setProfile({ ...profile, currency: e.target.value })}
                  options={[{ value: 'TZS', label: 'TZS — Tanzanian Shilling' }]} />
              </FormField>
              <FormField label="Timezone" htmlFor="biz-timezone">
                <Input id="biz-timezone" value={profile.timezone} disabled={!canWrite} onChange={(e) => setProfile({ ...profile, timezone: e.target.value })} />
              </FormField>
              <FormField label="Status" htmlFor="biz-status">
                <Input id="biz-status" value={profile.status} readOnly disabled />
              </FormField>
            </div>
            {canWrite && (
              <div className="flex justify-end">
                <Button loading={saving} icon={<Save className="w-3.5 h-3.5" />} onClick={saveProfile} disabled={!profile.name.trim()}>
                  Save profile
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>

      <Card
        title="Branches"
        subtitle="Operational locations for this business"
        actions={
          canBranch ? (
            <Button variant="secondary" size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => { setFormError(null); setBranchOpen(true); }}>
              New branch
            </Button>
          ) : null
        }
      >
        {branches.error ? (
          <ErrorBlock message={branches.error} onRetry={branches.reload} />
        ) : branches.loading ? (
          <LoadingBlock />
        ) : (
          <ul className="divide-y divide-[#E1EAF5]">
            {branches.data?.branches.map((branch) => (
              <li key={branch.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg bg-[#EAF3FF] text-[#1769E8] flex items-center justify-center">
                    <Building2 className="w-3.5 h-3.5" />
                  </span>
                  <div>
                    <p className="font-semibold text-[#152B4A]">
                      {branch.name}
                      {branch.isDefault && <span className="ml-2 text-[10px] font-normal text-[#1769E8]">default</span>}
                    </p>
                    <p className="text-[10px] text-[#8EA2BC]">
                      {[branch.code, branch.city, branch.address].filter(Boolean).join(' · ') || 'No address recorded'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge label={branch.status} tone={branch.status === 'ACTIVE' ? 'success' : 'neutral'} />
                  {canBranch && (
                    <Button size="sm" variant="ghost" onClick={() => toggleBranch(branch)}>
                      {branch.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                    </Button>
                  )}
                </div>
              </li>
            ))}
            {(branches.data?.branches.length ?? 0) === 0 && (
              <li className="py-3 text-xs text-[#8EA2BC]">No branches yet.</li>
            )}
          </ul>
        )}
      </Card>

      <Modal
        isOpen={branchOpen}
        onClose={() => setBranchOpen(false)}
        title="New branch"
        description="Branch names are unique per business."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setBranchOpen(false)}>Cancel</Button>
            <Button loading={saving} onClick={createBranch} disabled={!branchForm.name.trim()}>Create branch</Button>
          </div>
        }
      >
        <div className="space-y-3">
          {formError && <p className="text-xs text-[#B42318]">{formError}</p>}
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Name" required htmlFor="branch-name">
              <Input id="branch-name" value={branchForm.name} onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })} />
            </FormField>
            <FormField label="Code" htmlFor="branch-code">
              <Input id="branch-code" value={branchForm.code} onChange={(e) => setBranchForm({ ...branchForm, code: e.target.value })} placeholder="Optional" />
            </FormField>
          </div>
          <FormField label="Address" htmlFor="branch-address">
            <Input id="branch-address" value={branchForm.address} onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value })} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="City" htmlFor="branch-city">
              <Input id="branch-city" value={branchForm.city} onChange={(e) => setBranchForm({ ...branchForm, city: e.target.value })} />
            </FormField>
            <FormField label="Phone" htmlFor="branch-phone">
              <Input id="branch-phone" value={branchForm.phone} onChange={(e) => setBranchForm({ ...branchForm, phone: e.target.value })} />
            </FormField>
          </div>
          <label className="flex items-center gap-2 text-xs text-[#5B6B82]">
            <input
              type="checkbox"
              checked={branchForm.isDefault}
              onChange={(e) => setBranchForm({ ...branchForm, isDefault: e.target.checked })}
              className="rounded border-[#D8E3F1]"
            />
            Make this the default branch
          </label>
        </div>
      </Modal>
    </Page>
  );
}
