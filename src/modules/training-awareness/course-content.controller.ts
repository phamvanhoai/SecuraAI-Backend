import type { RequestHandler } from 'express';
import { z } from 'zod';
import { AppError } from '../../common/errors/app-error.js';
import { courseContentService } from './course-content.service.js';

export const getCourseContent: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { courseId } = z.object({ courseId: z.uuid() }).parse(req.params);
  res.json({ success: true, data: await courseContentService.getContent(courseId, req.auth) });
};
export const downloadCourseMaterial: RequestHandler = async (req, res, next) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { materialId } = z.object({ materialId: z.uuid() }).parse(req.params);
  const file = await courseContentService.getFile(materialId, req.auth);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.download(file.absolutePath, file.name, (error) => {
    if (error)
      next(new AppError(404, 'MATERIAL_FILE_UNAVAILABLE', 'The material file is unavailable'));
  });
};
