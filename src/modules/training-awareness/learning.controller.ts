import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import {
  learningListQuerySchema,
  learningParamsSchema,
  learningLessonParamsSchema,
  learningMaterialParamsSchema,
} from './dto/learning.dto.js';
import { learningService } from './learning.service.js';
export const listMyLearning: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  res.json({
    success: true,
    data: await learningService.list(learningListQuerySchema.parse(req.query), req.auth),
  });
};
export const getMyLearning: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { enrollmentId } = learningParamsSchema.parse(req.params);
  res.json({ success: true, data: await learningService.get(enrollmentId, req.auth) });
};
export const completeMyLesson: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { enrollmentId, lessonId } = learningLessonParamsSchema.parse(req.params);
  res.json({
    success: true,
    data: await learningService.completeLesson(enrollmentId, lessonId, req.auth),
  });
};
export const downloadMyMaterial: RequestHandler = async (req, res, next) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { enrollmentId, materialId } = learningMaterialParamsSchema.parse(req.params);
  const file = await learningService.getMaterial(enrollmentId, materialId, req.auth);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.download(file.absolutePath, file.name, (error) => {
    if (error && !res.headersSent)
      next(new AppError(404, 'TRAINING_MATERIAL_NOT_FOUND', 'Training material not found'));
  });
};
