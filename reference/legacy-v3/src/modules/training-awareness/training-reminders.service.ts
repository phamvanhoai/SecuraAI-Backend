import { notificationsService } from '../notifications/index.js';
import { trainingRemindersRepository } from './training-reminders.repository.js';
import { reminderId, reminderMilestone } from './training-reminder-policy.js';

export const trainingRemindersService = {
  async dispatch(now = new Date()) {
    let delivered = 0;
    let processed = 0;
    let hasMore = false;
    const started = Date.now();
    // Bounded work for a serverless request. Subsequent runs pick up unsent jobs;
    // the database primary key also prevents duplicates across processes.
    do {
      const candidates = await trainingRemindersRepository.findCandidates(now);
      hasMore = candidates.length === 100;
      let batchDelivered = 0;
      for (const candidate of candidates) {
        if (Date.now() - started >= 20_000) {
          hasMore = true;
          break;
        }
        const created = await trainingRemindersRepository.processCandidate(
          candidate.training_enrollment_id,
          now,
          async (enrollment, tx) => {
            const due = enrollment.training_campaigns.due_date;
            const milestone = reminderMilestone(due, now);
            if (!milestone) return false;
            const deadline = due.toISOString().slice(0, 10);
            return notificationsService.createTrainingReminder(tx, {
              notificationId: reminderId(enrollment.training_enrollment_id, due, milestone),
              userId: enrollment.user_id,
              enrollmentId: enrollment.training_enrollment_id,
              milestone,
              now,
              title: 'Training deadline approaching',
              message: `Complete "${enrollment.training_campaigns.training_courses.title}" for "${enrollment.training_campaigns.title}" by ${deadline} (end of day UTC). Open My assigned training to continue.`,
            });
          },
        );
        processed += 1;
        if (created) {
          delivered += 1;
          batchDelivered += 1;
        }
      }
      if (!batchDelivered && hasMore) break;
    } while (hasMore && processed < 1000 && Date.now() - started < 20_000);
    return { delivered, processed, hasMore };
  },
};
