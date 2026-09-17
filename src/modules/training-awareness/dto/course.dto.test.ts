import { describe, expect, it } from 'vitest';
import { assignmentOptionsQuerySchema, assignCourseBodySchema } from './course.dto.js';

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
