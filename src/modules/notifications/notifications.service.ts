/** Business rules and transaction orchestration for the notifications module belong here. */
import type { Prisma } from '@prisma/client';
import {
  notificationsRepository,
  type TrainingReminderRecord,
} from './notifications.repository.js';
import { AppError } from '../../common/errors/app-error.js';
import { createHash } from 'node:crypto';
import type { ComplianceReminderQuery } from './dto/compliance-reminder.dto.js';

type Actor = { userId: string; permissions: readonly string[] };
function requireEmployeePermission(actor: Actor) {
  if (!actor.permissions.includes('training-assessments.take')) {
    throw new AppError(403, 'FORBIDDEN', 'Training assessment permission required');
  }
}
const mapReminder = (item: TrainingReminderRecord) => ({
  notificationId: item.notification_id,
  enrollmentId: item.entity_id,
  title: item.title,
  message: item.message,
  isRead: item.is_read,
  readAt: item.read_at?.toISOString() ?? null,
  createdAt: item.created_at.toISOString(),
});
const requireComplianceReminderPermission = (actor: Actor) => {
  if (
    !actor.permissions.some((permission) =>
      ['compliance.assess-controls', 'compliance.evidence.upload', 'policies.acknowledge'].includes(
        permission,
      ),
    )
  )
    throw new AppError(403, 'FORBIDDEN', 'Compliance permission required');
};
const reminderUuid = (key: string) => {
  const hex = createHash('md5').update(key).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
};
const daysUntil = (date: Date, now: Date) =>
  Math.ceil((date.getTime() - now.getTime()) / 86_400_000);

export const notificationsService = {
  async listComplianceReminders(actor: Actor, query: ComplianceReminderQuery) {
    requireComplianceReminderPermission(actor);
    const [items, total] = await notificationsRepository.listComplianceReminders(
      actor.userId,
      query,
    );
    return {
      items: items.map((item) => ({
        ...mapReminder(item),
        kind: item.entity_type === 'control_assessment' ? 'control_review' : 'evidence_expiry',
        entityId: item.entity_id,
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    };
  },
  async markComplianceReminderRead(actor: Actor, notificationId: string) {
    requireComplianceReminderPermission(actor);
    const item = await notificationsRepository.markComplianceReminderRead(
      actor.userId,
      notificationId,
      new Date(),
    );
    if (!item) throw new AppError(404, 'REMINDER_NOT_FOUND', 'Reminder not found');
    return {
      ...mapReminder(item),
      kind: item.entity_type === 'control_assessment' ? 'control_review' : 'evidence_expiry',
      entityId: item.entity_id,
    };
  },
  async dispatchComplianceReminders(now = new Date()) {
    const [assessments, evidence] =
      await notificationsRepository.findComplianceReminderCandidates(now);
    let delivered = 0;
    for (const item of assessments) {
      if (!item.assessed_by_user_id || !item.next_review_at) continue;
      const milestone = daysUntil(item.next_review_at, now) <= 1 ? 1 : 7;
      const date = item.next_review_at.toISOString().slice(0, 10);
      if (
        await notificationsRepository.createComplianceReminder({
          notification_id: reminderUuid(
            `control-review:${item.control_assessment_id}:${date}:${milestone}`,
          ),
          user_id: item.assessed_by_user_id,
          type: `compliance_control_review_${milestone}d`,
          title: 'Control review deadline approaching',
          message: `Review ${item.control_code} — ${item.title} by ${date}.`,
          entity_type: 'control_assessment',
          entity_id: item.control_assessment_id,
          created_at: now,
        })
      )
        delivered++;
    }
    for (const item of evidence) {
      if (!item.uploaded_by_user_id || !item.valid_until) continue;
      const milestone = daysUntil(item.valid_until, now) <= 1 ? 1 : 7;
      const date = item.valid_until.toISOString().slice(0, 10);
      if (
        await notificationsRepository.createComplianceReminder({
          notification_id: reminderUuid(
            `evidence-expiry:${item.compliance_evidence_id}:${date}:${milestone}`,
          ),
          user_id: item.uploaded_by_user_id,
          type: `compliance_evidence_expiry_${milestone}d`,
          title: 'Compliance evidence expires soon',
          message: `Evidence “${item.files.original_name}” is valid until ${date}. Review or replace it before expiry.`,
          entity_type: 'compliance_evidence',
          entity_id: item.compliance_evidence_id,
          created_at: now,
        })
      )
        delivered++;
    }
    return { delivered, processed: assessments.length + evidence.length };
  },
  async listTrainingReminders(
    actor: Actor,
    query: { page: number; limit: number; status: 'all' | 'unread'; search?: string | undefined },
  ) {
    requireEmployeePermission(actor);
    const [items, total] = await notificationsRepository.listTrainingReminders(actor.userId, query);
    return {
      items: items.map(mapReminder),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    };
  },
  async markTrainingReminderRead(actor: Actor, notificationId: string) {
    requireEmployeePermission(actor);
    const item = await notificationsRepository.markTrainingReminderRead(
      actor.userId,
      notificationId,
      new Date(),
    );
    if (!item) throw new AppError(404, 'REMINDER_NOT_FOUND', 'Reminder not found');
    return mapReminder(item);
  },
  createTrainingReminder(
    tx: Prisma.TransactionClient,
    data: {
      notificationId: string;
      userId: string;
      enrollmentId: string;
      title: string;
      message: string;
      milestone: 1 | 3;
      now: Date;
    },
  ) {
    return notificationsRepository.createTrainingReminder(tx, {
      notification_id: data.notificationId,
      user_id: data.userId,
      type: `training_deadline_${data.milestone}d`,
      title: data.title,
      message: data.message,
      entity_type: 'training_enrollment',
      entity_id: data.enrollmentId,
      created_at: data.now,
    });
  },
};
