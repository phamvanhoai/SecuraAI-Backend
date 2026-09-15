import { Router } from 'express';
import { authenticate, authorize } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import {
  assignCourse,
  createCourse,
  listAssignmentOptions,
  listCourses,
} from './training-awareness.controller.js';
import {
  assignCourseBodySchema,
  assignCourseParamsSchema,
  createCourseBodySchema,
  listCoursesQuerySchema,
} from './dto/course.dto.js';

export const trainingAwarenessRouter = Router();

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
  asyncHandler(listAssignmentOptions),
);
trainingAwarenessRouter.post(
  '/courses/:courseId/assignments',
  authenticate,
  authorize('training-courses.assign'),
  validate({ params: assignCourseParamsSchema, body: assignCourseBodySchema }),
  asyncHandler(assignCourse),
);
