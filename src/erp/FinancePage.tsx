/**
 * Finance: server-computed totals, invoices, payments and expenses.
 * Overpayment and status changes are rejected by the backend, so the UI shows
 * the returned error instead of guessing.
 */

import { useState } from 'react';
import { Banknote, CircleDollarSign, Plus, Receipt, RefreshCw, TrendingDown } from 'lucide-react';
import { apiGet, apiPost, buildQuery, errorMessage } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useApi } from './useApi';
import { Card, EmptyBlock, ErrorBlock, LoadingBlock, Page, dateOnly, money } from './ui';
import { Button } from '../components/ui/Button';
import { DataTable, StatCard, type DataTableColumn } from '../components/ui/DataPresentation';
import { StatusBadge } from '../components/ui/StatusComponents';
import { Modal } from '../components/ui/Modal';
import { FormField, Input, Select, Textarea } from '../components/ui/FormControls';
import type { Expense, FinanceSummary, Guest, Invoice, Payment } from './types';

const INVOICE_STATUSES = ['', 'DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID'];

function invoiceTone(status: string): 'success' | 'info' | 'warning' | 'danger' | 'neutral' {
  if (status === 'PAID') return 'success';
  if (status === 'PARTIALLY_PAID') return 'warning';
  if (status === 'VOID') return 'danger';
  if (status === 'ISSUED') return 'info';
  return 'neutral';
}

