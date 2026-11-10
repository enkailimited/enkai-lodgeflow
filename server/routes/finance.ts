/**
 * Finance: invoices, payments, expenses and summaries.
 */

import express, { Router } from 'express';
import {
  createExpense,
  createInvoice,
  financeSummary,
  getInvoice,
  issueInvoice,
  listExpenses,
  listInvoices,
  listPayments,
  recordPayment,
  voidInvoice,
} from '../db/financeStore';
import { recordAudit } from '../db/auditStore';
import { resolveScopeBranch } from '../db/roomStore';
import { apiErrorHandler, asyncRoute, sendCreated, sendData } from '../http/respond';
import {
  AuthedRequest,
  getScope,
  requireAuth,
  requirePermission,
  resolveTenantScope,
} from '../middleware/auth';
import { asDate, asMoney, asString, pagination } from '../validation/common';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function createFinanceRouter(): Router {
  const router = Router();
  router.use(express.json({ limit: '128kb' }));
  router.use(requireAuth, resolveTenantScope);

  router.get(
    '/invoices',
    requirePermission('finance.read'),
    asyncRoute(async (req, res) => {
      const scope = getScope(req);
      const { limit, offset } = pagination(req.query);
      const result = await listInvoices(scope.tenantId, {
        branchId: scope.branchId,
        status: req.query.status ? String(req.query.status) : null,
        guestId: req.query.guestId ? String(req.query.guestId) : null,
        limit,
        offset,
      });
      sendData(res, result, { count: result.invoices.length, total: result.total });
    })
  );

  router.post(
    '/invoices',
    requirePermission('finance.write'),
    asyncRoute(async (req: AuthedRequest, res) => {
      const scope = getScope(req);
      const branchId = await resolveScopeBranch(scope);
      const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];

      const invoice = await createInvoice(scope.tenantId, branchId, scope.user.id, {
        guestId: asString(req.body?.guestId, 'guestId'),
        stayId: asString(req.body?.stayId, 'stayId'),
        reservationId: asString(req.body?.reservationId, 'reservationId'),
        items: rawItems.map((item: any) => ({
          description: String(item?.description ?? ''),
          quantity: Number(item?.quantity ?? 1),
          unitPrice: Number(item?.unitPrice ?? 0),
          kind: String(item?.kind ?? 'ROOM'),
        })),
        taxRate: req.body?.taxRate === undefined ? 0 : Number(req.body.taxRate),
        dueAt: asString(req.body?.dueAt, 'dueAt', { max: 40 }),
        notes: asString(req.body?.notes, 'notes', { max: 1000 }),
        issue: req.body?.issue !== false,
      });

      await recordAudit({
        tenantId: scope.tenantId,
        branchId,
        actorUserId: scope.user.id,
        actorEmail: scope.user.email,
        action: 'invoice.created',
        entityType: 'invoice',
        entityId: invoice.id,
        metadata: { number: invoice.number, total: invoice.total },
        ip: req.ip,
      });
      sendCreated(res, { invoice });
    })
  );

  router.get(
    '/invoices/:id',
    requirePermission('finance.read'),
    asyncRoute(async (req, res) => {
      const invoice = await getInvoice(getScope(req).tenantId, req.params.id);
      sendData(res, { invoice });
    })
  );

  router.post(
    '/invoices/:id/issue',
    requirePermission('finance.write'),
    asyncRoute(async (req, res) => {
      const invoice = await issueInvoice(getScope(req).tenantId, req.params.id);
      sendData(res, { invoice });
    })
  );

  router.post(
    '/invoices/:id/void',
    requirePermission('finance.write'),
    asyncRoute(async (req, res) => {
      const invoice = await voidInvoice(getScope(req).tenantId, req.params.id);
      sendData(res, { invoice });
    })
  );

  router.post(
    '/payments',
    requirePermission('finance.write'),
    asyncRoute(async (req: AuthedRequest, res) => {
      const scope = getScope(req);
      const branchId = await resolveScopeBranch(scope);
      const amount = asMoney(req.body?.amount, 'amount', { required: true, min: 0.01 }) as number;
      const invoice = await recordPayment(scope.tenantId, branchId, scope.user.id, {
        invoiceId: asString(req.body?.invoiceId, 'invoiceId', { required: true }) as string,
        amount,
        method: asString(req.body?.method, 'method', { required: true, max: 30 }) as string,
        reference: asString(req.body?.reference, 'reference', { max: 120 }),
      });
      await recordAudit({
        tenantId: scope.tenantId,
        branchId,
        actorUserId: scope.user.id,
        actorEmail: scope.user.email,
        action: 'payment.recorded',
        entityType: 'invoice',
        entityId: invoice.id,
        metadata: { amount },
        ip: req.ip,
      });
      sendData(res, { invoice });
    })
  );

  router.get(
    '/payments',
    requirePermission('finance.read'),
    asyncRoute(async (req, res) => {
      const scope = getScope(req);
      const payments = await listPayments(scope.tenantId, {
        branchId: scope.branchId,
        from: req.query.from ? String(req.query.from) : null,
        to: req.query.to ? String(req.query.to) : null,
      });
      sendData(res, { payments }, { count: payments.length });
    })
  );

  router.get(
    '/expenses',
    requirePermission('finance.read'),
    asyncRoute(async (req, res) => {
      const scope = getScope(req);
      const expenses = await listExpenses(scope.tenantId, {
        branchId: scope.branchId,
        from: req.query.from ? String(req.query.from) : null,
        to: req.query.to ? String(req.query.to) : null,
      });
      sendData(res, { expenses }, { count: expenses.length });
    })
  );

  router.post(
    '/expenses',
    requirePermission('finance.write'),
    asyncRoute(async (req: AuthedRequest, res) => {
      const scope = getScope(req);
      const branchId = await resolveScopeBranch(scope);
      const expense = await createExpense(scope.tenantId, branchId, scope.user.id, {
        category: asString(req.body?.category, 'category', { required: true, max: 80 }) as string,
        description: asString(req.body?.description, 'description', { required: true, max: 300 }) as string,
        amount: asMoney(req.body?.amount, 'amount', { required: true, min: 0.01 }) as number,
        method: asString(req.body?.method, 'method', { max: 30 }) ?? 'CASH',
        reference: asString(req.body?.reference, 'reference', { max: 120 }),
        spentAt: asString(req.body?.spentAt, 'spentAt', { max: 40 }),
      });
      sendCreated(res, { expense });
    })
  );

  router.get(
    '/summary',
    requirePermission('finance.read'),
    asyncRoute(async (req, res) => {
      const scope = getScope(req);
      const from = asDate(req.query.from ?? today(), 'from') as string;
      const to = asDate(req.query.to ?? today(), 'to') as string;
      const summary = await financeSummary(scope.tenantId, scope.branchId, from, to);
      sendData(res, { summary, from, to });
    })
  );

  router.use(apiErrorHandler);
  return router;
}
