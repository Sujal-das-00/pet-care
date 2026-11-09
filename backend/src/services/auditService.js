import { AuditLog } from '../models/AuditLog.js';

/** Fire-and-forget audit trail; never blocks or fails the request. */
export function audit(req, action, entityType, entityId, meta = {}) {
  AuditLog.create({ actorId: req.userId ?? null, action, entityType, entityId, ip: req.ip, meta }).catch((e) =>
    console.error('[audit] failed:', e.message),
  );
}
