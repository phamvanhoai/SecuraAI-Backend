import path from 'node:path';
import { env } from '../../config/env.js';
import { AppError } from '../../common/errors/app-error.js';
import { courseContentRepository } from './course-content.repository.js';

type Actor = { permissions: readonly string[] };
function requireRead(actor: Actor): void {
  if (!actor.permissions.includes('training-courses.read'))
    throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
}
export const courseContentService = {
  async getContent(courseId: string, actor: Actor) {
    requireRead(actor);
    const course = await courseContentRepository.findCourse(courseId);
    if (!course) throw new AppError(404, 'COURSE_NOT_FOUND', 'Course not found');
    return {
      lessons: course.training_lessons.map((lesson) => ({
        id: lesson.training_lesson_id,
        title: lesson.title,
        description: lesson.description,
        order: lesson.display_order,
        isRequired: lesson.is_required,
        materials: lesson.training_materials.map((material) => ({
          id: material.training_material_id,
          title: material.title,
          type: material.material_type,
          content: material.content,
          externalUrl: material.external_url,
          file: material.files
            ? {
                name: material.files.original_name,
                mimeType: material.files.mime_type,
                sizeBytes:
                  material.files.size_bytes === null ? null : Number(material.files.size_bytes),
              }
            : null,
        })),
        assessments: lesson.quizzes.map((quiz) => ({
          title: quiz.title,
          passingScore: Number(quiz.passing_score),
          maxAttempts: quiz.max_attempts,
          questionCount: quiz._count.quiz_questions,
        })),
      })),
    };
  },
  async getFile(materialId: string, actor: Actor) {
    requireRead(actor);
    const material = await courseContentRepository.findMaterial(materialId);
    if (!material?.files)
      throw new AppError(404, 'MATERIAL_FILE_NOT_FOUND', 'Material file not found');
    const root = path.resolve(env.FILE_STORAGE_DIR, 'training-materials');
    const absolutePath = path.resolve(env.FILE_STORAGE_DIR, material.files.storage_key);
    if (!absolutePath.startsWith(root + path.sep))
      throw new AppError(404, 'MATERIAL_FILE_NOT_FOUND', 'Material file not found');
    return { absolutePath, name: material.files.original_name };
  },
};
