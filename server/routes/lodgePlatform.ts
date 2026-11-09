import { Router, Request, Response } from 'express';
import { getPool, isDatabaseConfigured } from '../db/pool';

export function createLodgePlatformRouter(): Router {
  const router = Router();

  // Lodge Stats
  router.get('/lodge/stats', async (_req: Request, res: Response) => {
    try {
      if (isDatabaseConfigured()) {
        const pool = getPool();
        const roomsRes = await pool.query("SELECT COUNT(*) as total, SUM(CASE WHEN status = 'OCCUPIED' THEN 1 ELSE 0 END) as occupied FROM rooms WHERE archived_at IS NULL");
        const resRes = await pool.query('SELECT COUNT(*) as count FROM reservations');
        return res.json({
          totalRooms: Number(roomsRes.rows[0]?.total || 8),
          occupiedRooms: Number(roomsRes.rows[0]?.occupied || 3),
          totalReservations: Number(resRes.rows[0]?.count || 3),
          databaseConnected: true,
        });
      }
      return res.json({
        totalRooms: 8,
        occupiedRooms: 3,
        totalReservations: 3,
        databaseConnected: false,
      });
    } catch (err) {
      return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Reservations
  router.get('/lodge/reservations', async (_req: Request, res: Response) => {
    try {
      if (isDatabaseConfigured()) {
        const pool = getPool();
        const result = await pool.query('SELECT * FROM reservations ORDER BY created_at DESC');
        return res.json(result.rows);
      }
      return res.json([
        {
          id: 'RES-101',
          branchName: 'Main Branch',
          roomId: 'ROOM-101',
          guestName: 'Dr. David Mkwawa',
          checkInDate: '2026-11-08',
          checkOutDate: '2026-11-12',
          status: 'CHECKED_IN',
          totalAmount: 450000,
        },
      ]);
    } catch (err) {
      return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Tenants (Platform)
  router.get('/platform/tenants', async (_req: Request, res: Response) => {
    try {
      if (isDatabaseConfigured()) {
        const pool = getPool();
        const result = await pool.query('SELECT * FROM tenants ORDER BY created_at DESC');
        return res.json(result.rows);
      }
      return res.json([
        {
          id: 'TNT-001',
          name: 'Enkai Luxury Lodges Ltd',
          slug: 'enkai-lodges',
          subscriptionTier: 'ENTERPRISE',
          status: 'ACTIVE',
          branchesCount: 3,
          camerasCount: 16,
          createdAt: '2026-01-15',
        },
      ]);
    } catch (err) {
      return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  return router;
}
