import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { assignCourseParamsSchema } from './dto/course.dto.js';
import { coursePublishService } from './course-publish.service.js';

export const publishCourse: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { courseId } = assignCourseParamsSchema.parse(req.params);
  const data = await coursePublishService.publish(courseId, req.auth, {
    ipAddress: req.ip ?? null,
    userAgent: req.get('user-agent')?.slice(0, 1000) ?? null,
  });
  res.status(200).json({ success: true, data });
};
