/**
 * Invoices, payments and expenses.
 *
 * Financial writes are transactional. Totals are always recomputed on the
 * server from line items; the client can never dictate an invoice total.
 */

import { randomUUID } from 'node:crypto';
import { getPool, withTransaction } from './pool';
import { RoomDbError } from './errors';

function newId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface InvoiceItemInput {
  description: string;
  quantity: number;
  unitPrice: number;
  kind?: string;
}

export interface Invoice {
  id: string;
  tenantId: string;
  branchId: string;
  guestId: string | null;
  guestName: string | null;
  stayId: string | null;
  number: string;
  status: string;
  currency: string;
  subtotal: number;
  tax: number;
  total: number;
  amountPaid: number;
  balance: number;
  issuedAt: string | null;
  dueAt: string | null;
  notes: string | null;
  createdAt: string;
  items?: any[];
  payments?: any[];
}

function mapInvoice(row: any): Invoice {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_id,
    guestId: row.guest_id,
    guestName: row.guest_name ?? null,
    stayId: row.stay_id,
    number: row.number,
    status: row.status,
    currency: row.currency,
    subtotal: Number(row.subtotal),
    tax: Number(row.tax),
    total: Number(row.total),
    amountPaid: Number(row.amount_paid),
    balance: round(Number(row.total) - Number(row.amount_paid)),
    issuedAt: row.issued_at,
    dueAt: row.due_at,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

const INVOICE_SELECT = `
  SELECT i.*, g.full_name AS guest_name
    FROM invoices i
    LEFT JOIN guests g ON g.id = i.guest_id
`;

export async function listInvoices(
  tenantId: string,
  opts: { branchId?: string | null; status?: string | null; guestId?: string | null; limit?: number; offset?: number } = {}
): Promise<{ invoices: Invoice[]; total: number }> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);

  const result = await getPool().query(
    `${INVOICE_SELECT}
      WHERE i.tenant_id = $1
        AND ($2::text IS NULL OR i.branch_id = $2)
        AND ($3::text IS NULL OR i.status = $3)
        AND ($4::text IS NULL OR i.guest_id = $4)
      ORDER BY i.created_at DESC
      LIMIT $5 OFFSET $6`,
    [tenantId, opts.branchId ?? null, opts.status ?? null, opts.guestId ?? null, limit, offset]
  );

  return { invoices: result.rows.map(mapInvoice), total: result.rows.length };
}

export async function getInvoice(tenantId: string, id: string): Promise<Invoice> {
  const result = await getPool().query(`${INVOICE_SELECT} WHERE i.tenant_id = $1 AND i.id = $2`, [
    tenantId,
    id,
  ]);
  if (!result.rows[0]) throw new RoomDbError('ROOM_NOT_FOUND', 'Invoice not found.');

  const items = await getPool().query('SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY id', [id]);
  const payments = await getPool().query(
    'SELECT * FROM payments WHERE invoice_id = $1 ORDER BY paid_at DESC',
    [id]
  );

  return {
    ...mapInvoice(result.rows[0]),
    items: items.rows,
    payments: payments.rows.map((p) => ({ ...p, amount: Number(p.amount) })),
  };
}

function invoiceNumber(): string {
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  return `INV-${stamp}-${randomUUID().slice(0, 6).toUpperCase()}`;
}

