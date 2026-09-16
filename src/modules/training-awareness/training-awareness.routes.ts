import { Router } from 'express';
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
  listCompletionCampaigns,
} from './training-awareness.controller.js';
import {
  assignmentOptionsQuerySchema,
  assignCourseBodySchema,
  assignCourseParamsSchema,
  createCourseBodySchema,
  listCoursesQuerySchema,
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

export const trainingAwarenessRouter = Router();

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
