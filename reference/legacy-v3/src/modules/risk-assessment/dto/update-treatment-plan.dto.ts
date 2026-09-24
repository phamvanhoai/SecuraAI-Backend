import { z } from 'zod';
import { treatmentPlanStrategies } from './list-treatment-plans-query.dto.js';

const text = (minimum: number, maximum: number) =>
  z.preprocess(
    (value) =>
      typeof value === 'string' ? value.normalize('NFKC').replace(/\s+/gu, ' ').trim() : value,
    z.string().min(minimum).max(maximum),
  );

const actionSchema = z.strictObject({
  id: z.uuid().optional(),
  title: text(3, 255),
  description: text(1, 2_000).optional(),
  assignedToUserId: z.uuid(),
  dueDate: z.iso.date(),
});

export const updateTreatmentPlanBodySchema = z
  .strictObject({
    expectedUpdatedAt: z.iso.datetime({ offset: true }),
    strategy: z.enum(treatmentPlanStrategies),
    description: text(10, 5_000),
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
    const ids = new Set<string>();
    actions.forEach((action, index) => {
      const title = action.title.toLocaleLowerCase('en-US');
      if (titles.has(title))
        context.addIssue({ code: 'custom', path: ['actions', index, 'title'], message: 'Action titles must be unique' });
      titles.add(title);
      if (action.id) {
        if (ids.has(action.id))
          context.addIssue({ code: 'custom', path: ['actions', index, 'id'], message: 'Action identifiers must be unique' });
        ids.add(action.id);
      }
      if (action.dueDate > targetDate)
        context.addIssue({ code: 'custom', path: ['actions', index, 'dueDate'], message: 'Action due date must be on or before the target date' });
    });
  });

export type UpdateTreatmentPlanBody = z.infer<typeof updateTreatmentPlanBodySchema>;
