import { z } from 'zod';

// Decimal strings preserve the exact amount across JSON and PostgreSQL.
const amount = z.string().regex(/^(0|[1-9]\d{0,11})(\.\d{1,2})?$/, 'Enter a non-negative amount with at most 12 digits and 2 decimal places');
export const acceptanceCostSchema = z.object({
  costToFix: amount,
  expectedLoss: amount,
  currency: z.enum(['VND', 'USD']),
  periodMonths: z.number().int().min(1).max(120),
  basis: z.string().trim().min(10).max(2000),
}).strict().superRefine((value, context) => {
  if (value.currency === 'VND') {
    for (const key of ['costToFix', 'expectedLoss'] as const) {
      if (Number(value[key]) % 1 !== 0) context.addIssue({ code: 'custom', path: [key], message: 'VND amounts must be whole numbers' });
    }
  }
});

export function readAcceptanceCost(value: unknown): z.infer<typeof acceptanceCostSchema> | null {
  const result = acceptanceCostSchema.safeParse(value);
  return result.success ? result.data : null;
}

export function validateAcceptanceCost(value: {
  strategy: string;
  acceptanceCost?: z.infer<typeof acceptanceCostSchema> | null | undefined;
  status?: string | undefined;
  actions: Array<{ title: string; status?: string | undefined }>;
}, context: z.RefinementCtx): void {
  if (value.strategy === 'accept') {
    if (!value.acceptanceCost && value.status !== 'cancelled') context.addIssue({ code: 'custom', path: ['acceptanceCost'], message: 'Accept requires cost to fix, expected loss, currency, comparison period and estimation basis' });
    if (value.status !== 'cancelled' && value.actions.some((action) => action.status !== 'cancelled')) context.addIssue({ code: 'custom', path: ['actions'], message: 'Accept has no additional treatment actions. Cancel existing work explicitly or use another strategy.' });
  } else if (value.acceptanceCost) {
    context.addIssue({ code: 'custom', path: ['acceptanceCost'], message: 'Acceptance cost justification applies only to Accept' });
  }
}
