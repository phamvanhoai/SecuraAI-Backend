export const acceptanceCostOpenApi = {
  type: 'object', nullable: true, additionalProperties: false,
  description: 'Required for Accept on create/update (except cancellation); null for other strategies. Both amounts are totals over the same comparison period in the same currency. No automatic approval or cost-ratio threshold.',
  required: ['costToFix', 'expectedLoss', 'currency', 'periodMonths', 'basis'],
  properties: {
    costToFix: { type: 'string', pattern: '^(0|[1-9][0-9]{0,11})(\\.[0-9]{1,2})?$', description: 'Total one-time and operating costs to remediate over periodMonths. Whole VND, up to 2 decimals for USD.' },
    expectedLoss: { type: 'string', pattern: '^(0|[1-9][0-9]{0,11})(\\.[0-9]{1,2})?$', description: 'Expected total loss if accepting over the same period; not a per-event impact or a guaranteed outcome.' },
    currency: { type: 'string', enum: ['VND', 'USD'] },
    periodMonths: { type: 'integer', minimum: 1, maximum: 120 },
    basis: { type: 'string', minLength: 10, maxLength: 2000, description: 'Estimation assumptions, scope, sources and reason for proposing acceptance.' },
  },
};

const action = {
  type: 'object', required: ['title', 'assignedToUserId', 'dueDate'],
  properties: { id: { type: 'string', format: 'uuid' }, title: { type: 'string', minLength: 3, maxLength: 255 }, description: { type: 'string', maxLength: 2000 }, assignedToUserId: { type: 'string', format: 'uuid' }, dueDate: { type: 'string', format: 'date' }, status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'cancelled'] } },
};
const properties = {
  title: { type: 'string', minLength: 3, maxLength: 255 },
  strategy: { type: 'string', enum: ['mitigate', 'avoid', 'transfer', 'accept'] },
  ownerUserId: { type: 'string', format: 'uuid' }, targetDate: { type: 'string', format: 'date' },
  controlIds: { type: 'array', maxItems: 100, uniqueItems: true, items: { type: 'string', format: 'uuid' } },
  actions: { type: 'array', maxItems: 100, items: action, description: 'Accept creates no actions. Update may retain cancelled historical actions; started/completed work cannot be silently removed. Other strategies require actions.' },
  acceptanceCost: acceptanceCostOpenApi,
};
export const createTreatmentPlanOpenApi = { type: 'object', additionalProperties: false,
  required: ['riskId', 'title', 'strategy', 'ownerUserId', 'targetDate', 'targetRisk', 'controlIds', 'actions'],
  properties: { ...properties, riskId: { type: 'string', format: 'uuid' }, targetRisk: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] } },
};
export const updateTreatmentPlanOpenApi = { type: 'object', additionalProperties: false,
  required: ['title', 'strategy', 'ownerUserId', 'targetDate', 'status', 'controlIds', 'actions', 'expectedUpdatedAt'],
  properties: { ...properties, status: { type: 'string', enum: ['draft', 'active', 'completed', 'cancelled'] }, expectedUpdatedAt: { type: 'string', format: 'date-time' } },
};
