/** Prisma queries for the notifications module belong here. */
import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';

const reminderSelect = {
  notification_id: true,
  entity_id: true,
  title: true,
  message: true,
  is_read: true,
  read_at: true,
  created_at: true,
} satisfies Prisma.notificationsSelect;
export type TrainingReminderRecord = Prisma.notificationsGetPayload<{
  select: typeof reminderSelect;
}>;
export type ComplianceReminderRecord = TrainingReminderRecord & {
  type: string;
  entity_type: string | null;
};
const complianceReminderSelect = {
  ...reminderSelect,
  type: true,
  entity_type: true,
} satisfies Prisma.notificationsSelect;

export const notificationsRepository = {
  listComplianceReminders(
    userId: string,
    query: { page: number; limit: number; status: 'all' | 'unread'; search?: string | undefined },
  ) {
    const search = query.search?.replace(/[\\%_]/g, '\\$&');
    const where: Prisma.notificationsWhereInput = {
      user_id: userId,
      type: {
        in: [
          'compliance_control_review_7d',
          'compliance_control_review_1d',
          'compliance_evidence_expiry_7d',
          'compliance_evidence_expiry_1d',
        ],
      },
      ...(query.status === 'unread' ? { is_read: false } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { message: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    return prisma.$transaction([
      prisma.notifications.findMany({
        where,
        select: complianceReminderSelect,
        orderBy: [{ created_at: 'desc' }, { notification_id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.notifications.count({ where }),
    ]);
  },
  async markComplianceReminderRead(userId: string, notificationId: string, now: Date) {
    const where = {
      user_id: userId,
      notification_id: notificationId,
      type: { startsWith: 'compliance_' },
    };
    await prisma.notifications.updateMany({
      where: { ...where, is_read: false },
      data: { is_read: true, read_at: now },
    });
    return prisma.notifications.findFirst({ where, select: complianceReminderSelect });
  },
  findComplianceReminderCandidates(now: Date) {
    const end = new Date(now.getTime() + 7 * 86_400_000);
    return Promise.all([
      prisma.$queryRaw<
        Array<{
          control_assessment_id: string;
          assessed_by_user_id: string;
          next_review_at: Date;
          control_code: string;
          title: string;
        }>
      >(Prisma.sql`
        SELECT a.control_assessment_id, a.assessed_by_user_id, a.next_review_at,
          c.control_code, c.title
        FROM control_assessments a
        JOIN compliance_controls c ON c.compliance_control_id = a.compliance_control_id
        JOIN users u ON u.user_id = a.assessed_by_user_id
        WHERE a.next_review_at BETWEEN ${now} AND ${end}
          AND u.status = 'active' AND u.deleted_at IS NULL AND u.disabled_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM notification_preferences pref
            WHERE pref.user_id = u.user_id AND pref.event_type = 'compliance_deadline_reminder'
              AND pref.in_app_enabled = false)
          AND NOT EXISTS (
            SELECT 1 FROM control_assessments newer
            WHERE newer.compliance_control_id = a.compliance_control_id
              AND (newer.assessed_at, newer.control_assessment_id) > (a.assessed_at, a.control_assessment_id)
          )
        ORDER BY a.next_review_at, a.control_assessment_id
        LIMIT 500
      `),
      prisma.compliance_evidence.findMany({
        where: {
          uploaded_by_user_id: { not: null },
          valid_until: { gte: now, lte: end },
          users: {
            status: 'active',
            deleted_at: null,
            disabled_at: null,
            notification_preferences: {
              none: { event_type: 'compliance_deadline_reminder', in_app_enabled: false },
            },
          },
        },
        select: {
          compliance_evidence_id: true,
          uploaded_by_user_id: true,
          valid_until: true,
          files: { select: { original_name: true } },
        },
        orderBy: { valid_until: 'asc' },
        take: 500,
      }),
    ]);
  },
  async createComplianceReminder(
    data: Prisma.notificationsCreateManyInput & { notification_id: string; created_at: Date },
  ) {
    return prisma.$transaction(async (tx) => {
      const created = await tx.notifications.createMany({ data: [data], skipDuplicates: true });
      if (!created.count) return false;
      await tx.notification_deliveries.create({
        data: {
          notification_id: data.notification_id,
          channel: 'in_app',
          status: 'delivered',
          sent_at: data.created_at,
        },
      });
      return true;
    });
  },
  listTrainingReminders(
    userId: string,
    query: { page: number; limit: number; status: 'all' | 'unread'; search?: string | undefined },
  ) {
    const search = query.search?.replace(/[\\%_]/g, '\\$&');
    const summaryWhere: Prisma.notificationsWhereInput = {
      user_id: userId,
      type: { in: ['training_deadline_3d', 'training_deadline_1d'] },
    };
    const where: Prisma.notificationsWhereInput = {
      ...summaryWhere,
      ...(query.status === 'unread' ? { is_read: false } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { message: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    return prisma.$transaction([
      prisma.notifications.findMany({
        where,
        select: reminderSelect,
        orderBy: [{ created_at: 'desc' }, { notification_id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.notifications.count({ where }),
      prisma.notifications.count({ where: summaryWhere }),
      prisma.notifications.count({ where: { ...summaryWhere, is_read: false } }),
    ]);
  },
  async markTrainingReminderRead(userId: string, notificationId: string, now: Date) {
    const where = {
      user_id: userId,
      notification_id: notificationId,
      type: { in: ['training_deadline_3d', 'training_deadline_1d'] },
    };
    await prisma.notifications.updateMany({
      where: { ...where, is_read: false },
      data: { is_read: true, read_at: now },
    });
    return prisma.notifications.findFirst({ where, select: reminderSelect });
  },
  async createTrainingReminder(
    tx: Prisma.TransactionClient,
    data: Prisma.notificationsCreateManyInput & { notification_id: string; created_at: Date },
  ) {
    const created = await tx.notifications.createMany({ data: [data], skipDuplicates: true });
    if (!created.count) return false;
    await tx.notification_deliveries.create({
      data: {
        notification_id: data.notification_id,
        channel: 'in_app',
        status: 'delivered',
        sent_at: data.created_at,
      },
    });
    return true;
  },
};
