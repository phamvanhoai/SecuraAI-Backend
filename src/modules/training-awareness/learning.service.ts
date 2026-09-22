import { AppError } from '../../common/errors/app-error.js';
import type { LearningListQuery } from './dto/learning.dto.js';
import { learningRepository } from './learning.repository.js';
import path from 'node:path';
import { env } from '../../config/env.js';

type Actor = { userId: string; permissions: readonly string[] };

const requireLearner = (actor: Actor) => {
  if (!actor.permissions.includes('training-assessments.take'))
    throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
};
export const learningService = {
  async updateMaterialProgress(enrollmentId: string, materialId: string, status: 'in_progress' | 'completed', actor: Actor) {
    requireLearner(actor);
    const result = await learningRepository.updateMaterialProgress(
      enrollmentId,
      materialId,
      actor.userId,
      status,
    );
    if (result && 'kind' in result && result.kind === 'previous_incomplete')
      throw new AppError(
        409,
        'PREVIOUS_TRAINING_MATERIAL_INCOMPLETE',
        'Complete the previous section first',
      );
    return result;
  },
  async getMaterial(enrollmentId: string, materialId: string, actor: Actor) {
    requireLearner(actor);
    const material = await learningRepository.findMaterial(enrollmentId, materialId, actor.userId);
    if (!material?.files)
      throw new AppError(404, 'TRAINING_MATERIAL_NOT_FOUND', 'Training material not found');
    const root = path.resolve(env.FILE_STORAGE_DIR);
    const absolutePath = path.resolve(root, material.files.storage_key);
    if (!absolutePath.startsWith(`${root}${path.sep}`))
      throw new AppError(404, 'TRAINING_MATERIAL_NOT_FOUND', 'Training material not found');
    return { absolutePath, name: material.files.original_name };
  },
  async list(query: LearningListQuery, actor: Actor) {
    requireLearner(actor);
    const result = await learningRepository.list(actor.userId, query);
    return {
      items: result.items.map((item) => ({
        id: item.training_enrollment_id,
        status: item.status,
        progressPercent: Number(item.progress_percent),
        startedAt: item.started_at,
        completedAt: item.completed_at,
        campaignTitle: item.training_campaigns.title,
        startDate: item.training_campaigns.start_date,
        dueDate: item.training_campaigns.due_date,
        course: {
          title: item.training_campaigns.training_courses.title,
          description: item.training_campaigns.training_courses.description,
        },
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / query.limit),
      },
    };
  },
  async get(enrollmentId: string, actor: Actor) {
    requireLearner(actor);
    const item = await learningRepository.find(enrollmentId, actor.userId);
    if (!item)
      throw new AppError(404, 'TRAINING_ENROLLMENT_NOT_FOUND', 'Assigned course not found');
    const course = item.training_campaigns.training_courses;
    const progress = new Map(item.training_lesson_progress.map((p) => [p.training_lesson_id, p]));
    return {
      id: item.training_enrollment_id,
      status: item.status,
      progressPercent: Number(item.progress_percent),
      campaignTitle: item.training_campaigns.title,
      startDate: item.training_campaigns.start_date,
      dueDate: item.training_campaigns.due_date,
      course: {
        id: course.training_course_id,
        title: course.title,
        description: course.description,
        objectives: course.content,
        finalAssessment: course.quizzes[0]
          ? {
              id: course.quizzes[0].quiz_id,
              title: course.quizzes[0].title,
              passed: course.quizzes[0].quiz_attempts.some((a) => a.passed),
            }
          : null,
        lessons: course.training_lessons.map((lesson) => ({
          id: lesson.training_lesson_id,
          title: lesson.title,
          description: lesson.description,
          order: lesson.display_order,
          required: lesson.is_required,
          status: progress.get(lesson.training_lesson_id)?.status ?? 'not_started',
          assessment: lesson.quizzes[0]
            ? {
                id: lesson.quizzes[0].quiz_id,
                title: lesson.quizzes[0].title,
                passed: lesson.quizzes[0].quiz_attempts.some((a) => a.passed),
              }
            : null,
          materials: lesson.training_materials.map((m) => ({
            id: m.training_material_id,
            title: m.title,
            type: m.material_type,
            content: m.content,
            externalUrl: m.external_url,
            file: m.files
              ? {
                  name: m.files.original_name,
                  mimeType: m.files.mime_type,
                  sizeBytes: Number(m.files.size_bytes),
                }
              : null,
            progress: m.training_material_progress[0]
              ? {
                  status: m.training_material_progress[0].status,
                  completedAt: m.training_material_progress[0].completed_at,
                }
              : null,
          })),
        })),
      },
    };
  },
  async completeLesson(enrollmentId: string, lessonId: string, actor: Actor) {
    requireLearner(actor);
    const result = await learningRepository.completeLesson(enrollmentId, lessonId, actor.userId);
    if (result.kind === 'not_found')
      throw new AppError(404, 'TRAINING_LESSON_NOT_FOUND', 'Assigned lesson not found');
    if (result.kind === 'not_available')
      throw new AppError(
        409,
        'TRAINING_NOT_AVAILABLE',
        'Training is outside its availability period',
      );
    if (result.kind === 'assessment_required')
      throw new AppError(
        409,
        'LESSON_ASSESSMENT_REQUIRED',
        'Pass the lesson assessment before completing this lesson',
      );
    return result;
  },
};
