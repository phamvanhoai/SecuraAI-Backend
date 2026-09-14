import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { trainingAwarenessService } from './training-awareness.service.js';
import { createCourseBodySchema, listCoursesQuerySchema } from './dto/course.dto.js';

export const listCourses: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const data = await trainingAwarenessService.listCourses(listCoursesQuerySchema.parse(req.query), req.auth);
  res.status(200).json({ success: true, data });
};

export const createCourse: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const data = await trainingAwarenessService.createCourse(
    createCourseBodySchema.parse(req.body), req.auth,
    { ipAddress: req.ip ?? null, userAgent: req.get('user-agent')?.slice(0, 1000) ?? null },
  );
  res.status(201).json({ success: true, data });
};
