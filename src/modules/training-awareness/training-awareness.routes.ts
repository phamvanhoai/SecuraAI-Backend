import { Router } from 'express';
import { authenticate, authorize } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { createCourse, listCourses } from './training-awareness.controller.js';
import { createCourseBodySchema, listCoursesQuerySchema } from './dto/course.dto.js';

export const trainingAwarenessRouter = Router();

trainingAwarenessRouter.get(
  '/courses', authenticate, authorize('training-courses.read'),
  validate({ query: listCoursesQuerySchema }), asyncHandler(listCourses),
);
trainingAwarenessRouter.post(
  '/courses', authenticate, authorize('training-courses.create'),
  validate({ body: createCourseBodySchema }), asyncHandler(createCourse),
);
