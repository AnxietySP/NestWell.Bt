import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { RowDataPacket } from 'mysql2';
import { pool, withTransaction } from '../../config/db';
import { authenticate, authorize } from '../../middlewares/auth.middleware';
import { AppError } from '../../middlewares/error.middleware';
import { createNotification } from '../notifications/notifications.service';

const router = Router();

const createBookingSchema = z.object({
  caretakerId: z.string().min(1),
  childId: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be YYYY-MM-DD.'),
  durationMonths: z.coerce.number().int().min(6, 'Minimum contract duration is 6 months.').max(36),
  billingArrangement: z.enum(['MONTHLY_INSTALLMENT', 'QUARTERLY_INSTALLMENT']).default('MONTHLY_INSTALLMENT'),
  parentNotes: z.string().max(1000).optional(),
  acceptedTerms: z.literal(true, {
    errorMap: () => ({ message: 'You must read and accept the 6-month Terms & Conditions.' }),
  }),
});

const updateStatusSchema = z.object({
  status: z.enum(['ACCEPTED', 'REJECTED', 'CONFIRMED', 'CANCELLED', 'COMPLETED']),
  note: z.string().max(500).optional(),
});

function addMonthsIso(startDateIso: string, months: number): string {
  const [y, m, d] = startDateIso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + months, d));
  return dt.toISOString().slice(0, 10);
}

