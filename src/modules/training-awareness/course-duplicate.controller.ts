import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { assignCourseParamsSchema } from './dto/course.dto.js';
import { duplicateCourseBodySchema } from './dto/duplicate-course.dto.js';
import { courseDuplicateService } from './course-duplicate.service.js';

export const duplicateCourse: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { courseId } = assignCourseParamsSchema.parse(req.params);
  const data = await courseDuplicateService.duplicate(
    courseId,
    duplicateCourseBodySchema.parse(req.body),
    req.auth,
    { ipAddress: req.ip ?? null, userAgent: req.get('user-agent')?.slice(0, 1000) ?? null },
  );
  res.status(201).json({ success: true, data });
};
