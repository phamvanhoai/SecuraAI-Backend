import { AppError } from '../../common/errors/app-error.js';
import { trainingAwarenessRepository, type CourseRecord } from './training-awareness.repository.js';
import type {
  AssignCourseBody,
  AssignmentOptionsQuery,
  CreateCourseBody,
  ListCoursesQuery,
} from './dto/course.dto.js';
import type { ListMyAssessmentsQuery, SubmitAssessmentBody } from './dto/assessment.dto.js';

type Actor = { userId: string; permissions: readonly string[] };
type RequestContext = { ipAddress: string | null; userAgent: string | null };

const toCourseResponse = (course: CourseRecord) => ({
  id: course.training_course_id,
  title: course.title,
  description: course.description,
  content: course.content,
  status: course.status,
  createdByUserId: course.created_by_user_id,
  createdAt: course.created_at,
  updatedAt: course.updated_at,
});

const assessmentAvailability = (
  startDate: Date,
  dueDate: Date,
  passed: boolean,
  attemptsUsed: number,
  maxAttempts: number,
) => {
  const now = new Date();
  const dueBoundary = new Date(dueDate);
  dueBoundary.setUTCDate(dueBoundary.getUTCDate() + 1);
  if (passed) return 'passed' as const;
  if (attemptsUsed >= maxAttempts) return 'attempts_exhausted' as const;
  if (now < startDate) return 'upcoming' as const;
  if (now >= dueBoundary) return 'overdue' as const;
  return 'available' as const;
};

