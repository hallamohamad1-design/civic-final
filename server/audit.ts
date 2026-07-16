import { getDb } from './db';
import { auditLogs } from '../drizzle/schema';
import type { Request } from 'express';

/**
 * Records a security-relevant action to the audit_logs table.
 * Fails silently so that a logging error never breaks the main request.
 */
export async function logAction(
  req: Request,
  action: string,
  details?: string,
  userId?: number,
  userEmail?: string
): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return; // No DB in local dev without DATABASE_URL — skip silently
    await db.insert(auditLogs).values({
      userId: userId ?? null,
      userEmail: userEmail ?? null,
      action,
      details: details ?? null,
      ipAddress: req.ip ?? null,
    });
  } catch (err) {
    // Never let audit logging crash the main request flow
    console.error('[Audit] Failed to write log entry:', err);
  }
}
