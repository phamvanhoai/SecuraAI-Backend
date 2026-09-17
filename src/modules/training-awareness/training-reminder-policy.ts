import { createHash } from 'node:crypto';

const DAY = 86_400_000;
export const trainingReminderTypes = ['training_deadline_3d', 'training_deadline_1d'] as const;

export function utcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function reminderMilestone(dueDate: Date, now: Date): 1 | 3 | null {
  const days = Math.round((utcDay(dueDate).getTime() - utcDay(now).getTime()) / DAY);
  if (days < 0 || days > 3) return null;
  return days <= 1 ? 1 : 3;
}

// A stable database primary key, not a security token. The SQL candidate query uses
// the same MD5 namespace and fixed UUID version/variant bits to exclude sent jobs.
export function reminderId(enrollmentId: string, dueDate: Date, milestone: 1 | 3): string {
  const hash = createHash('md5')
    .update(`training-deadline:${enrollmentId}:${dueDate.toISOString().slice(0, 10)}:${milestone}`)
    .digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20)}`;
}
