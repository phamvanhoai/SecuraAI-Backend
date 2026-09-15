import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { trainingAwarenessService } from './training-awareness.service.js';
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
  const data = await trainingAwarenessService.createCourse(
    createCourseBodySchema.parse(req.body),
    req.auth,
    { ipAddress: req.ip ?? null, userAgent: req.get('user-agent')?.slice(0, 1000) ?? null },
  );
  res.status(201).json({ success: true, data });
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
