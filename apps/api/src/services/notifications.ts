import { notifications } from '@rivertown/db';

export async function createNotification(db: any, data: {
  tenantId: string; userId: string; type: string;
  title: string; body?: string; entityType?: string; entityId?: string;
}) {
  await db.insert(notifications).values(data);
}
