import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const employeeRole = await prisma.roles.findUnique({
    where: { code: 'EMPLOYEE' },
    select: { role_id: true },
  });
  if (!employeeRole) throw new Error('EMPLOYEE role must exist before seeding UC77');

  const employeeAssignments = await prisma.user_roles.findMany({
    where: { role_id: employeeRole.role_id },
    select: { user_id: true },
    orderBy: { assigned_at: 'asc' },
  });
  if (employeeAssignments.length === 0)
    throw new Error('An Employee account is required to seed UC77');

  const result = await prisma.$transaction(async (transaction) => {
    const permission = await transaction.permissions.upsert({
      where: { code: 'training-assessments.take' },
      update: {
        module: 'training-awareness',
        action: 'take-assessment',
        description: 'Take assigned post-training assessments',
      },
      create: {
        code: 'training-assessments.take',
        module: 'training-awareness',
        action: 'take-assessment',
        description: 'Take assigned post-training assessments',
      },
    });
    await transaction.role_permissions.upsert({
      where: {
        role_id_permission_id: {
          role_id: employeeRole.role_id,
          permission_id: permission.permission_id,
        },
      },
      update: {},
      create: {
        role_id: employeeRole.role_id,
        permission_id: permission.permission_id,
      },
    });

    const existingCourse = await transaction.training_courses.findFirst({
      where: { title: '[Sample] Phishing Awareness Essentials' },
      select: { training_course_id: true },
    });
    const course = existingCourse
      ? await transaction.training_courses.update({
          where: { training_course_id: existingCourse.training_course_id },
          data: { status: 'published' },
          select: { training_course_id: true },
        })
      : await transaction.training_courses.create({
          data: {
            title: '[Sample] Phishing Awareness Essentials',
            description: 'Recognize phishing indicators and report suspicious messages safely.',
            content:
              'Review sender identity, inspect links before opening them, never share credentials, and report suspicious messages through the approved security channel.',
            status: 'published',
          },
          select: { training_course_id: true },
        });

    let quiz = await transaction.quizzes.findFirst({
      where: {
        training_course_id: course.training_course_id,
        title: 'Phishing awareness post-training assessment',
      },
      select: { quiz_id: true },
    });
    if (!quiz) {
      quiz = await transaction.quizzes.create({
        data: {
          training_course_id: course.training_course_id,
          title: 'Phishing awareness post-training assessment',
          passing_score: 70,
          max_attempts: 3,
          quiz_questions: {
            create: [
              {
                question_text:
                  'What should you do first when an unexpected email asks you to sign in?',
                question_type: 'single_choice',
                score: 1,
                display_order: 1,
                quiz_options: {
                  create: [
                    {
                      option_text: 'Open the link immediately',
                      is_correct: false,
                      display_order: 1,
                    },
                    {
                      option_text: 'Verify the sender and destination independently',
                      is_correct: true,
                      display_order: 2,
                    },
                    {
                      option_text: 'Forward it to colleagues',
                      is_correct: false,
                      display_order: 3,
                    },
                  ],
                },
              },
              {
                question_text: 'Which details can indicate a phishing message?',
                question_type: 'multiple_choice',
                score: 2,
                display_order: 2,
                quiz_options: {
                  create: [
                    {
                      option_text: 'A mismatched destination URL',
                      is_correct: true,
                      display_order: 1,
                    },
                    { option_text: 'Unexpected urgency', is_correct: true, display_order: 2 },
                    {
                      option_text: 'A verified internal request you expected',
                      is_correct: false,
                      display_order: 3,
                    },
                  ],
                },
              },
              {
                question_text:
                  'You should report a suspicious message through the approved security channel.',
                question_type: 'true_false',
                score: 1,
                display_order: 3,
                quiz_options: {
                  create: [
                    { option_text: 'True', is_correct: true, display_order: 1 },
                    { option_text: 'False', is_correct: false, display_order: 2 },
                  ],
                },
              },
            ],
          },
        },
        select: { quiz_id: true },
      });
    }

    const seededCampaignTitle = '[Sample] Employee phishing awareness campaign';
    let campaign = await transaction.training_campaigns.findFirst({
      where: {
        training_course_id: course.training_course_id,
        title: seededCampaignTitle,
      },
      select: { training_campaign_id: true },
    });
    if (!campaign) {
      campaign = await transaction.training_campaigns.findFirst({
        where: { training_course_id: course.training_course_id },
        orderBy: [{ created_at: 'asc' }, { training_campaign_id: 'asc' }],
        select: { training_campaign_id: true },
      });
    }
    if (!campaign) {
      campaign = await transaction.training_campaigns.create({
        data: {
          training_course_id: course.training_course_id,
          title: seededCampaignTitle,
          start_date: new Date('2026-09-01T00:00:00.000Z'),
          due_date: new Date('2026-12-31T00:00:00.000Z'),
        },
        select: { training_campaign_id: true },
      });
    }
    const enrollments = await Promise.all(
      employeeAssignments.map((assignment) =>
        transaction.training_enrollments.upsert({
          where: {
            training_campaign_id_user_id: {
              training_campaign_id: campaign.training_campaign_id,
              user_id: assignment.user_id,
            },
          },
          update: {},
          create: {
            training_campaign_id: campaign.training_campaign_id,
            user_id: assignment.user_id,
          },
          select: { training_enrollment_id: true },
        }),
      ),
    );
    return {
      quizId: quiz.quiz_id,
      enrollmentIds: enrollments.map((enrollment) => enrollment.training_enrollment_id),
    };
  });

  console.log(`UC77 sample ready for ${result.enrollmentIds.length} employees (${result.quizId})`);
}

main()
  .finally(() => prisma.$disconnect())
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
