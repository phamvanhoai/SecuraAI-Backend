import { z } from 'zod';
import { treatmentPlanStrategies } from './list-treatment-plans-query.dto.js';

const normalizedText = (minimum: number, maximum: number) =>
  z.preprocess(
    (value) =>
      typeof value === 'string' ? value.normalize('NFKC').replace(/\s+/gu, ' ').trim() : value,
    z.string().min(minimum).max(maximum),
  );

const actionSchema = z.strictObject({
  title: normalizedText(3, 255),
  description: normalizedText(1, 2_000).optional(),
  assignedToUserId: z.uuid(),
  dueDate: z.iso.date(),
});

export const createTreatmentPlanBodySchema = z
  .strictObject({
    riskAssessmentId: z.uuid(),
    expectedRiskUpdatedAt: z.iso.datetime({ offset: true }),
    strategy: z.enum(treatmentPlanStrategies),
    description: normalizedText(10, 5_000),
    ownerUserId: z.uuid(),
    targetDate: z.iso.date(),
    actions: z.array(actionSchema).max(100),
  })
  .superRefine(({ strategy, actions, targetDate }, context) => {
    if (strategy !== 'accept' && actions.length === 0)
      context.addIssue({
        code: 'custom',
        path: ['actions'],
        message: 'This treatment strategy requires at least one action',
      });
    const titles = new Set<string>();
    actions.forEach((action, index) => {
      const key = action.title.toLocaleLowerCase('en-US');
      if (titles.has(key))
        context.addIssue({
          code: 'custom',
          path: ['actions', index, 'title'],
          message: 'Action titles must be unique within the plan',
        });
      titles.add(key);
      if (action.dueDate > targetDate)
        context.addIssue({
          code: 'custom',
          path: ['actions', index, 'dueDate'],
          message: 'Action due date must be on or before the plan target date',
        });
    });
  });

export const treatmentPlanCreateOptionsQuerySchema = z.strictObject({
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type CreateTreatmentPlanBody = z.infer<typeof createTreatmentPlanBodySchema>;
export type TreatmentPlanCreateOptionsQuery = z.infer<
  typeof treatmentPlanCreateOptionsQuerySchema
>;
