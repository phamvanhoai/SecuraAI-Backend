import { Router } from 'express';
import { getDepartmentReport } from './department-report.controller.js';
import { departmentReportQuerySchema } from './dto/department-report.dto.js';
import { getCertificate, issueCertificate } from './certificate.controller.js';
import { authenticate, authorize } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import {
  assignCourse,
  createCourse,
  listAssignmentOptions,
  listCourses,
  getMyAssessment,
  listMyAssessments,
  submitMyAssessment,
  getCompletionCampaign,
  getLatestCourseAssignment,
  listCompletionCampaigns,
  withdrawEnrollment,
} from './training-awareness.controller.js';
import {
  assignmentOptionsQuerySchema,
  assignCourseBodySchema,
  assignCourseParamsSchema,
  createCourseBodySchema,
  listCoursesQuerySchema,
  withdrawEnrollmentBodySchema,
} from './dto/course.dto.js';
import {
  assessmentParamsSchema,
  listMyAssessmentsQuerySchema,
  submitAssessmentBodySchema,
} from './dto/assessment.dto.js';
import {
  completionCampaignParamsSchema,
  completionCampaignsQuerySchema,
  completionEnrollmentsQuerySchema,
} from './dto/completion.dto.js';

import { reminderParamsSchema, reminderQuerySchema } from './dto/reminder.dto.js';
import {
  authenticateReminderCron,
  dispatchTrainingReminders,
  listTrainingReminders,
  markTrainingReminderRead,
} from './training-reminders.controller.js';

export const trainingAwarenessRouter = Router();
trainingAwarenessRouter.get(
  '/department-report',
  authenticate,
  authorize('training-department-reports.read'),
  validate({ query: departmentReportQuerySchema }),
  asyncHandler(getDepartmentReport),
);
trainingAwarenessRouter.get(
  '/enrollments/:enrollmentId/certificate',
  authenticate,
  authorize('training-completion.read'),
  validate({ params: assessmentParamsSchema }),
  asyncHandler(getCertificate),
);
trainingAwarenessRouter.post(
  '/enrollments/:enrollmentId/certificate',
  authenticate,
  authorize('training-certificates.issue'),
  validate({ params: assessmentParamsSchema }),
  asyncHandler(issueCertificate),
);
trainingAwarenessRouter.get(
  '/deadline-reminders',
  authenticate,
  authorize('training-assessments.take'),
  validate({ query: reminderQuerySchema }),
  asyncHandler(listTrainingReminders),
);
trainingAwarenessRouter.patch(
  '/deadline-reminders/:notificationId/read',
  authenticate,
  authorize('training-assessments.take'),
  validate({ params: reminderParamsSchema }),
  asyncHandler(markTrainingReminderRead),
);
trainingAwarenessRouter.get(
  '/deadline-reminders/dispatch',
  authenticateReminderCron,
  asyncHandler(dispatchTrainingReminders),
);
trainingAwarenessRouter.post(
  '/enrollments/:enrollmentId/withdraw',
  authenticate,
  authorize('training-courses.assign'),
  validate({ params: assessmentParamsSchema, body: withdrawEnrollmentBodySchema }),
  asyncHandler(withdrawEnrollment),
);

trainingAwarenessRouter.get(
  '/completion',
  authenticate,
  authorize('training-completion.read'),
  validate({ query: completionCampaignsQuerySchema }),
  asyncHandler(listCompletionCampaigns),
);
trainingAwarenessRouter.get(
  '/completion/:campaignId',
  authenticate,
  authorize('training-completion.read'),
  validate({ params: completionCampaignParamsSchema, query: completionEnrollmentsQuerySchema }),
  asyncHandler(getCompletionCampaign),
);

trainingAwarenessRouter.get(
  '/assessments',
  authenticate,
  authorize('training-assessments.take'),
  validate({ query: listMyAssessmentsQuerySchema }),
  asyncHandler(listMyAssessments),
);
trainingAwarenessRouter.get(
  '/assessments/:enrollmentId',
  authenticate,
  authorize('training-assessments.take'),
  validate({ params: assessmentParamsSchema }),
  asyncHandler(getMyAssessment),
);
trainingAwarenessRouter.post(
  '/assessments/:enrollmentId/attempts',
  authenticate,
  authorize('training-assessments.take'),
  validate({ params: assessmentParamsSchema, body: submitAssessmentBodySchema }),
  asyncHandler(submitMyAssessment),
);
trainingAwarenessRouter.get(
  '/courses/:courseId/assignments',
  authenticate,
  authorize('training-courses.assign'),
  validate({ params: assignCourseParamsSchema }),
  asyncHandler(getLatestCourseAssignment),
);

trainingAwarenessRouter.get(
  '/courses',
  authenticate,
  authorize('training-courses.read'),
  validate({ query: listCoursesQuerySchema }),
  asyncHandler(listCourses),
);
trainingAwarenessRouter.post(
  '/courses',
  authenticate,
  authorize('training-courses.create'),
  validate({ body: createCourseBodySchema }),
  asyncHandler(createCourse),
);
trainingAwarenessRouter.get(
  '/assignment-options',
  authenticate,
  authorize('training-courses.assign'),
  validate({ query: assignmentOptionsQuerySchema }),
  asyncHandler(listAssignmentOptions),
);
trainingAwarenessRouter.post(
  '/courses/:courseId/assignments',
  authenticate,
  authorize('training-courses.assign'),
  validate({ params: assignCourseParamsSchema, body: assignCourseBodySchema }),
  asyncHandler(assignCourse),
);
