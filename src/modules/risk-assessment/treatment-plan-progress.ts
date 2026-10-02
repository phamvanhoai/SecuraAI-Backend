type TreatmentActionProgressStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

const progressWeight: Record<Exclude<TreatmentActionProgressStatus, 'CANCELLED'>, number> = {
  PENDING: 0,
  IN_PROGRESS: 50,
  COMPLETED: 100,
};

export function calculateTreatmentPlanProgress(
  actions: ReadonlyArray<{ status: TreatmentActionProgressStatus }>,
): number {
  const includedActions = actions.filter((action) => action.status !== 'CANCELLED');
  if (includedActions.length === 0) return 0;

  const total = includedActions.reduce(
    (sum, action) => sum + progressWeight[action.status as keyof typeof progressWeight],
    0,
  );

  return Math.round(total / includedActions.length);
}