router.post('/', authenticate, authorize('PARENT'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createBookingSchema.parse(req.body);
    const parentId = req.user!.sub;
    const endDate = addMonthsIso(data.startDate, data.durationMonths);

    const [childRows] = await pool.execute<RowDataPacket[]>(
      'SELECT id, full_name FROM children WHERE id = ? AND parent_id = ?',
      [data.childId, parentId]
    );
    const child = childRows[0];
    if (!child) {
      throw new AppError('Selected child profile was not found.', 404);
    }

    // Only allow a new 6-month request if the child has NO active/confirmed contract,
    // or their current confirmed/active contract is within 30 days of expiring.
    const [activeChildContracts] = await pool.execute<RowDataPacket[]>(
      `SELECT id, end_date AS endDate
       FROM bookings
       WHERE child_id = ?
         AND status IN ('CONFIRMED', 'ACTIVE')
         AND end_date > DATE_ADD(CURDATE(), INTERVAL 30 DAY)
       LIMIT 1`,
      [data.childId]
    );
    if (activeChildContracts.length > 0) {
      const activeEnd = String(activeChildContracts[0].endDate).slice(0, 10);
      throw new AppError(
        `${child.full_name} already has an active contract until ${activeEnd}. A new 6-month request can only be made within 30 days of expiration.`,
        409
      );
    }

    const [caretakerRows] = await pool.execute<RowDataPacket[]>(
      `SELECT u.id, u.full_name, cp.monthly_rate_btn, cp.verification_status, cp.is_available
       FROM users u
       JOIN caretaker_profiles cp ON cp.user_id = u.id
       WHERE u.id = ? AND u.role = 'CARETAKER' AND u.is_active = TRUE`,
      [data.caretakerId]
    );
    const caretaker = caretakerRows[0];
    if (!caretaker) {
      throw new AppError('Caretaker not found.', 404);
    }
    if (caretaker.verification_status !== 'APPROVED') {
      throw new AppError('Only verified caretakers can be booked.', 400);
    }

    const [conflicts] = await pool.execute<RowDataPacket[]>(
      `SELECT id, start_date AS startDate, end_date AS endDate, status
       FROM bookings
       WHERE caretaker_id = ?
         AND status IN ('PENDING', 'ACCEPTED', 'CONFIRMED', 'ACTIVE')
         AND start_date <= ?
         AND end_date >= ?`,
      [data.caretakerId, endDate, data.startDate]
    );

    if (conflicts.length > 0) {
      const c = conflicts[0];
      const conflictStart = String(c.startDate).slice(0, 10);
      const conflictEnd = String(c.endDate).slice(0, 10);
      throw new AppError(
        `${caretaker.full_name} already has a ${c.status.toLowerCase()} booking covering ${conflictStart} to ${conflictEnd}. Please choose non-overlapping dates or select another caretaker.`,
        409
      );
    }

    const bookingId = uuidv4();
    const monthlyRate = Number(caretaker.monthly_rate_btn);
    const estimatedTotal = monthlyRate * data.durationMonths;

    await withTransaction(async (conn) => {
      await conn.execute(
        `INSERT INTO bookings (
          id, parent_id, caretaker_id, child_id, start_date, end_date, duration_months,
          agreed_monthly_rate_btn, estimated_total_btn, billing_arrangement, parent_notes, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
        [
          bookingId,
          parentId,
          data.caretakerId,
          data.childId,
          data.startDate,
          endDate,
          data.durationMonths,
          monthlyRate,
          estimatedTotal,
          data.billingArrangement,
          data.parentNotes?.trim() || null,
        ]
      );

      await createNotification(
        {
          userId: data.caretakerId,
          type: 'BOOKING_REQUEST',
          title: 'New 6-Month Care Request',
          message: `A family has requested ${data.durationMonths} months of childcare starting ${data.startDate}.`,
        },
        conn
      );
    });

    res.status(201).json({
      success: true,
      booking: {
        id: bookingId,
        startDate: data.startDate,
        endDate,
        durationMonths: data.durationMonths,
        status: 'PENDING',
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.sub;
    const role = req.user!.role;

    await pool.execute(
      `UPDATE bookings
       SET status = 'COMPLETED'
       WHERE status IN ('CONFIRMED', 'ACTIVE')
         AND end_date < CURDATE()`
    );

    const whereClause =
      role === 'CARETAKER'
        ? 'b.caretaker_id = ?'
        : role === 'PARENT'
        ? 'b.parent_id = ?'
        : '1 = 1';
    const params = role === 'ADMIN' ? [] : [userId];

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT
        b.id,
        b.parent_id AS parentId,
        b.caretaker_id AS caretakerId,
        b.child_id AS childId,
        b.start_date AS startDate,
        b.end_date AS endDate,
        b.duration_months AS durationMonths,
        b.agreed_monthly_rate_btn AS agreedMonthlyRateBtn,
        b.estimated_total_btn AS estimatedTotalBtn,
        b.billing_arrangement AS billingArrangement,
        b.parent_notes AS parentNotes,
        b.status,
        b.created_at AS createdAt,
        p.full_name AS parentName,
        p.phone AS parentPhone,
        p.dzongkhag AS parentDzongkhag,
        p.address AS parentAddress,
        c.full_name AS caretakerName,
        c.phone AS caretakerPhone,
        c.dzongkhag AS caretakerDzongkhag,
        cp.monthly_rate_btn AS caretakerCurrentRateBtn,
        cp.qualifications AS caretakerQualifications,
        cp.years_experience AS caretakerYearsExperience,
        ch.full_name AS childName,
        ch.date_of_birth AS childDob,
        ch.allergies AS childAllergies,
        ch.special_instructions AS childInstructions
       FROM bookings b
       JOIN users p ON p.id = b.parent_id
       JOIN users c ON c.id = b.caretaker_id
       LEFT JOIN caretaker_profiles cp ON cp.user_id = b.caretaker_id
       LEFT JOIN children ch ON ch.id = b.child_id
       WHERE ${whereClause}
       ORDER BY b.created_at DESC`,
      params
    );

    res.json({ bookings: rows });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/status', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const bookingId = String(req.params.id);
    const { status } = updateStatusSchema.parse(req.body);
    const userId = req.user!.sub;

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id, parent_id, caretaker_id, child_id, start_date AS startDate, end_date AS endDate, status
       FROM bookings WHERE id = ?`,
      [bookingId]
    );
    const booking = rows[0];
    if (!booking) {
      throw new AppError('Booking not found.', 404);
    }

    if (booking.parent_id !== userId && booking.caretaker_id !== userId && req.user!.role !== 'ADMIN') {
      throw new AppError('Not authorized to modify this booking.', 403);
    }

    if (status === 'ACCEPTED' || status === 'CONFIRMED') {
      const [conflicts] = await pool.execute<RowDataPacket[]>(
        `SELECT id FROM bookings
         WHERE caretaker_id = ?
           AND id <> ?
           AND status IN ('ACCEPTED', 'CONFIRMED', 'ACTIVE')
           AND start_date <= ?
           AND end_date >= ?`,
        [booking.caretaker_id, bookingId, booking.endDate, booking.startDate]
      );
      if (conflicts.length > 0) {
        throw new AppError(
          'This caretaker already has another confirmed contract on overlapping dates.',
          409
        );
      }
    }

    await withTransaction(async (conn) => {
      await conn.execute('UPDATE bookings SET status = ? WHERE id = ?', [status, bookingId]);

      const notifyUserId = userId === booking.parent_id ? booking.caretaker_id : booking.parent_id;
      await createNotification(
        {
          userId: notifyUserId,
          type: 'BOOKING_STATUS',
          title: `Contract ${status}`,
          message: `Your 6-month childcare contract status is now ${status}.`,
        },
        conn
      );

      // When a parent approves (CONFIRMED) one contract for a child and date range,
      // automatically cancel all other PENDING/ACCEPTED contracts for the same child & overlapping dates.
      if (status === 'CONFIRMED') {
        const [competingBookings] = await conn.execute<RowDataPacket[]>(
          `SELECT id, caretaker_id
           FROM bookings
           WHERE child_id = ?
             AND id <> ?
             AND status IN ('PENDING', 'ACCEPTED')
             AND start_date <= ?
             AND end_date >= ?`,
          [booking.child_id, bookingId, booking.endDate, booking.startDate]
        );

        if (competingBookings.length > 0) {
          await conn.execute(
            `UPDATE bookings
             SET status = 'CANCELLED'
             WHERE child_id = ?
               AND id <> ?
               AND status IN ('PENDING', 'ACCEPTED')
               AND start_date <= ?
               AND end_date >= ?`,
            [booking.child_id, bookingId, booking.endDate, booking.startDate]
          );

          for (const competing of competingBookings) {
            await createNotification(
              {
                userId: competing.caretaker_id,
                type: 'BOOKING_STATUS',
                title: 'Contract Cancelled',
                message: 'The parent confirmed another caretaker for this child and date range.',
              },
              conn
            );
          }
        }
      }
    });

    res.json({ success: true, status });
  } catch (err) {
    next(err);
  }
});

export default router;