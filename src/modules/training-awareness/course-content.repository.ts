import { prisma } from '../../database/prisma.js';

export const courseContentRepository = {
  findCourse(courseId: string) {
    return prisma.training_courses.findUnique({
      where: { training_course_id: courseId },
      select: {
        training_course_id: true,
        training_lessons: {
          orderBy: { display_order: 'asc' },
          select: {
            training_lesson_id: true,
            title: true,
            description: true,
            display_order: true,
            is_required: true,
            training_materials: {
              orderBy: { display_order: 'asc' },
              select: {
                training_material_id: true,
                title: true,
                material_type: true,
                content: true,
                external_url: true,
                files: { select: { original_name: true, mime_type: true, size_bytes: true } },
              },
            },
            quizzes: {
              select: {
                title: true,
                passing_score: true,
                max_attempts: true,
                _count: { select: { quiz_questions: true } },
              },
            },
          },
        },
      },
    });
  },
  findMaterial(materialId: string) {
    return prisma.training_materials.findUnique({
      where: { training_material_id: materialId },
      select: { files: { select: { original_name: true, storage_key: true, mime_type: true } } },
    });
  },
};
