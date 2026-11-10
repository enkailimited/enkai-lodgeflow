/**
 * Guest directory backed by /api/guests. Search is server-side and every
 * profile edit is validated by the backend.
 */

import { useState } from 'react';
import { Plus, RefreshCw, Search, UserRound } from 'lucide-react';
import { apiGet, apiPatch, apiPost, buildQuery, errorMessage } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useApi } from './useApi';
import { Card, EmptyBlock, ErrorBlock, LoadingBlock, Page, dateOnly } from './ui';
import { Button } from '../components/ui/Button';
import { DataTable, type DataTableColumn } from '../components/ui/DataPresentation';
import { StatusBadge } from '../components/ui/StatusComponents';
import { Modal } from '../components/ui/Modal';
import { Checkbox, FormField, Input, Textarea } from '../components/ui/FormControls';
import type { Guest } from './types';

const emptyForm = {
  fullName: '',
  email: '',
  phone: '',
  nationality: '',
  idType: '',
  idNumber: '',
  address: '',
  notes: '',
  marketingConsent: false,
};

export function GuestsPage() {
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Guest | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const guests = useApi(
    () => apiGet<{ guests: Guest[]; total: number }>(`/api/guests${buildQuery({ search: query, limit: 100 })}`),
    [query]
  );

  const canWrite = can('guest.write');

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(guest: Guest) {
    setEditing(guest);
    setForm({
      fullName: guest.fullName,
      email: guest.email ?? '',
      phone: guest.phone ?? '',
      nationality: guest.nationality ?? '',
      idType: guest.idType ?? '',
      idNumber: guest.idNumber ?? '',
      address: guest.address ?? '',
      notes: guest.notes ?? '',
      marketingConsent: guest.marketingConsent,
    });
    setFormError(null);
    setFormOpen(true);
  }

  async function submit() {
    setSaving(true);
    setFormError(null);
    const payload = {
      fullName: form.fullName,
      email: form.email || null,
      phone: form.phone || null,
      nationality: form.nationality || null,
      idType: form.idType || null,
      idNumber: form.idNumber || null,
      address: form.address || null,
      notes: form.notes || null,
    };
    try {
      if (editing) {
        await apiPatch(`/api/guests/${editing.id}`, payload);
        setMessage('Guest profile updated.');
      } else {
        await apiPost('/api/guests', { ...payload, marketingConsent: form.marketingConsent });
        setMessage('Guest created.');
      }
      setFormOpen(false);
      guests.reload();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const columns: DataTableColumn<Guest>[] = [
    {
      key: 'name',
      header: 'Guest',
      render: (row) => (
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-full bg-[#EAF3FF] text-[#1769E8] flex items-center justify-center shrink-0">
            <UserRound className="w-3.5 h-3.5" />
          </span>
          <div>
            <p className="font-semibold text-[#152B4A]">{row.fullName}</p>
            <p className="text-[10px] text-[#8EA2BC]">{row.email ?? row.phone ?? 'No contact details'}</p>
          </div>
        </div>
      ),
    },
    { key: 'phone', header: 'Phone', render: (row) => row.phone ?? '—' },
    {
      key: 'id',
      header: 'Identification',
      render: (row) => (row.idType || row.idNumber ? `${row.idType ?? 'ID'} ${row.idNumber ?? ''}`.trim() : '—'),
    },
    { key: 'nationality', header: 'Nationality', render: (row) => row.nationality ?? '—' },
    {
      key: 'consent',
      header: 'Marketing',
      render: (row) => (
        <StatusBadge label={row.marketingConsent ? 'Consented' : 'No consent'} tone={row.marketingConsent ? 'success' : 'neutral'} />
      ),
    },
    { key: 'created', header: 'Added', render: (row) => dateOnly(row.createdAt) },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) =>
        canWrite ? (
          <Button size="sm" variant="ghost" onClick={() => openEdit(row)}>
            Edit
          </Button>
        ) : null,
    },
  ];

  return (
    <Page
      title="Guests"
      subtitle="Guest directory and contact history for your business."
      actions={
        <div className="flex gap-2">
          <Button variant="outline" size="sm" icon={<RefreshCw className="w-3.5 h-3.5" />} onClick={guests.reload}>
            Refresh
          </Button>
          {canWrite && (
            <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={openCreate}>
              Add guest
            </Button>
          )}
        </div>
      }
    >
      {message && (
        <div className="rounded-xl border border-[#12B981]/30 bg-[#12B981]/8 px-4 py-2.5 text-xs text-[#0D7A54]">
          {message}
        </div>
      )}

      <Card
        title="Guest register"
        subtitle={`${guests.data?.total ?? 0} guest record(s) for this business`}
        actions={
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setQuery(search.trim());
            }}
          >
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#8EA2BC] absolute left-2.5 top-1/2 -translate-y-1/2" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, email or phone"
                className="w-56 pl-8"
              />
            </div>
            <Button type="submit" variant="secondary" size="sm">
              Search
            </Button>
          </form>
        }
      >
        {guests.error ? (
          <ErrorBlock message={guests.error} onRetry={guests.reload} />
        ) : guests.loading ? (
          <LoadingBlock />
        ) : (guests.data?.guests.length ?? 0) === 0 ? (
          <EmptyBlock
            title={query ? 'No matching guests' : 'No guests yet'}
            description={
              query
                ? `Nothing matches “${query}”. Try a different name, email or phone number.`
                : 'Add the first guest to start taking reservations.'
            }
          />
        ) : (
          <DataTable columns={columns} data={guests.data?.guests ?? []} rowKey={(row) => row.id} />
        )}
      </Card>

      <Modal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Edit guest' : 'Add guest'}
        description="Fields are stored exactly as entered; blank optional fields stay blank."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button loading={saving} onClick={submit} disabled={!form.fullName.trim()}>
              {editing ? 'Save changes' : 'Create guest'}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          {formError && <p className="text-xs text-[#B42318]">{formError}</p>}
          <FormField label="Full name" required htmlFor="guest-name">
            <Input id="guest-name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Email" htmlFor="guest-email">
              <Input id="guest-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </FormField>
            <FormField label="Phone" htmlFor="guest-phone">
              <Input id="guest-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Nationality" htmlFor="guest-nationality">
              <Input id="guest-nationality" value={form.nationality} onChange={(e) => setForm({ ...form, nationality: e.target.value })} />
            </FormField>
            <FormField label="ID type" htmlFor="guest-idtype">
              <Input id="guest-idtype" value={form.idType} onChange={(e) => setForm({ ...form, idType: e.target.value })} placeholder="Passport, NIDA…" />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="ID number" htmlFor="guest-idnumber">
              <Input id="guest-idnumber" value={form.idNumber} onChange={(e) => setForm({ ...form, idNumber: e.target.value })} />
            </FormField>
            <FormField label="Address" htmlFor="guest-address">
              <Input id="guest-address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </FormField>
          </div>
          <FormField label="Notes" htmlFor="guest-notes">
            <Textarea id="guest-notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </FormField>
          {!editing && (
            <Checkbox
              checked={form.marketingConsent}
              onChange={(checked) => setForm({ ...form, marketingConsent: checked })}
              label="Marketing consent"
              description="Only enable when the guest explicitly agreed."
            />
          )}
        </div>
      </Modal>
    </Page>
  );
}
