import type { RequestHandler } from 'express';
import { z } from 'zod';
import { AppError } from '../../common/errors/app-error.js';
import { cleanupCourseUploads, inspectCourseUploads } from './course-material.upload.js';
import { courseDraftService } from './course-draft.service.js';
import { updateCourseDraftBodySchema } from './dto/course.dto.js';

const paramsSchema = z.object({ courseId: z.uuid() });

export const getCourseDraft: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { courseId } = paramsSchema.parse(req.params);
  res.status(200).json({ success: true, data: await courseDraftService.get(courseId, req.auth) });
};

export const updateCourseDraft: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const files = Array.isArray(req.files) ? req.files : [];
  let saved = false;
  try {
    const { courseId } = paramsSchema.parse(req.params);
    let body: unknown = req.body;
    if (req.is('multipart/form-data')) {
      const multipart = z
        .object({ payload: z.string().max(1024 * 1024) })
        .strict()
        .parse(body);
      try {
        body = JSON.parse(multipart.payload) as unknown;
      } catch {
        throw new AppError(422, 'INVALID_COURSE_PAYLOAD', 'Invalid course payload');
      }
    }
    const data = await courseDraftService.update(
      courseId,
      updateCourseDraftBodySchema.parse(body),
      req.auth,
      { ipAddress: req.ip ?? null, userAgent: req.get('user-agent')?.slice(0, 1000) ?? null },
      await inspectCourseUploads(files),
    );
    saved = true;
    res.status(200).json({ success: true, data });
  } finally {
    if (!saved) await cleanupCourseUploads(files);
  }
};
