import { z } from 'zod';

const action = z.object({
  id: z.uuid().optional(),
  title: z.string().trim().min(3).max(255),
  assignedToUserId: z.uuid(),
  dueDate: z.iso.date(),
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']),
});
export const updateTreatmentPlanParamsSchema = z.object({ treatmentPlanId: z.uuid() });
export const updateTreatmentPlanBodySchema = z.object({
  title: z.string().trim().min(3).max(255),
  strategy: z.enum(['avoid', 'mitigate', 'transfer', 'accept']),
  ownerUserId: z.uuid(),
  targetDate: z.iso.date(),
  status: z.enum(['draft', 'active', 'completed', 'cancelled']),
  actions: z.array(action).max(100),
  expectedUpdatedAt: z.iso.datetime({ offset: true }),
}).strict().superRefine((value, context) => {
  if (value.strategy !== 'accept' && !value.actions.length) context.addIssue({ code: 'custom', path: ['actions'], message: 'Treatment actions are required' });
  value.actions.forEach((item, index) => { if (item.dueDate > value.targetDate) context.addIssue({ code: 'custom', path: ['actions', index, 'dueDate'], message: 'Action due date must not exceed plan target date' }); });
});
export type UpdateTreatmentPlanBody = z.infer<typeof updateTreatmentPlanBodySchema>;
