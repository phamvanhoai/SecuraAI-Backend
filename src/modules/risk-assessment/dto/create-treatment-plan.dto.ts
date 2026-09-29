import { z } from 'zod';
const action = z.object({ title: z.string().trim().min(3).max(255), description: z.string().trim().max(2000).optional(), assignedToUserId: z.uuid(), dueDate: z.iso.date() });
export const createTreatmentPlanBodySchema = z.object({
  riskId: z.uuid(), title: z.string().trim().min(3).max(255), strategy: z.enum(['avoid', 'mitigate', 'transfer', 'accept']),
  ownerUserId: z.uuid(), targetDate: z.iso.date(), targetRisk: z.enum(['low', 'medium', 'high', 'critical']),
  controlIds: z.array(z.uuid()).min(1).max(100), actions: z.array(action).max(100),
}).strict().superRefine((value, context) => {
  if (value.strategy !== 'accept' && !value.actions.length) context.addIssue({ code: 'custom', path: ['actions'], message: 'Treatment actions are required' });
  value.actions.forEach((item, index) => { if (item.dueDate > value.targetDate) context.addIssue({ code: 'custom', path: ['actions', index, 'dueDate'], message: 'Action due date must not exceed plan target date' }); });
});
export const treatmentPlanOptionsQuerySchema = z.object({ q: z.string().trim().max(100).default(''), limit: z.coerce.number().int().min(1).max(100).default(100) });
export type CreateTreatmentPlanBody = z.infer<typeof createTreatmentPlanBodySchema>;
export type TreatmentPlanOptionsQuery = z.infer<typeof treatmentPlanOptionsQuerySchema>;
