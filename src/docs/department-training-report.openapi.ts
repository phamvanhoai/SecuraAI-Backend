export const departmentTrainingReportPaths = {
  '/training/department-report': {
    get: {
      tags: ['Training Awareness'],
      summary: 'View department training completion report (UC81)',
      description:
        'Requires training-department-reports.read (Executive/Admin by default). Groups enrollments by the current user department, including No department. Counts assignments separately across campaigns; employees are distinct users. Withdrawn enrollments are excluded. Completion means enrollment status completed; overdue means incomplete with due date before today UTC. Includes departments with zero assignments. Summary is organization-wide and independent of search/pagination.',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'page',
          in: 'query',
          schema: { type: 'integer', minimum: 1, maximum: 100000, default: 1 },
        },
        {
          name: 'limit',
          in: 'query',
          schema: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
        },
        { name: 'q', in: 'query', schema: { type: 'string', maxLength: 100 } },
      ],
      responses: {
        '200': {
          description:
            '{ success: true, data: { items: [{ id, name, code, employees, assigned, completed, overdue, completionRate }], summary: { employees, assigned, completed, overdue, completionRate }, pagination: { page, limit, total, totalPages } } }',
        },
        '422': { description: 'Invalid query parameters' },
        '401': { description: 'Authentication required' },
        '403': { description: 'Missing training-department-reports.read permission' },
      },
    },
  },
};
