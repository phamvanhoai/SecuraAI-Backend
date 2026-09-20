import { describe, expect, it } from 'vitest';
import {
  assignmentOptionsQuerySchema,
  assignCourseBodySchema,
  createCourseBodySchema,
  updateCourseDraftBodySchema,
} from './course.dto.js';

describe('createCourseBodySchema', () => {
  const course = {
    title: 'Phishing awareness',
    description: null,
    content: 'Learn how to identify suspicious messages.',
    assessment: {
      title: 'Phishing assessment',
      passingScore: 80,
      maxAttempts: 3,
      questions: [
        {
          type: 'single_choice',
          text: 'Which message is suspicious?',
          options: [
            { text: 'Unexpected password reset link', isCorrect: true },
            { text: 'Expected internal notice', isCorrect: false },
          ],
        },
      ],
    },
  };

  it('accepts a course with a valid post-training assessment', () => {
    expect(createCourseBodySchema.safeParse(course).success).toBe(true);
  });

  it('requires exactly one correct answer per question', () => {
    const invalid = structuredClone(course);
    invalid.assessment.questions[0]!.options[1]!.isCorrect = true;
    expect(createCourseBodySchema.safeParse(invalid).success).toBe(false);
  });

  it('accepts multiple-answer questions with at least two correct answers', () => {
    const multiple = structuredClone(course);
    multiple.assessment.questions[0]!.type = 'multiple_choice';
    multiple.assessment.questions[0]!.options[1]!.isCorrect = true;
    expect(createCourseBodySchema.safeParse(multiple).success).toBe(true);
  });

  it('does not publish a course without an assessment', () => {
    expect(
      createCourseBodySchema.safeParse({
        title: 'Incomplete course',
        description: null,
        content: 'Content without a completion assessment.',
        status: 'published',
      }).success,
    ).toBe(false);
  });
});

describe('updateCourseDraftBodySchema', () => {
  const draft = {
    title: 'Phishing awareness',
    description: null,
    content: 'Learn how to identify suspicious messages.',
    expectedUpdatedAt: '2026-09-19T08:00:00.000Z',
    lessons: [
      {
        title: 'Suspicious messages',
        isRequired: true,
        materials: [
          {
            title: 'Existing video',
            type: 'video',
            existingFileId: 'e2ef8324-9ac0-4e7f-b16d-50050274a72e',
          },
        ],
      },
    ],
  };

  it('accepts an existing private file from the same draft', () => {
    expect(updateCourseDraftBodySchema.safeParse(draft).success).toBe(true);
  });

  it('requires optimistic concurrency and exactly one material source', () => {
    expect(
      updateCourseDraftBodySchema.safeParse({ ...draft, expectedUpdatedAt: undefined }).success,
    ).toBe(false);
    const invalid = {
      ...draft,
      lessons: [
        {
          ...draft.lessons[0]!,
          materials: [
            {
              ...draft.lessons[0]!.materials[0]!,
              externalUrl: 'https://example.com/video.mp4',
            },
          ],
        },
      ],
    };
    expect(updateCourseDraftBodySchema.safeParse(invalid).success).toBe(false);
  });
});

describe('assignmentOptionsQuerySchema', () => {
  it('bounds and trims target searches', () => {
    expect(assignmentOptionsQuerySchema.parse({ userQ: '  alice  ', limit: '20' })).toEqual({
      userQ: 'alice',
      departmentQ: '',
      limit: 20,
    });
    expect(assignmentOptionsQuerySchema.safeParse({ limit: 51 }).success).toBe(false);
  });
});

describe('assignCourseBodySchema', () => {
  it('accepts assignments to users or departments', () => {
    const result = assignCourseBodySchema.safeParse({
      title: 'Quarterly awareness',
      startDate: '2026-09-15',
      dueDate: '2026-09-30',
      userIds: ['e2ef8324-9ac0-4e7f-b16d-50050274a72e'],
      departmentIds: [],
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.createNewCampaign).toBe(false);
  });

  it('accepts an explicit request to create a separate campaign', () => {
    const result = assignCourseBodySchema.parse({
      title: 'Annual refresher',
      startDate: '2027-09-15',
      dueDate: '2027-09-30',
      userIds: ['e2ef8324-9ac0-4e7f-b16d-50050274a72e'],
      departmentIds: [],
      createNewCampaign: true,
    });
    expect(result.createNewCampaign).toBe(true);
  });

  it('rejects assignments without targets', () => {
    const result = assignCourseBodySchema.safeParse({
      title: 'Quarterly awareness',
      startDate: '2026-09-15',
      dueDate: '2026-09-30',
      userIds: [],
      departmentIds: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a due date before the start date', () => {
    const result = assignCourseBodySchema.safeParse({
      title: 'Quarterly awareness',
      startDate: '2026-09-30',
      dueDate: '2026-09-15',
      userIds: [],
      departmentIds: ['04b05b31-6356-4c91-9976-b16b82a04e41'],
    });
    expect(result.success).toBe(false);
  });
});