export const trainingAwarenessService = {
  async listMyAssessments(query: ListMyAssessmentsQuery, actor: Actor) {
    if (!actor.permissions.includes('training-assessments.take'))
      throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
    const result = await trainingAwarenessRepository.listMyAssessments(actor.userId, query);
    return {
      items: result.items.map((enrollment) => {
        const quiz = enrollment.training_campaigns.training_courses.quizzes[0];
        if (!quiz) throw new Error('Assessment query returned an enrollment without a quiz');
        const latestAttempt = quiz.quiz_attempts[0];
        const passed = quiz.quiz_attempts.some((attempt) => attempt.passed);
        return {
          enrollmentId: enrollment.training_enrollment_id,
          courseTitle: enrollment.training_campaigns.training_courses.title,
          courseDescription: enrollment.training_campaigns.training_courses.description,
          campaignTitle: enrollment.training_campaigns.title,
          startDate: enrollment.training_campaigns.start_date,
          dueDate: enrollment.training_campaigns.due_date,
          enrollmentStatus: enrollment.status,
          progressPercent: enrollment.progress_percent,
          assessment: {
            id: quiz.quiz_id,
            title: quiz.title,
            passingScore: Number(quiz.passing_score),
            maxAttempts: quiz.max_attempts,
            attemptsUsed: quiz.quiz_attempts.length,
            latestScore:
              latestAttempt?.score === null || latestAttempt?.score === undefined
                ? null
                : Number(latestAttempt.score),
            passed,
            lastSubmittedAt: latestAttempt?.submitted_at ?? null,
            availability: assessmentAvailability(
              enrollment.training_campaigns.start_date,
              enrollment.training_campaigns.due_date,
              passed,
              quiz.quiz_attempts.length,
              quiz.max_attempts,
            ),
          },
        };
      }),
      pagination: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / query.limit),
      },
    };
  },
  async getMyAssessment(enrollmentId: string, actor: Actor) {
    if (!actor.permissions.includes('training-assessments.take'))
      throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
    const enrollment = await trainingAwarenessRepository.getMyAssessment(
      enrollmentId,
      actor.userId,
    );
    const quiz = enrollment?.training_campaigns.training_courses.quizzes[0];
    if (!enrollment || !quiz)
      throw new AppError(404, 'ASSESSMENT_NOT_FOUND', 'Assessment not found');
    return {
      enrollmentId: enrollment.training_enrollment_id,
      courseTitle: enrollment.training_campaigns.training_courses.title,
      campaignTitle: enrollment.training_campaigns.title,
      dueDate: enrollment.training_campaigns.due_date,
      assessment: {
        id: quiz.quiz_id,
        title: quiz.title,
        passingScore: Number(quiz.passing_score),
        maxAttempts: quiz.max_attempts,
        attemptsUsed: quiz.quiz_attempts.length,
        availability: assessmentAvailability(
          enrollment.training_campaigns.start_date,
          enrollment.training_campaigns.due_date,
          quiz.quiz_attempts.some((attempt) => attempt.passed),
          quiz.quiz_attempts.length,
          quiz.max_attempts,
        ),
        attempts: quiz.quiz_attempts.map((attempt) => ({
          id: attempt.quiz_attempt_id,
          score: attempt.score === null ? null : Number(attempt.score),
          passed: attempt.passed ?? false,
          submittedAt: attempt.submitted_at,
        })),
        questions: quiz.quiz_questions.map((question) => ({
          id: question.quiz_question_id,
          text: question.question_text,
          type: question.question_type,
          points: Number(question.score),
          options: question.quiz_options.map((option) => ({
            id: option.quiz_option_id,
            text: option.option_text,
          })),
        })),
      },
    };
  },
  async submitMyAssessment(
    enrollmentId: string,
    input: SubmitAssessmentBody,
    actor: Actor,
    context: RequestContext,
  ) {
    if (!actor.permissions.includes('training-assessments.take'))
      throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
    const result = await trainingAwarenessRepository.submitAssessment(enrollmentId, input, {
      actorUserId: actor.userId,
      ...context,
    });
    if (result.kind === 'not_found')
      throw new AppError(404, 'ASSESSMENT_NOT_FOUND', 'Assessment not found');
    if (result.kind === 'attempt_limit')
      throw new AppError(409, 'ASSESSMENT_ATTEMPT_LIMIT_REACHED', 'No assessment attempts remain');
    if (result.kind === 'not_available')
      throw new AppError(
        409,
        'ASSESSMENT_NOT_AVAILABLE',
        'Assessment is outside its availability period',
      );
    if (result.kind === 'already_passed')
      throw new AppError(409, 'ASSESSMENT_ALREADY_PASSED', 'Assessment has already been passed');
    if (result.kind === 'invalid_answers')
      throw new AppError(422, 'INVALID_ASSESSMENT_ANSWERS', 'Answer every assessment question');
    return {
      attemptId: result.attempt.quiz_attempt_id,
      score: Number(result.attempt.score),
      passed: result.attempt.passed ?? false,
      submittedAt: result.attempt.submitted_at,
      passingScore: result.passingScore,
      attemptsUsed: result.attemptsUsed,
      maxAttempts: result.maxAttempts,
      correctCount: result.correctCount,
      totalQuestions: result.totalQuestions,
    };
  },
  async listCourses(query: ListCoursesQuery, actor: Actor) {
    if (!actor.permissions.includes('training-courses.read'))
      throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
    const result = await trainingAwarenessRepository.listCourses(query);
    return {
      items: result.items.map(toCourseResponse),
      pagination: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / query.limit),
      },
    };
  },
  async createCourse(input: CreateCourseBody, actor: Actor, context: RequestContext) {
    if (!actor.permissions.includes('training-courses.create'))
      throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
    const course = await trainingAwarenessRepository.createCourse(input, {
      actorUserId: actor.userId,
      ...context,
    });
    return toCourseResponse(course);
  },
  async listAssignmentOptions(query: AssignmentOptionsQuery, actor: Actor) {
    if (!actor.permissions.includes('training-courses.assign'))
      throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
    const result = await trainingAwarenessRepository.listAssignmentOptions(query);
    return {
      users: result.users.map((user) => ({
        id: user.user_id,
        name: user.full_name,
        email: user.email,
        departmentId: user.department_id,
      })),
      departments: result.departments.map((department) => ({
        id: department.department_id,
        code: department.code,
        name: department.name,
      })),
      hasMore: {
        users: result.hasMoreUsers,
        departments: result.hasMoreDepartments,
      },
    };
  },
  async assignCourse(
    courseId: string,
    input: AssignCourseBody,
    actor: Actor,
    context: RequestContext,
  ) {
    if (!actor.permissions.includes('training-courses.assign'))
      throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
    const result = await trainingAwarenessRepository.assignCourse(courseId, input, {
      actorUserId: actor.userId,
      ...context,
    });
    if (result.kind === 'course_not_found')
      throw new AppError(404, 'COURSE_NOT_FOUND', 'Course not found');
    if (result.kind === 'invalid_targets')
      throw new AppError(
        422,
        'INVALID_ASSIGNMENT_TARGETS',
        'One or more assignment targets are unavailable',
      );
    return {
      id: result.campaign.training_campaign_id,
      title: result.campaign.title,
      startDate: result.campaign.start_date,
      dueDate: result.campaign.due_date,
      enrollmentCount: result.enrollmentCount,
      createdAt: result.campaign.created_at,
    };
  },
};
