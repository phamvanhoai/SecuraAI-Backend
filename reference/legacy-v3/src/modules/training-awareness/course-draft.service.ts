import { AppError } from '../../common/errors/app-error.js';
import { cleanupStoredCourseMaterials, type CourseUpload } from './course-material.upload.js';
import { courseDraftRepository, type CourseDraftRecord } from './course-draft.repository.js';
import type { UpdateCourseDraftBody } from './dto/course.dto.js';

type Actor = { userId: string; permissions: readonly string[] };
type RequestContext = { ipAddress: string | null; userAgent: string | null };

function requireUpdate(actor: Actor): void {
  if (!actor.permissions.includes('training-courses.update'))
    throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
}

function mapAssessment(quiz: CourseDraftRecord['quizzes'][number]) {
  return {
    title: quiz.title,
    passingScore: Number(quiz.passing_score),
    maxAttempts: quiz.max_attempts,
    questions: quiz.quiz_questions.map((question) => ({
      type: question.question_type,
      text: question.question_text,
      options: question.quiz_options.map((option) => ({
        text: option.option_text,
        isCorrect: option.is_correct,
      })),
    })),
  };
}

function mapDraft(course: CourseDraftRecord) {
  return {
    id: course.training_course_id,
    title: course.title,
    description: course.description,
    content: course.content ?? '',
    status: course.status,
    updatedAt: course.updated_at,
    lessons: course.training_lessons.map((lesson) => ({
      title: lesson.title,
      ...(lesson.description ? { description: lesson.description } : {}),
      isRequired: lesson.is_required,
      materials: lesson.training_materials.map((material) => ({
        title: material.title,
        type: material.material_type,
        ...(material.content !== null ? { content: material.content } : {}),
        ...(material.external_url !== null ? { externalUrl: material.external_url } : {}),
        ...(material.file_id !== null ? { existingFileId: material.file_id } : {}),
        ...(material.files
          ? {
              existingFile: {
                name: material.files.original_name,
                mimeType: material.files.mime_type ?? '',
                sizeBytes:
                  material.files.size_bytes === null ? null : Number(material.files.size_bytes),
              },
            }
          : {}),
      })),
      ...(lesson.quizzes[0] ? { assessment: mapAssessment(lesson.quizzes[0]) } : {}),
    })),
    assessment: course.quizzes[0] ? mapAssessment(course.quizzes[0]) : null,
  };
}

function validateUploads(input: UpdateCourseDraftBody, uploads: readonly CourseUpload[]): void {
  const keys = input.lessons.flatMap((lesson) =>
    lesson.materials.flatMap((material) => (material.uploadKey ? [material.uploadKey] : [])),
  );
  if (
    keys.length !== uploads.length ||
    new Set(uploads.map((upload) => upload.key)).size !== uploads.length ||
    keys.some((key) => !uploads.some((upload) => upload.key === key))
  )
    throw new AppError(
      422,
      'TRAINING_FILES_MISMATCH',
      'Every uploaded material must have exactly one matching file',
    );
  for (const lesson of input.lessons)
    for (const material of lesson.materials) {
      const upload = uploads.find((item) => item.key === material.uploadKey);
      if (
        upload &&
        (material.type === 'video'
          ? !upload.mimeType.startsWith('video/')
          : upload.mimeType !== 'application/pdf')
      )
        throw new AppError(
          422,
          'TRAINING_FILE_TYPE_MISMATCH',
          'The file type does not match the lesson material',
        );
    }
}

export const courseDraftService = {
  async get(courseId: string, actor: Actor) {
    requireUpdate(actor);
    const course = await courseDraftRepository.find(courseId);
    if (!course) throw new AppError(404, 'TRAINING_COURSE_NOT_FOUND', 'Training course not found');
    if (course.status !== 'draft')
      throw new AppError(409, 'TRAINING_COURSE_NOT_DRAFT', 'Only draft courses can be edited');
    if (course.training_campaigns.length)
      throw new AppError(409, 'TRAINING_COURSE_IN_USE', 'Assigned courses cannot be edited');
    return mapDraft(course);
  },

  async update(
    courseId: string,
    input: UpdateCourseDraftBody,
    actor: Actor,
    context: RequestContext,
    uploads: readonly CourseUpload[],
  ) {
    requireUpdate(actor);
    validateUploads(input, uploads);
    const result = await courseDraftRepository.update(
      courseId,
      input,
      { actorUserId: actor.userId, ...context },
      uploads,
    );
    if (result.kind === 'not_found')
      throw new AppError(404, 'TRAINING_COURSE_NOT_FOUND', 'Training course not found');
    if (result.kind === 'not_draft')
      throw new AppError(409, 'TRAINING_COURSE_NOT_DRAFT', 'Only draft courses can be edited');
    if (result.kind === 'in_use')
      throw new AppError(409, 'TRAINING_COURSE_IN_USE', 'Assigned courses cannot be edited');
    if (result.kind === 'stale')
      throw new AppError(
        409,
        'TRAINING_COURSE_STALE',
        'This draft changed. Reload it and try again',
      );
    if (result.kind === 'invalid_file')
      throw new AppError(422, 'INVALID_TRAINING_FILE_REFERENCE', 'Invalid existing material file');
    await cleanupStoredCourseMaterials(result.removedStorageKeys);
    return mapDraft(result.course);
  },
};
