import { describe, expect, it } from 'vitest';
import { assignCourseBodySchema } from './course.dto.js';

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
