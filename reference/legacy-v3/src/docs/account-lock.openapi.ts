const operation = (action: 'lock' | 'unlock') => ({
  tags: ['Users'],
  summary: action === 'lock' ? 'Lock a user account (UC7)' : 'Unlock a user account (UC7)',
  description: `Requires the ADMIN role and users.${action}. Non-admins are forbidden even when granted this permission. The current ADMIN membership and permission are rechecked in the database. Only active/locked accounts qualify; inactive, disabled and deleted accounts cannot be reactivated here. Self-management is forbidden and the last active administrator with both account-management permissions cannot be locked. Requires a reason. Revokes refresh sessions and pending MFA challenges and writes an audit atomically. Repeated requests return changed=false without duplicate audit. Unlock requires a fresh login; old access tokens remain invalid. lastLockedAt preserves the last lock time. Also available under /admin/users/{userId}/${action}.`,
  security: [{ bearerAuth: [] }],
  parameters: [
    { name: 'userId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
  ],
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['reason'],
          properties: {
            reason: {
              type: 'string',
              minLength: 10,
              maxLength: 1000,
              example: 'Account temporarily locked during security investigation',
            },
          },
        },
      },
    },
  },
  responses: {
    '200': {
      description: 'Account state and whether it changed',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['success', 'data'],
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                required: ['id', 'status', 'lastLockedAt', 'updatedAt', 'changed'],
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  status: { type: 'string', enum: ['active', 'locked'] },
                  lastLockedAt: { type: 'string', format: 'date-time', nullable: true },
                  updatedAt: { type: 'string', format: 'date-time' },
                  changed: { type: 'boolean' },
                },
              },
            },
          },
        },
      },
    },
    '401': { description: 'Missing/invalid token or revoked account access' },
    '403': { description: 'Missing ADMIN role or permission, inactive actor, or self-management' },
    '404': { description: 'Account is missing or deleted' },
    '409': { description: 'Ineligible account state, last account manager, or concurrent change' },
    '422': { description: 'Invalid UUID, missing/invalid reason, or unknown body fields' },
    '500': { description: 'Unexpected failure; transaction is rolled back' },
  },
});

export const accountLockPaths = {
  '/users/{userId}/lock': { post: operation('lock') },
  '/users/{userId}/unlock': { post: operation('unlock') },
  '/admin/users/{userId}/lock': { post: operation('lock') },
  '/admin/users/{userId}/unlock': { post: operation('unlock') },
};
