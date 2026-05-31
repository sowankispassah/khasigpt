CREATE INDEX IF NOT EXISTS "AuditLog_manual_credit_target_user_createdAt_idx"
ON public."AuditLog" ((target ->> 'userId'), "createdAt" DESC)
WHERE "action" = 'billing.manual_credit.grant';

CREATE INDEX IF NOT EXISTS "AuditLog_recharge_actor_createdAt_idx"
ON public."AuditLog" ("actorId", "createdAt" DESC)
WHERE "action" = 'billing.recharge';
