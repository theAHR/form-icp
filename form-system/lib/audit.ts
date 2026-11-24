import { Prisma } from "@prisma/client";
import { db } from "./db";
export type DB = Prisma.TransactionClient;
export async function audit(
  tx: DB = db,
  actorId: string | null,
  action: string,
  entity: string,
  entityId?: string,
  ip?: string,
  metadata?: Prisma.InputJsonObject,
) {
  await tx.auditLog.create({
    data: { actorId, action, entity, entityId, ip, metadata },
  });
}
