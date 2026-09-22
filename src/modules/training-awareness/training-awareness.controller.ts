import type { RequestHandler } from 'express';
import { z } from 'zod';
import { AppError } from '../../common/errors/app-error.js';
import { cleanupCourseUploads, inspectCourseUploads } from './course-material.upload.js';
import { trainingAwarenessService } from './training-awareness.service.js';
import {
  assignmentOptionsQuerySchema,
  assignCourseBodySchema,
  assignCourseParamsSchema,
  createCourseBodySchema,
  listCoursesQuerySchema,
  updateCourseDraftBodySchema,
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

export const listCompletionCampaigns: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const data = await trainingAwarenessService.listCompletionCampaigns(
    completionCampaignsQuerySchema.parse(req.query),
    req.auth,
  );
  res.status(200).json({ success: true, data });
};

export const getCompletionCampaign: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { campaignId } = completionCampaignParamsSchema.parse(req.params);
  const data = await trainingAwarenessService.getCompletionCampaign(
    campaignId,
    completionEnrollmentsQuerySchema.parse(req.query),
    req.auth,
  );
  res.status(200).json({ success: true, data });
};

export const listMyAssessments: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const data = await trainingAwarenessService.listMyAssessments(
    listMyAssessmentsQuerySchema.parse(req.query),
    req.auth,
  );
  res.status(200).json({ success: true, data });
};

export const getMyAssessment: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { enrollmentId } = assessmentParamsSchema.parse(req.params);
  const data = await trainingAwarenessService.getMyAssessment(enrollmentId, req.auth);
  res.status(200).json({ success: true, data });
};

export const submitMyAssessment: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { enrollmentId } = assessmentParamsSchema.parse(req.params);
  const data = await trainingAwarenessService.submitMyAssessment(
    enrollmentId,
    submitAssessmentBodySchema.parse(req.body),
    req.auth,
    { ipAddress: req.ip ?? null, userAgent: req.get('user-agent')?.slice(0, 1000) ?? null },
  );
  res.status(201).json({ success: true, data });
};

export const getMyLessonAssessment: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { enrollmentId } = assessmentParamsSchema.parse(req.params);
  const lessonId = z.string().uuid().parse(req.params.lessonId);
  const data = await trainingAwarenessService.getMyAssessment(enrollmentId, req.auth, lessonId);
  res.status(200).json({ success: true, data });
};

export const submitMyLessonAssessment: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { enrollmentId } = assessmentParamsSchema.parse(req.params);
  const lessonId = z.string().uuid().parse(req.params.lessonId);
  const data = await trainingAwarenessService.submitMyAssessment(
    enrollmentId,
    submitAssessmentBodySchema.parse(req.body),
    req.auth,
    { ipAddress: req.ip ?? null, userAgent: req.get('user-agent')?.slice(0, 1000) ?? null },
    lessonId,
  );
  res.status(201).json({ success: true, data });
};

export const listCourses: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const data = await trainingAwarenessService.listCourses(
    listCoursesQuerySchema.parse(req.query),
    req.auth,
  );
  res.status(200).json({ success: true, data });
};

export const createCourse: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const files = Array.isArray(req.files) ? req.files : [];
  let saved = false;
  try {
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
    const data = await trainingAwarenessService.createCourse(
      createCourseBodySchema.parse(body),
      req.auth,
      { ipAddress: req.ip ?? null, userAgent: req.get('user-agent')?.slice(0, 1000) ?? null },
    );
    saved = true;
    res.status(201).json({ success: true, data });
  } finally {
    if (!saved) await cleanupCourseUploads(files);
  }
};

export const getCourseDraft: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { courseId } = assignCourseParamsSchema.parse(req.params);
  const data = await trainingAwarenessService.getCourseDraft(courseId, req.auth);
  res.status(200).json({ success: true, data });
};

export const updateCourseDraft: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { courseId } = assignCourseParamsSchema.parse(req.params);
  const data = await trainingAwarenessService.updateCourseDraft(
    courseId,
    updateCourseDraftBodySchema.parse(req.body),
    req.auth,
    { ipAddress: req.ip ?? null, userAgent: req.get('user-agent')?.slice(0, 1000) ?? null },
  );
  res.status(200).json({ success: true, data });
};

export const listAssignmentOptions: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  res.status(200).json({
    success: true,
    data: await trainingAwarenessService.listAssignmentOptions(
      assignmentOptionsQuerySchema.parse(req.query),
      req.auth,
    ),
  });
};

export const assignCourse: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { courseId } = assignCourseParamsSchema.parse(req.params);
  const data = await trainingAwarenessService.assignCourse(
    courseId,
    assignCourseBodySchema.parse(req.body),
    req.auth,
    { ipAddress: req.ip ?? null, userAgent: req.get('user-agent')?.slice(0, 1000) ?? null },
  );
  res.status(201).json({ success: true, data });
};

export const getLatestCourseAssignment: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { courseId } = assignCourseParamsSchema.parse(req.params);
  res.status(200).json({
    success: true,
    data: await trainingAwarenessService.getLatestCourseAssignment(courseId, req.auth),
  });
};
import { withdrawEnrollmentBodySchema } from './dto/course.dto.js';
export const withdrawEnrollment: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { enrollmentId } = assessmentParamsSchema.parse(req.params);
  const { reason } = withdrawEnrollmentBodySchema.parse(req.body);
  res.json({
    success: true,
    data: await trainingAwarenessService.withdrawEnrollment(enrollmentId, reason, req.auth, {
      ipAddress: req.ip ?? null,
      userAgent: req.get('user-agent')?.slice(0, 1000) ?? null,
    }),
  });
};