export function FinancePage() {
  const { can, user } = useAuth();
  const currency = user?.currency ?? 'TZS';
  const today = new Date().toISOString().slice(0, 10);
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState(today.slice(0, 8) + '01');
  const [to, setTo] = useState(today);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState<Invoice | null>(null);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [invoiceForm, setInvoiceForm] = useState({
    guestId: '',
    taxRate: '0',
    notes: '',
    items: [{ description: 'Room charge', quantity: '1', unitPrice: '' }],
  });
  const [paymentForm, setPaymentForm] = useState({ amount: '', method: 'CASH', reference: '' });
  const [expenseForm, setExpenseForm] = useState({
    category: 'OPERATIONS',
    description: '',
    amount: '',
    method: 'CASH',
    reference: '',
  });

  const summary = useApi(
    () => apiGet<{ summary: FinanceSummary; from: string; to: string }>(`/api/finance/summary${buildQuery({ from, to })}`),
    [from, to]
  );
  const invoices = useApi(
    () => apiGet<{ invoices: Invoice[]; total: number }>(`/api/finance/invoices${buildQuery({ status, limit: 100 })}`),
    [status]
  );
  const payments = useApi(() => apiGet<{ payments: Payment[] }>(`/api/finance/payments${buildQuery({ from, to })}`), [from, to]);
  const expenses = useApi(() => apiGet<{ expenses: Expense[] }>(`/api/finance/expenses${buildQuery({ from, to })}`), [from, to]);
  const guests = useApi(() => apiGet<{ guests: Guest[] }>('/api/guests?limit=200'));

  const canWrite = can('finance.write');

  async function createInvoice() {
    setSaving(true);
    setFormError(null);
    try {
      await apiPost('/api/finance/invoices', {
        guestId: invoiceForm.guestId || null,
        items: invoiceForm.items.map((item) => ({
          description: item.description,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
        })),
        taxRate: Number(invoiceForm.taxRate),
        notes: invoiceForm.notes || null,
      });
      setInvoiceOpen(false);
      setMessage({ tone: 'ok', text: 'Invoice issued.' });
      setInvoiceForm({
        guestId: '',
        taxRate: '0',
        notes: '',
        items: [{ description: 'Room charge', quantity: '1', unitPrice: '' }],
      });
      invoices.reload();
      summary.reload();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function recordPayment() {
    if (!paymentTarget) return;
    setSaving(true);
    setFormError(null);
    try {
      await apiPost('/api/finance/payments', {
        invoiceId: paymentTarget.id,
        amount: Number(paymentForm.amount),
        method: paymentForm.method,
        reference: paymentForm.reference || null,
      });
      setPaymentTarget(null);
      setPaymentForm({ amount: '', method: 'CASH', reference: '' });
      setMessage({ tone: 'ok', text: `Payment recorded against ${paymentTarget.number}.` });
      invoices.reload();
      payments.reload();
      summary.reload();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function createExpense() {
    setSaving(true);
    setFormError(null);
    try {
      await apiPost('/api/finance/expenses', {
        category: expenseForm.category,
        description: expenseForm.description,
        amount: Number(expenseForm.amount),
        method: expenseForm.method,
        reference: expenseForm.reference || null,
      });
      setExpenseOpen(false);
      setExpenseForm({ category: 'OPERATIONS', description: '', amount: '', method: 'CASH', reference: '' });
      setMessage({ tone: 'ok', text: 'Expense recorded.' });
      expenses.reload();
      summary.reload();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const invoiceColumns: DataTableColumn<Invoice>[] = [
    {
      key: 'number',
      header: 'Invoice',
      render: (row) => (
        <div>
          <p className="font-semibold text-[#152B4A]">{row.number}</p>
          <p className="text-[10px] text-[#8EA2BC]">{row.guestName ?? 'Walk-in / no guest'}</p>
        </div>
      ),
    },
    { key: 'issued', header: 'Issued', render: (row) => dateOnly(row.issuedAt ?? row.createdAt) },
    { key: 'total', header: 'Total', align: 'right', render: (row) => money(row.total, row.currency) },
    { key: 'paid', header: 'Paid', align: 'right', render: (row) => money(row.amountPaid, row.currency) },
    {
      key: 'balance',
      header: 'Balance',
      align: 'right',
      render: (row) => (
        <span className={row.balance > 0 ? 'font-semibold text-[#B42318]' : 'text-[#0D7A54]'}>
          {money(row.balance, row.currency)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge label={row.status} tone={invoiceTone(row.status)} />,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) =>
        canWrite && ['ISSUED', 'PARTIALLY_PAID'].includes(row.status) && row.balance > 0 ? (
          <Button
            size="sm"
            variant="ghost"
            icon={<Banknote className="w-3.5 h-3.5" />}
            onClick={() => {
              setFormError(null);
              setPaymentForm({ amount: String(row.balance), method: 'CASH', reference: '' });
              setPaymentTarget(row);
            }}
          >
            Payment
          </Button>
        ) : null,
    },
  ];

  const data = summary.data?.summary;

  return (
    <Page
      title="Finance"
      subtitle="Invoices, payments, expenses and server-computed totals."
      actions={
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" icon={<RefreshCw className="w-3.5 h-3.5" />} onClick={() => { summary.reload(); invoices.reload(); payments.reload(); expenses.reload(); }}>
            Refresh
          </Button>
          {canWrite && (
            <Button variant="secondary" size="sm" icon={<TrendingDown className="w-3.5 h-3.5" />} onClick={() => { setFormError(null); setExpenseOpen(true); }}>
              Add expense
            </Button>
          )}
          {canWrite && (
            <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => { setFormError(null); setInvoiceOpen(true); }}>
              New invoice
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

      <div className="flex flex-wrap items-end gap-2">
        <FormField label="From" htmlFor="fin-from"><Input id="fin-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></FormField>
        <FormField label="To" htmlFor="fin-to"><Input id="fin-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></FormField>
      </div>

      {summary.error ? (
        <ErrorBlock message={summary.error} onRetry={summary.reload} />
      ) : summary.loading ? (
        <LoadingBlock />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard label="Revenue" value={money(data?.revenue ?? 0, currency)} supportingText="Payments in range" icon={<CircleDollarSign className="w-5 h-5" />} iconTone="green" />
          <StatCard label="Expenses" value={money(data?.expenses ?? 0, currency)} supportingText="Expenses in range" icon={<TrendingDown className="w-5 h-5" />} iconTone="amber" />
          <StatCard label="Net" value={money(data?.net ?? 0, currency)} supportingText="Revenue minus expenses" icon={<Receipt className="w-5 h-5" />} iconTone="navy" />
          <StatCard label="Outstanding" value={money(data?.outstanding ?? 0, currency)} supportingText={`${data?.invoiceCount ?? 0} invoice(s) unpaid`} icon={<Banknote className="w-5 h-5" />} iconTone="blue" />
        </div>
      )}

      {data && data.paymentsByMethod.length > 0 && (
        <Card title="Payments by method" subtitle="Within the selected range">
          <div className="flex flex-wrap gap-2">
            {data.paymentsByMethod.map((row) => (
              <span key={row.method} className="rounded-full border border-[#E1EAF5] bg-[#F9FBFE] px-3 py-1 text-xs text-[#5B6B82]">
                {row.method}: <strong className="text-[#152B4A]">{money(row.total, currency)}</strong> ({row.count})
              </span>
            ))}
          </div>
        </Card>
      )}

      <Card
        title="Invoices"
        subtitle={`${invoices.data?.invoices.length ?? 0} invoice(s)`}
        actions={
          <Select value={status} onChange={(e) => setStatus(e.target.value)} options={INVOICE_STATUSES.map((value) => ({ value, label: value || 'All statuses' }))} className="w-44" />
        }
      >
        {invoices.error ? (
          <ErrorBlock message={invoices.error} onRetry={invoices.reload} />
        ) : invoices.loading ? (
          <LoadingBlock />
        ) : (invoices.data?.invoices.length ?? 0) === 0 ? (
          <EmptyBlock title="No invoices" description="Issue an invoice to start tracking revenue and balances." />
        ) : (
          <DataTable columns={invoiceColumns} data={invoices.data?.invoices ?? []} rowKey={(row) => row.id} />
        )}
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card title="Payments" subtitle="Recorded against invoices">
          {payments.error ? (
            <ErrorBlock message={payments.error} onRetry={payments.reload} />
          ) : payments.loading ? (
            <LoadingBlock />
          ) : (payments.data?.payments.length ?? 0) === 0 ? (
            <p className="text-xs text-[#8EA2BC]">No payments in this range.</p>
          ) : (
            <ul className="divide-y divide-[#E1EAF5] text-xs">
              {payments.data?.payments.map((payment) => (
                <li key={payment.id} className="py-2 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-[#152B4A]">{payment.invoice_number}</p>
                    <p className="text-[10px] text-[#8EA2BC]">{payment.guest_name ?? '—'} · {payment.method}{payment.reference ? ` · ${payment.reference}` : ''}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{money(payment.amount, currency)}</p>
                    <p className="text-[10px] text-[#8EA2BC]">{dateOnly(payment.paid_at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Expenses" subtitle="Operating costs in this range">
          {expenses.error ? (
            <ErrorBlock message={expenses.error} onRetry={expenses.reload} />
          ) : expenses.loading ? (
            <LoadingBlock />
          ) : (expenses.data?.expenses.length ?? 0) === 0 ? (
            <p className="text-xs text-[#8EA2BC]">No expenses in this range.</p>
          ) : (
            <ul className="divide-y divide-[#E1EAF5] text-xs">
              {expenses.data?.expenses.map((expense) => (
                <li key={expense.id} className="py-2 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-[#152B4A]">{expense.description}</p>
                    <p className="text-[10px] text-[#8EA2BC]">{expense.category} · {expense.method}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{money(expense.amount, currency)}</p>
                    <p className="text-[10px] text-[#8EA2BC]">{dateOnly(expense.spent_at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Modal
        isOpen={invoiceOpen}
        onClose={() => setInvoiceOpen(false)}
        title="New invoice"
        description="Totals are computed by the server from the line items."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setInvoiceOpen(false)}>Cancel</Button>
            <Button loading={saving} onClick={createInvoice} disabled={invoiceForm.items.every((item) => !item.unitPrice)}>Issue invoice</Button>
          </div>
        }
      >
        <div className="space-y-3">
          {formError && <p className="text-xs text-[#B42318]">{formError}</p>}
          <FormField label="Guest" htmlFor="inv-guest" hint="Optional for walk-in sundries.">
            <Select id="inv-guest" value={invoiceForm.guestId} onChange={(e) => setInvoiceForm({ ...invoiceForm, guestId: e.target.value })}
              options={[{ value: '', label: 'No guest' }, ...(guests.data?.guests ?? []).map((guest) => ({ value: guest.id, label: guest.fullName }))]} />
          </FormField>
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-[#152B4A]">Line items</p>
            {invoiceForm.items.map((item, index) => (
              <div key={index} className="grid grid-cols-12 gap-2">
                <Input className="col-span-6" placeholder="Description" value={item.description}
                  onChange={(e) => {
                    const items = [...invoiceForm.items];
                    items[index] = { ...item, description: e.target.value };
                    setInvoiceForm({ ...invoiceForm, items });
                  }} />
                <Input className="col-span-2" type="number" min={0.01} step="0.01" placeholder="Qty" value={item.quantity}
                  onChange={(e) => {
                    const items = [...invoiceForm.items];
                    items[index] = { ...item, quantity: e.target.value };
                    setInvoiceForm({ ...invoiceForm, items });
                  }} />
                <Input className="col-span-3" type="number" min={0} step="0.01" placeholder={`Unit ${currency}`} value={item.unitPrice}
                  onChange={(e) => {
                    const items = [...invoiceForm.items];
                    items[index] = { ...item, unitPrice: e.target.value };
                    setInvoiceForm({ ...invoiceForm, items });
                  }} />
                <Button className="col-span-1" variant="ghost" size="sm" onClick={() => setInvoiceForm({ ...invoiceForm, items: invoiceForm.items.filter((_, i) => i !== index) })} disabled={invoiceForm.items.length === 1}>
                  ×
                </Button>
              </div>
            ))}
            <Button variant="secondary" size="sm" onClick={() => setInvoiceForm({ ...invoiceForm, items: [...invoiceForm.items, { description: '', quantity: '1', unitPrice: '' }] })}>
              Add line
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Tax rate %" htmlFor="inv-tax">
              <Input id="inv-tax" type="number" min={0} max={100} step="0.01" value={invoiceForm.taxRate} onChange={(e) => setInvoiceForm({ ...invoiceForm, taxRate: e.target.value })} />
            </FormField>
            <FormField label="Notes" htmlFor="inv-notes">
              <Input id="inv-notes" value={invoiceForm.notes} onChange={(e) => setInvoiceForm({ ...invoiceForm, notes: e.target.value })} placeholder="Optional" />
            </FormField>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(paymentTarget)}
        onClose={() => setPaymentTarget(null)}
        title="Record payment"
        description={paymentTarget ? `${paymentTarget.number} · balance ${money(paymentTarget.balance, paymentTarget.currency)}` : ''}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPaymentTarget(null)}>Cancel</Button>
            <Button loading={saving} onClick={recordPayment} disabled={!paymentForm.amount}>Record payment</Button>
          </div>
        }
      >
        <div className="space-y-3">
          {formError && <p className="text-xs text-[#B42318]">{formError}</p>}
          <FormField label={`Amount (${currency})`} required htmlFor="pay-amount">
            <Input id="pay-amount" type="number" min={0.01} step="0.01" value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} />
          </FormField>
          <FormField label="Method" htmlFor="pay-method">
            <Select id="pay-method" value={paymentForm.method} onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value })}
              options={['CASH', 'MOBILE_MONEY', 'CARD', 'BANK_TRANSFER', 'CHEQUE'].map((value) => ({ value, label: value.replace('_', ' ') }))} />
          </FormField>
          <FormField label="Reference" htmlFor="pay-reference">
            <Input id="pay-reference" value={paymentForm.reference} onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })} placeholder="Optional receipt or transaction reference" />
          </FormField>
        </div>
      </Modal>

      <Modal
        isOpen={expenseOpen}
        onClose={() => setExpenseOpen(false)}
        title="Add expense"
        description="Expenses reduce reported net revenue."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setExpenseOpen(false)}>Cancel</Button>
            <Button loading={saving} onClick={createExpense} disabled={!expenseForm.description || !expenseForm.amount}>Record expense</Button>
          </div>
        }
      >
        <div className="space-y-3">
          {formError && <p className="text-xs text-[#B42318]">{formError}</p>}
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Category" required htmlFor="exp-category">
              <Input id="exp-category" value={expenseForm.category} onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })} />
            </FormField>
            <FormField label={`Amount (${currency})`} required htmlFor="exp-amount">
              <Input id="exp-amount" type="number" min={0.01} step="0.01" value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} />
            </FormField>
          </div>
          <FormField label="Description" required htmlFor="exp-description">
            <Textarea id="exp-description" rows={2} value={expenseForm.description} onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })} />
          </FormField>
          <FormField label="Method" htmlFor="exp-method">
            <Select id="exp-method" value={expenseForm.method} onChange={(e) => setExpenseForm({ ...expenseForm, method: e.target.value })}
              options={['CASH', 'MOBILE_MONEY', 'CARD', 'BANK_TRANSFER', 'CHEQUE'].map((value) => ({ value, label: value.replace('_', ' ') }))} />
          </FormField>
        </div>
      </Modal>
    </Page>
  );
}
