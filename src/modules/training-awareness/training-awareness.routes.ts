import { Router } from 'express';
import {
  completeMyLesson,
  downloadMyMaterial,
  getMyLearning,
  listMyLearning,
} from './learning.controller.js';
import { parseCourseUpload } from './course-material.upload.js';
import { getCourseDraft, updateCourseDraft } from './course-draft.controller.js';
import { getCourseContent, downloadCourseMaterial } from './course-content.controller.js';
import { getDepartmentReport } from './department-report.controller.js';
import { departmentReportQuerySchema } from './dto/department-report.dto.js';
import { getCertificate, issueCertificate } from './certificate.controller.js';
import { listMyCertificates } from './my-certificates.controller.js';
import { myCertificatesQuerySchema } from './dto/my-certificates.dto.js';
import { listIssuedCertificates } from './issued-certificates.controller.js';
import { issuedCertificatesQuerySchema } from './dto/issued-certificates.dto.js';
import { authenticate, authorize } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import {
  assignCourse,
  createCourse,
  listAssignmentOptions,
  listCourses,
  getMyAssessment,
  getMyLessonAssessment,
  listMyAssessments,
  submitMyAssessment,
  submitMyLessonAssessment,
  getCompletionCampaign,
  getLatestCourseAssignment,
  listCompletionCampaigns,
  withdrawEnrollment,
} from './training-awareness.controller.js';
import {
  assignmentOptionsQuerySchema,
  assignCourseBodySchema,
  assignCourseParamsSchema,
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
  '/certificates',
  authenticate,
  authorize('training-certificates.read-issued'),
  validate({ query: issuedCertificatesQuerySchema }),
  asyncHandler(listIssuedCertificates),
);
trainingAwarenessRouter.get(
  '/my-certificates',
  authenticate,
  authorize('training-certificates.read-own'),
  validate({ query: myCertificatesQuerySchema }),
  asyncHandler(listMyCertificates),
);
trainingAwarenessRouter.get(
  '/learning',
  authenticate,
  authorize('training-assessments.take'),
  asyncHandler(listMyLearning),
);
trainingAwarenessRouter.get(
  '/learning/:enrollmentId',
  authenticate,
  authorize('training-assessments.take'),
  asyncHandler(getMyLearning),
);
trainingAwarenessRouter.patch(
  '/learning/:enrollmentId/lessons/:lessonId/complete',
  authenticate,
  authorize('training-assessments.take'),
  asyncHandler(completeMyLesson),
);
trainingAwarenessRouter.get(
  '/learning/:enrollmentId/materials/:materialId/download',
  authenticate,
  authorize('training-assessments.take'),
  asyncHandler(downloadMyMaterial),
);
trainingAwarenessRouter.get(
  '/learning/:enrollmentId/lessons/:lessonId/assessment',
  authenticate,
  authorize('training-assessments.take'),
  asyncHandler(getMyLessonAssessment),
);
trainingAwarenessRouter.post(
  '/learning/:enrollmentId/lessons/:lessonId/assessment/attempts',
  authenticate,
  authorize('training-assessments.take'),
  asyncHandler(submitMyLessonAssessment),
);
trainingAwarenessRouter.get(
  '/courses/:courseId/content',
  authenticate,
  authorize('training-courses.read'),
  asyncHandler(getCourseContent),
);
trainingAwarenessRouter.get(
  '/materials/:materialId/download',
  authenticate,
  authorize('training-courses.read'),
  asyncHandler(downloadCourseMaterial),
);
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
  parseCourseUpload,
  asyncHandler(createCourse),
);
trainingAwarenessRouter.get(
  '/courses/:courseId',
  authenticate,
  authorize('training-courses.update'),
  validate({ params: assignCourseParamsSchema }),
  asyncHandler(getCourseDraft),
);
trainingAwarenessRouter.patch(
  '/courses/:courseId',
  authenticate,
  authorize('training-courses.update'),
  parseCourseUpload,
  asyncHandler(updateCourseDraft),
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