export async function createInvoice(
  tenantId: string,
  branchId: string,
  userId: string,
  input: {
    guestId?: string | null;
    stayId?: string | null;
    reservationId?: string | null;
    items: InvoiceItemInput[];
    taxRate?: number;
    dueAt?: string | null;
    notes?: string | null;
    issue?: boolean;
  }
): Promise<Invoice> {
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new RoomDbError('INVALID_ROOM_DATA', 'An invoice needs at least one line item.');
  }

  const id = await withTransaction(async (client) => {
    if (input.guestId) {
      const guest = await client.query('SELECT 1 FROM guests WHERE id = $1 AND tenant_id = $2', [
        input.guestId,
        tenantId,
      ]);
      if (!guest.rows[0]) throw new RoomDbError('ROOM_NOT_FOUND', 'Guest not found for this business.');
    }

    let subtotal = 0;
    for (const item of input.items) {
      if (!item.description || !Number.isFinite(item.quantity) || item.quantity <= 0) {
        throw new RoomDbError('INVALID_ROOM_DATA', 'Each invoice item needs a description and a positive quantity.');
      }
      if (!Number.isFinite(item.unitPrice) || item.unitPrice < 0) {
        throw new RoomDbError('INVALID_PRICING', 'Unit price cannot be negative.');
      }
      subtotal += item.quantity * item.unitPrice;
    }
    subtotal = round(subtotal);
    const taxRate = Math.min(Math.max(input.taxRate ?? 0, 0), 100);
    const tax = round((subtotal * taxRate) / 100);
    const total = round(subtotal + tax);

    const invoiceId = newId('inv');
    const number = invoiceNumber();
    const status = input.issue === false ? 'DRAFT' : 'ISSUED';

    const inserted = await client.query(
      `INSERT INTO invoices
         (id, tenant_id, branch_id, guest_id, stay_id, reservation_id, number, status,
          currency, subtotal, tax, total, amount_paid, issued_at, due_at, notes, created_by)
       SELECT $1, $2, $3, $4, $5, $6, $7, $8, t.currency, $9, $10, $11, 0,
              CASE WHEN $8 = 'DRAFT' THEN NULL ELSE now() END, $12, $13, $14
         FROM tenants t WHERE t.id = $2
       RETURNING id`,
      [
        invoiceId, tenantId, branchId, input.guestId ?? null, input.stayId ?? null,
        input.reservationId ?? null, number, status, subtotal, tax, total,
        input.dueAt ?? null, input.notes ?? null, userId,
      ]
    );
    if (!inserted.rows[0]) {
      throw new RoomDbError('ROOM_NOT_FOUND', 'Business not found for this invoice.');
    }

    for (const item of input.items) {
      await client.query(
        `INSERT INTO invoice_items (id, invoice_id, description, quantity, unit_price, line_total, kind)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          newId('item'), invoiceId, item.description, round(item.quantity), round(item.unitPrice),
          round(item.quantity * item.unitPrice), (item.kind ?? 'ROOM').toUpperCase(),
        ]
      );
    }

    return invoiceId;
  });

  // Read after COMMIT so the pooled reader can see the new rows.
  return getInvoice(tenantId, id);
}

export async function issueInvoice(tenantId: string, id: string): Promise<Invoice> {
  const result = await getPool().query(
    `UPDATE invoices SET status = 'ISSUED', issued_at = COALESCE(issued_at, now()), updated_at = now()
      WHERE tenant_id = $1 AND id = $2 AND status = 'DRAFT'
      RETURNING id`,
    [tenantId, id]
  );
  if (!result.rows[0]) throw new RoomDbError('INVALID_STATUS', 'Only draft invoices can be issued.');
  return getInvoice(tenantId, id);
}

export async function voidInvoice(tenantId: string, id: string): Promise<Invoice> {
  const result = await getPool().query(
    `UPDATE invoices SET status = 'VOID', updated_at = now()
      WHERE tenant_id = $1 AND id = $2 AND status IN ('DRAFT', 'ISSUED')
        AND amount_paid = 0
      RETURNING id`,
    [tenantId, id]
  );
  if (!result.rows[0]) {
    throw new RoomDbError('INVALID_STATUS', 'Only unpaid draft or issued invoices can be voided.');
  }
  return getInvoice(tenantId, id);
}

export async function recordPayment(
  tenantId: string,
  branchId: string,
  userId: string,
  input: { invoiceId: string; amount: number; method: string; reference?: string | null }
): Promise<Invoice> {
  await withTransaction(async (client) => {
    const invoice = await client.query(
      `SELECT id, tenant_id, total, amount_paid, status
         FROM invoices WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
      [tenantId, input.invoiceId]
    );
    const row = invoice.rows[0];
    if (!row) throw new RoomDbError('ROOM_NOT_FOUND', 'Invoice not found.');
    if (row.status === 'VOID' || row.status === 'DRAFT') {
      throw new RoomDbError('INVALID_STATUS', 'Payments can only be recorded against issued invoices.');
    }

    const total = Number(row.total);
    const alreadyPaid = Number(row.amount_paid);
    const amount = round(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new RoomDbError('INVALID_PRICING', 'Payment amount must be greater than zero.');
    }

    const outstanding = round(total - alreadyPaid);
    if (amount > outstanding + 0.009) {
      throw new RoomDbError('INVALID_PRICING', `Payment exceeds the outstanding balance of ${outstanding.toFixed(2)}.`);
    }

    await client.query(
      `INSERT INTO payments
         (id, tenant_id, branch_id, invoice_id, amount, method, reference, received_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        newId('pay'), tenantId, branchId, input.invoiceId, amount,
        input.method, input.reference ?? null, userId,
      ]
    );

    const newPaid = round(alreadyPaid + amount);
    const newStatus = newPaid >= total - 0.009 ? 'PAID' : 'PARTIALLY_PAID';
    await client.query(
      `UPDATE invoices SET amount_paid = $2, status = $3, updated_at = now() WHERE id = $1`,
      [input.invoiceId, newPaid, newStatus]
    );
  });

  // Read after COMMIT so the payment and new status are visible.
  return getInvoice(tenantId, input.invoiceId);
}

export async function listPayments(
  tenantId: string,
  opts: { branchId?: string | null; from?: string | null; to?: string | null } = {}
): Promise<any[]> {
  const result = await getPool().query(
    `SELECT p.*, i.number AS invoice_number, g.full_name AS guest_name
       FROM payments p
       JOIN invoices i ON i.id = p.invoice_id
       LEFT JOIN guests g ON g.id = i.guest_id
      WHERE p.tenant_id = $1
        AND ($2::text IS NULL OR p.branch_id = $2)
        AND ($3::date IS NULL OR p.paid_at::date >= $3::date)
        AND ($4::date IS NULL OR p.paid_at::date <= $4::date)
      ORDER BY p.paid_at DESC
      LIMIT 300`,
    [tenantId, opts.branchId ?? null, opts.from ?? null, opts.to ?? null]
  );
  return result.rows.map((row) => ({
    ...row,
    amount: Number(row.amount),
  }));
}

export async function listExpenses(
  tenantId: string,
  opts: { branchId?: string | null; from?: string | null; to?: string | null } = {}
): Promise<any[]> {
  const result = await getPool().query(
    `SELECT * FROM expenses
      WHERE tenant_id = $1
        AND ($2::text IS NULL OR branch_id = $2)
        AND ($3::date IS NULL OR spent_at::date >= $3::date)
        AND ($4::date IS NULL OR spent_at::date <= $4::date)
      ORDER BY spent_at DESC
      LIMIT 300`,
    [tenantId, opts.branchId ?? null, opts.from ?? null, opts.to ?? null]
  );
  return result.rows.map((row) => ({ ...row, amount: Number(row.amount) }));
}

export async function createExpense(
  tenantId: string,
  branchId: string,
  userId: string,
  input: { category: string; description: string; amount: number; method?: string; reference?: string | null; spentAt?: string | null }
): Promise<any> {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new RoomDbError('INVALID_PRICING', 'Expense amount must be greater than zero.');
  }
  const result = await getPool().query(
    `INSERT INTO expenses
       (id, tenant_id, branch_id, category, description, amount, method, reference, spent_at, recorded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::timestamptz, now()), $10)
     RETURNING *`,
    [
      newId('exp'), tenantId, branchId, input.category, input.description,
      round(input.amount), input.method ?? 'CASH', input.reference ?? null, input.spentAt ?? null, userId,
    ]
  );
  return { ...result.rows[0], amount: Number(result.rows[0].amount) };
}

export async function financeSummary(
  tenantId: string,
  branchId: string | null,
  from: string,
  to: string
): Promise<{
  revenue: number;
  expenses: number;
  net: number;
  paymentsByMethod: Array<{ method: string; total: number; count: number }>;
  outstanding: number;
  invoiceCount: number;
}> {
  const revenue = await getPool().query(
    `SELECT coalesce(sum(amount), 0) AS total
       FROM payments
      WHERE tenant_id = $1
        AND ($2::text IS NULL OR branch_id = $2)
        AND paid_at::date BETWEEN $3::date AND $4::date`,
    [tenantId, branchId, from, to]
  );

  const byMethod = await getPool().query(
    `SELECT method, coalesce(sum(amount), 0) AS total, count(*)::int AS count
       FROM payments
      WHERE tenant_id = $1
        AND ($2::text IS NULL OR branch_id = $2)
        AND paid_at::date BETWEEN $3::date AND $4::date
      GROUP BY method ORDER BY total DESC`,
    [tenantId, branchId, from, to]
  );

  const expense = await getPool().query(
    `SELECT coalesce(sum(amount), 0) AS total
       FROM expenses
      WHERE tenant_id = $1
        AND ($2::text IS NULL OR branch_id = $2)
        AND spent_at::date BETWEEN $3::date AND $4::date`,
    [tenantId, branchId, from, to]
  );

  const outstanding = await getPool().query(
    `SELECT coalesce(sum(total - amount_paid), 0) AS total, count(*)::int AS count
       FROM invoices
      WHERE tenant_id = $1
        AND ($2::text IS NULL OR branch_id = $2)
        AND status IN ('ISSUED', 'PARTIALLY_PAID')`,
    [tenantId, branchId]
  );

  const revenueTotal = Number(revenue.rows[0].total);
  const expenseTotal = Number(expense.rows[0].total);

  return {
    revenue: round(revenueTotal),
    expenses: round(expenseTotal),
    net: round(revenueTotal - expenseTotal),
    paymentsByMethod: byMethod.rows.map((row) => ({
      method: row.method,
      total: Number(row.total),
      count: row.count,
    })),
    outstanding: round(Number(outstanding.rows[0].total)),
    invoiceCount: outstanding.rows[0].count,
  };
}
