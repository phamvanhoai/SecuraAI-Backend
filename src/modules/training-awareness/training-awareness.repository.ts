import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import type { CourseUpload } from './course-material.upload.js';
import type {
  AssignCourseBody,
  AssignmentOptionsQuery,
  CreateCourseBody,
  ListCoursesQuery,
} from './dto/course.dto.js';
import type { ListMyAssessmentsQuery, SubmitAssessmentBody } from './dto/assessment.dto.js';
import type { CompletionCampaignsQuery, CompletionEnrollmentsQuery } from './dto/completion.dto.js';

const courseSelect = {
  training_course_id: true,
  title: true,
  description: true,
  content: true,
  status: true,
  created_by_user_id: true,
  created_at: true,
  updated_at: true,
} satisfies Prisma.training_coursesSelect;

export type CourseRecord = Prisma.training_coursesGetPayload<{ select: typeof courseSelect }>;
type RequestContext = { actorUserId: string; ipAddress: string | null; userAgent: string | null };

export const trainingAwarenessRepository = {
  withdrawEnrollment(enrollmentId: string, reason: string, context: RequestContext) {
    return prisma.$transaction(async (tx) => {
      const changed = await tx.training_enrollments.updateMany({
        where: {
          training_enrollment_id: enrollmentId,
          status: { notIn: ['completed', 'withdrawn'] },
        },
        data: { status: 'withdrawn' },
      });
      if (!changed.count) return false;
      await tx.audit_logs.create({
        data: {
          actor_user_id: context.actorUserId,
          module: 'training-awareness',
          action: 'training_assignment.withdrawn',
          entity_type: 'training_enrollment',
          entity_id: enrollmentId,
          after_data: { status: 'withdrawn', reason },
          ip_address: context.ipAddress,
          user_agent: context.userAgent,
        },
      });
      return true;
    });
  },
  async listCompletionCampaigns(query: CompletionCampaignsQuery) {
    const where: Prisma.training_campaignsWhereInput = {
      ...(query.courseId ? { training_course_id: query.courseId } : {}),
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: 'insensitive' } },
              { training_courses: { title: { contains: query.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [total, campaigns] = await prisma.$transaction([
      prisma.training_campaigns.count({ where }),
      prisma.training_campaigns.findMany({
        where,
        select: {
          training_campaign_id: true,
          title: true,
          start_date: true,
          due_date: true,
          created_at: true,
          training_courses: { select: { title: true } },
        },
        orderBy: [{ due_date: 'desc' }, { training_campaign_id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    const ids = campaigns.map((campaign) => campaign.training_campaign_id);
    const groups = ids.length
      ? await prisma.training_enrollments.groupBy({
          by: ['training_campaign_id', 'status'],
          where: { training_campaign_id: { in: ids } },
          _count: { _all: true },
          _avg: { progress_percent: true },
        })
      : [];
    return { campaigns, groups, total };
  },
  async getCompletionCampaign(campaignId: string, query: CompletionEnrollmentsQuery) {
    const campaign = await prisma.training_campaigns.findUnique({
      where: { training_campaign_id: campaignId },
      select: {
        training_campaign_id: true,
        title: true,
        start_date: true,
        due_date: true,
        training_courses: {
          select: {
            title: true,
            training_lessons: {
              where: { is_required: true },
              select: { training_lesson_id: true },
            },
            quizzes: {
              where: { training_lesson_id: null },
              select: { quiz_id: true },
              orderBy: [{ created_at: 'desc' }, { quiz_id: 'desc' }],
              take: 1,
            },
          },
        },
      },
    });
    if (!campaign) return null;
    const requiredLessonIds = campaign.training_courses.training_lessons.map(
      (lesson) => lesson.training_lesson_id,
    );
    const finalQuizIds = campaign.training_courses.quizzes.map((quiz) => quiz.quiz_id);
    const dueBoundary = new Date(campaign.due_date);
    dueBoundary.setUTCDate(dueBoundary.getUTCDate() + 1);
    const overdue = dueBoundary <= new Date() && query.status === 'overdue';
    const where: Prisma.training_enrollmentsWhereInput = {
      training_campaign_id: campaignId,
      ...(query.status !== 'all'
        ? { status: overdue ? { notIn: ['completed', 'withdrawn'] } : query.status }
        : {}),
      ...(query.q
        ? {
            users: {
              OR: [
                { full_name: { contains: query.q, mode: 'insensitive' } },
                { email: { contains: query.q, mode: 'insensitive' } },
                { employee_code: { contains: query.q, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
    };
    const [total, items] = await prisma.$transaction([
      prisma.training_enrollments.count({ where }),
      prisma.training_enrollments.findMany({
        where,
        select: {
          training_enrollment_id: true,
          status: true,
          progress_percent: true,
          started_at: true,
          completed_at: true,
          last_accessed_at: true,
          training_lesson_progress: {
            where: { training_lesson_id: { in: requiredLessonIds } },
            select: { training_lesson_id: true, status: true },
          },
          quiz_attempts: {
            where: { quiz_id: { in: finalQuizIds }, submitted_at: { not: null } },
            select: { score: true, passed: true, submitted_at: true },
            orderBy: { submitted_at: 'desc' },
          },
          training_certificates: { select: { certificate_number: true } },
          users: {
            select: { user_id: true, full_name: true, email: true, employee_code: true },
          },
        },
        orderBy: [{ status: 'asc' }, { users: { full_name: 'asc' } }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    const statusGroups = await prisma.training_enrollments.groupBy({
      by: ['status'],
      where: { training_campaign_id: campaignId },
      orderBy: { status: 'asc' },
      _count: { _all: true },
      _avg: { progress_percent: true },
    });
    return { campaign, items, statusGroups, total };
  },
  async listMyAssessments(userId: string, query: ListMyAssessmentsQuery) {
    const where: Prisma.training_enrollmentsWhereInput = {
      user_id: userId,
      status: { not: 'withdrawn' },
      training_campaigns: { training_courses: { quizzes: { some: {} } } },
    };
    const [total, items] = await prisma.$transaction([
      prisma.training_enrollments.count({ where }),
      prisma.training_enrollments.findMany({
        where,
        select: {
          training_enrollment_id: true,
          status: true,
          progress_percent: true,
          training_campaigns: {
            select: {
              title: true,
              start_date: true,
              due_date: true,
              training_courses: {
                select: {
                  title: true,
                  description: true,
                  quizzes: {
                    orderBy: [{ created_at: 'desc' }, { quiz_id: 'desc' }],
                    take: 1,
                    select: {
                      quiz_id: true,
                      title: true,
                      passing_score: true,
                      max_attempts: true,
                      quiz_attempts: {
                        where: { user_id: userId, submitted_at: { not: null } },
                        select: {
                          quiz_attempt_id: true,
                          score: true,
                          passed: true,
                          submitted_at: true,
                        },
                        orderBy: { submitted_at: 'desc' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: [{ training_campaigns: { due_date: 'asc' } }, { training_enrollment_id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return { items, total };
  },
  getMyAssessment(enrollmentId: string, userId: string) {
    return prisma.training_enrollments.findFirst({
      where: {
        training_enrollment_id: enrollmentId,
        user_id: userId,
        status: { not: 'withdrawn' },
      },
      select: {
        training_enrollment_id: true,
        training_campaigns: {
          select: {
            title: true,
            start_date: true,
            due_date: true,
            training_courses: {
              select: {
                title: true,
                quizzes: {
                  orderBy: [{ created_at: 'desc' }, { quiz_id: 'desc' }],
                  take: 1,
                  select: {
                    quiz_id: true,
                    title: true,
                    passing_score: true,
                    max_attempts: true,
                    quiz_questions: {
                      orderBy: [{ display_order: 'asc' }, { quiz_question_id: 'asc' }],
                      select: {
                        quiz_question_id: true,
                        question_text: true,
                        question_type: true,
                        score: true,
                        quiz_options: {
                          orderBy: [{ display_order: 'asc' }, { quiz_option_id: 'asc' }],
                          select: { quiz_option_id: true, option_text: true },
                        },
                      },
                    },
                    quiz_attempts: {
                      where: { user_id: userId, submitted_at: { not: null } },
                      select: {
                        quiz_attempt_id: true,
                        score: true,
                        passed: true,
                        submitted_at: true,
                      },
                      orderBy: { submitted_at: 'desc' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
  },
  submitAssessment(enrollmentId: string, input: SubmitAssessmentBody, context: RequestContext) {
    return prisma.$transaction(
      async (transaction) => {
        const enrollment = await transaction.training_enrollments.findFirst({
          where: {
            training_enrollment_id: enrollmentId,
            user_id: context.actorUserId,
            status: { not: 'withdrawn' },
          },
          select: {
            training_enrollment_id: true,
            started_at: true,
            training_campaigns: {
              select: {
                start_date: true,
                due_date: true,
                training_courses: {
                  select: {
                    quizzes: {
                      orderBy: [{ created_at: 'desc' }, { quiz_id: 'desc' }],
                      take: 1,
                      select: {
                        quiz_id: true,
                        passing_score: true,
                        max_attempts: true,
                        quiz_questions: {
                          select: {
                            quiz_question_id: true,
                            score: true,
                            quiz_options: {
                              select: { quiz_option_id: true, is_correct: true },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        });
        const quiz = enrollment?.training_campaigns.training_courses.quizzes[0];
        if (!enrollment || !quiz) return { kind: 'not_found' as const };

        const now = new Date();
        const dueBoundary = new Date(enrollment.training_campaigns.due_date);
        dueBoundary.setUTCDate(dueBoundary.getUTCDate() + 1);
        if (now < enrollment.training_campaigns.start_date || now >= dueBoundary)
          return { kind: 'not_available' as const };

        const previousAttempts = await transaction.quiz_attempts.findMany({
          where: {
            quiz_id: quiz.quiz_id,
            user_id: context.actorUserId,
            submitted_at: { not: null },
          },
          select: { passed: true },
        });
        const attemptsUsed = previousAttempts.length;
        if (previousAttempts.some((attempt) => attempt.passed))
          return { kind: 'already_passed' as const };
        if (attemptsUsed >= quiz.max_attempts) return { kind: 'attempt_limit' as const };

        const answerByQuestion = new Map(
          input.answers.map((answer) => [answer.questionId, answer]),
        );
        if (
          input.answers.length !== quiz.quiz_questions.length ||
          quiz.quiz_questions.some((question) => {
            const answer = answerByQuestion.get(question.quiz_question_id);
            return (
              !answer ||
              answer.optionIds.some(
                (optionId) =>
                  !question.quiz_options.some((option) => option.quiz_option_id === optionId),
              )
            );
          })
        ) {
          return { kind: 'invalid_answers' as const };
        }

        const totalPoints = quiz.quiz_questions.reduce(
          (sum, question) => sum + Number(question.score),
          0,
        );
        const scoredQuestions = quiz.quiz_questions.map((question) => {
          const answer = answerByQuestion.get(question.quiz_question_id);
          if (!answer) throw new Error('Validated assessment answer is missing');
          const correctOptionIds = question.quiz_options
            .filter((option) => option.is_correct)
            .map((option) => option.quiz_option_id);
          const isCorrect =
            answer.optionIds.length === correctOptionIds.length &&
            answer.optionIds.every((optionId) => correctOptionIds.includes(optionId));
          return { question, answer, isCorrect };
        });
        const answers = scoredQuestions.flatMap(({ question, answer, isCorrect }) =>
          answer.optionIds.map((optionId, index) => ({
            quiz_question_id: question.quiz_question_id,
            selected_quiz_option_id: optionId,
            is_correct: isCorrect,
            score_awarded: isCorrect && index === 0 ? question.score : 0,
          })),
        );
        const earnedPoints = scoredQuestions.reduce(
          (sum, item) => sum + (item.isCorrect ? Number(item.question.score) : 0),
          0,
        );
        const score = totalPoints > 0 ? Number(((earnedPoints / totalPoints) * 100).toFixed(2)) : 0;
        const passed = score >= Number(quiz.passing_score);
        const attempt = await transaction.quiz_attempts.create({
          data: {
            quiz_id: quiz.quiz_id,
            user_id: context.actorUserId,
            score,
            passed,
            started_at: now,
            submitted_at: now,
            quiz_answers: { create: answers },
          },
          select: { quiz_attempt_id: true, score: true, passed: true, submitted_at: true },
        });
        await transaction.training_enrollments.update({
          where: { training_enrollment_id: enrollment.training_enrollment_id },
          data: {
            status: passed ? 'completed' : 'in_progress',
            ...(passed ? { progress_percent: 100, completed_at: now } : {}),
            started_at: enrollment.started_at ?? now,
            last_accessed_at: now,
          },
        });
        await transaction.audit_logs.create({
          data: {
            actor_user_id: context.actorUserId,
            module: 'training-awareness',
            action: 'training_assessment.submitted',
            entity_type: 'quiz_attempt',
            entity_id: attempt.quiz_attempt_id,
            after_data: { enrollmentId, quizId: quiz.quiz_id, score, passed },
            ip_address: context.ipAddress,
            user_agent: context.userAgent,
          },
        });
        return {
          kind: 'submitted' as const,
          attempt,
          passingScore: Number(quiz.passing_score),
          attemptsUsed: attemptsUsed + 1,
          maxAttempts: quiz.max_attempts,
          correctCount: scoredQuestions.filter((item) => item.isCorrect).length,
          totalQuestions: scoredQuestions.length,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  },
  async listCourses(query: ListCoursesQuery): Promise<{ items: CourseRecord[]; total: number }> {
    const where: Prisma.training_coursesWhereInput = {
      ...(query.q ? { title: { contains: query.q, mode: 'insensitive' as const } } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const [total, items] = await prisma.$transaction([
      prisma.training_courses.count({ where }),
      prisma.training_courses.findMany({
        where,
        select: courseSelect,
        orderBy: [{ created_at: 'desc' }, { training_course_id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return { items, total };
  },
  createCourse(
    input: CreateCourseBody,
    context: RequestContext,
    uploads: readonly CourseUpload[] = [],
  ): Promise<CourseRecord> {
    return prisma.$transaction(
      async (transaction) => {
        const course = await transaction.training_courses.create({
          data: {
            title: input.title,
            description: input.description ?? null,
            content: input.content,
            status: input.status,
            created_by_user_id: context.actorUserId,
            ...(input.assessment
              ? {
                  quizzes: {
                    create: {
                      title: input.assessment.title,
                      passing_score: input.assessment.passingScore,
                      max_attempts: input.assessment.maxAttempts,
                      quiz_questions: {
                        create: input.assessment.questions.map((question, questionIndex) => ({
                          question_text: question.text,
                          question_type: question.type,
                          score: 1,
                          display_order: questionIndex + 1,
                          quiz_options: {
                            create: question.options.map((option, optionIndex) => ({
                              option_text: option.text,
                              is_correct: option.isCorrect,
                              display_order: optionIndex + 1,
                            })),
                          },
                        })),
                      },
                    },
                  },
                }
              : {}),
          },
          select: courseSelect,
        });

        for (const [lessonIndex, lesson] of (input.lessons ?? []).entries()) {
          const createdLesson = await transaction.training_lessons.create({
            data: {
              training_course_id: course.training_course_id,
              title: lesson.title,
              description: lesson.description ?? null,
              display_order: lessonIndex + 1,
              is_required: lesson.isRequired,
            },
            select: { training_lesson_id: true },
          });
          for (const [materialIndex, material] of lesson.materials.entries()) {
            const upload = uploads.find((item) => item.key === material.uploadKey);
            const file = upload
              ? await transaction.files.create({
                  data: {
                    original_name: upload.originalName,
                    storage_key: upload.storageKey,
                    mime_type: upload.mimeType,
                    size_bytes: upload.sizeBytes,
                    checksum: upload.checksum,
                    uploaded_by_user_id: context.actorUserId,
                  },
                  select: { file_id: true },
                })
              : undefined;
            await transaction.training_materials.create({
              data: {
                training_lesson_id: createdLesson.training_lesson_id,
                title: material.title,
                material_type: material.type,
                content: material.content ?? null,
                external_url: material.externalUrl ?? null,
                file_id: file?.file_id ?? null,
                display_order: materialIndex + 1,
              },
              select: { training_material_id: true },
            });
          }
          if (lesson.assessment) {
            await transaction.quizzes.create({
              data: {
                training_course_id: course.training_course_id,
                training_lesson_id: createdLesson.training_lesson_id,
                title: lesson.assessment.title,
                passing_score: lesson.assessment.passingScore,
                max_attempts: lesson.assessment.maxAttempts,
                quiz_questions: {
                  create: lesson.assessment.questions.map((question, index) => ({
                    question_text: question.text,
                    question_type: question.type,
                    score: 1,
                    display_order: index + 1,
                    quiz_options: {
                      create: question.options.map((option, optionIndex) => ({
                        option_text: option.text,
                        is_correct: option.isCorrect,
                        display_order: optionIndex + 1,
                      })),
                    },
                  })),
                },
              },
              select: { quiz_id: true },
            });
          }
        }
        await transaction.audit_logs.create({
          data: {
            actor_user_id: context.actorUserId,
            module: 'training-awareness',
            action: 'training_course.created',
            entity_type: 'training_course',
            entity_id: course.training_course_id,
            after_data: {
              title: course.title,
              status: course.status,
              assessmentCreated: Boolean(input.assessment),
              lessonCount: input.lessons?.length ?? 0,
              uploadedFileCount: uploads.length,
              questionCount: input.assessment?.questions.length ?? 0,
            },
            ip_address: context.ipAddress,
            user_agent: context.userAgent,
          },
        });
        return course;
      },
      { timeout: 30000 },
    );
  },
  async listAssignmentOptions(query: AssignmentOptionsQuery) {
    const [users, departments] = await prisma.$transaction([
      prisma.users.findMany({
        where: {
          status: 'active',
          deleted_at: null,
          ...(query.userQ
            ? {
                OR: [
                  { full_name: { contains: query.userQ, mode: 'insensitive' } },
                  { email: { contains: query.userQ, mode: 'insensitive' } },
                  { employee_code: { contains: query.userQ, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        select: { user_id: true, full_name: true, email: true, department_id: true },
        orderBy: [{ full_name: 'asc' }, { email: 'asc' }],
        take: query.limit + 1,
      }),
      prisma.departments.findMany({
        where: {
          status: 'active',
          ...(query.departmentQ
            ? {
                OR: [
                  { name: { contains: query.departmentQ, mode: 'insensitive' } },
                  { code: { contains: query.departmentQ, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        select: { department_id: true, code: true, name: true },
        orderBy: { name: 'asc' },
        take: query.limit + 1,
      }),
    ]);
    return {
      users: users.slice(0, query.limit),
      departments: departments.slice(0, query.limit),
      hasMoreUsers: users.length > query.limit,
      hasMoreDepartments: departments.length > query.limit,
    };
  },
  getLatestCourseAssignment(courseId: string) {
    return prisma.training_campaigns.findFirst({
      where: { training_course_id: courseId },
      orderBy: [{ created_at: 'desc' }, { training_campaign_id: 'desc' }],
      select: {
        training_campaign_id: true,
        title: true,
        start_date: true,
        due_date: true,
        training_campaign_targets: {
          select: { user_id: true, department_id: true },
        },
      },
    });
  },
  async assignCourse(courseId: string, input: AssignCourseBody, context: RequestContext) {
    return prisma.$transaction(async (transaction) => {
      const course = await transaction.training_courses.findUnique({
        where: { training_course_id: courseId },
        select: { training_course_id: true, status: true },
      });
      if (!course || course.status === 'archived') return { kind: 'course_not_found' as const };
      if (course.status !== 'published') return { kind: 'course_not_published' as const };

      const uniqueUserIds = [...new Set(input.userIds)];
      const uniqueDepartmentIds = [...new Set(input.departmentIds)];
      const [users, departments] = await Promise.all([
        transaction.users.findMany({
          where: {
            status: 'active',
            deleted_at: null,
            OR: [
              ...(uniqueUserIds.length ? [{ user_id: { in: uniqueUserIds } }] : []),
              ...(uniqueDepartmentIds.length
                ? [{ department_id: { in: uniqueDepartmentIds } }]
                : []),
            ],
          },
          select: { user_id: true },
        }),
        transaction.departments.findMany({
          where: { department_id: { in: uniqueDepartmentIds }, status: 'active' },
          select: { department_id: true },
        }),
      ]);
      const resolvedUserIds = [...new Set(users.map((user) => user.user_id))];
      if (
        departments.length !== uniqueDepartmentIds.length ||
        uniqueUserIds.some((id) => !resolvedUserIds.includes(id))
      ) {
        return { kind: 'invalid_targets' as const };
      }

      const existingCampaign = input.createNewCampaign
        ? null
        : await transaction.training_campaigns.findFirst({
            where: { training_course_id: courseId },
            orderBy: [{ created_at: 'desc' }, { training_campaign_id: 'desc' }],
            select: { training_campaign_id: true },
          });
      if (existingCampaign && !input.changeReason) return { kind: 'reason_required' as const };
      if (!existingCampaign && !uniqueUserIds.length && !uniqueDepartmentIds.length)
        return { kind: 'invalid_targets' as const };
      if (existingCampaign) {
        await transaction.training_campaign_targets.deleteMany({
          where: { training_campaign_id: existingCampaign.training_campaign_id },
        });
      }
      const campaignData = {
        title: input.title,
        assigned_by_user_id: context.actorUserId,
        start_date: new Date(`${input.startDate}T00:00:00.000Z`),
        due_date: new Date(`${input.dueDate}T00:00:00.000Z`),
        training_campaign_targets: {
          create: [
            ...uniqueUserIds.map((userId) => ({ user_id: userId })),
            ...uniqueDepartmentIds.map((departmentId) => ({ department_id: departmentId })),
          ],
        },
      } satisfies Prisma.training_campaignsUncheckedUpdateInput;
      const campaign = existingCampaign
        ? await transaction.training_campaigns.update({
            where: { training_campaign_id: existingCampaign.training_campaign_id },
            data: campaignData,
            select: {
              training_campaign_id: true,
              title: true,
              start_date: true,
              due_date: true,
              created_at: true,
            },
          })
        : await transaction.training_campaigns.create({
            data: { training_course_id: courseId, ...campaignData },
            select: {
              training_campaign_id: true,
              title: true,
              start_date: true,
              due_date: true,
              created_at: true,
            },
          });
      let removedCount = 0;
      let retainedStartedCount = 0;
      let retainedCompletedCount = 0;
      if (existingCampaign) {
        const unselectedEnrollments = await transaction.training_enrollments.findMany({
          where: {
            training_campaign_id: campaign.training_campaign_id,
            user_id: { notIn: resolvedUserIds },
          },
          select: {
            training_enrollment_id: true,
            status: true,
            progress_percent: true,
            started_at: true,
            completed_at: true,
            last_accessed_at: true,
            training_certificates: { select: { training_certificate_id: true } },
          },
        });
        const removableIds = unselectedEnrollments
          .filter(
            (item) =>
              item.status === 'assigned' &&
              item.progress_percent === 0 &&
              !item.started_at &&
              !item.completed_at &&
              !item.last_accessed_at &&
              !item.training_certificates,
          )
          .map((item) => item.training_enrollment_id);
        const withdrawableIds = unselectedEnrollments
          .filter(
            (item) =>
              item.status !== 'completed' &&
              item.status !== 'withdrawn' &&
              !removableIds.includes(item.training_enrollment_id),
          )
          .map((item) => item.training_enrollment_id);
        removedCount = (
          await transaction.training_enrollments.deleteMany({
            where: { training_enrollment_id: { in: removableIds } },
          })
        ).count;
        retainedStartedCount = withdrawableIds.length;
        retainedCompletedCount = unselectedEnrollments.filter(
          (item) => item.status === 'completed',
        ).length;
      }
      await Promise.all(
        resolvedUserIds.map((userId) =>
          transaction.training_enrollments.upsert({
            where: {
              training_campaign_id_user_id: {
                training_campaign_id: campaign.training_campaign_id,
                user_id: userId,
              },
            },
            update: {},
            create: { training_campaign_id: campaign.training_campaign_id, user_id: userId },
          }),
        ),
      );
      await transaction.audit_logs.create({
        data: {
          actor_user_id: context.actorUserId,
          module: 'training-awareness',
          action: existingCampaign
            ? 'training_course.assignment_updated'
            : 'training_course.assigned',
          entity_type: 'training_campaign',
          entity_id: campaign.training_campaign_id,
          after_data: {
            courseId,
            userIds: uniqueUserIds,
            departmentIds: uniqueDepartmentIds,
            enrollmentCount: resolvedUserIds.length,
            removedCount,
            retainedStartedCount,
            retainedCompletedCount,
            changeReason: input.changeReason ?? null,
          },
          ip_address: context.ipAddress,
          user_agent: context.userAgent,
        },
      });
      return {
        kind: 'assigned' as const,
        campaign,
        enrollmentCount: resolvedUserIds.length,
        removedCount,
        retainedStartedCount,
        retainedCompletedCount,
      };
    });
  },
};
