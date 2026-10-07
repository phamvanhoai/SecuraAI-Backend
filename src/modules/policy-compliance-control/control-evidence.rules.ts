import type { Prisma } from '@prisma/client';

export function usableControlEvidenceWhere(now: Date): Prisma.evidence_itemsWhereInput {
  return {
    status: 'ACTIVE',
    collected_at: { lte: now },
    AND: [
      { OR: [{ valid_from: null }, { valid_from: { lte: now } }] },
      { OR: [{ valid_until: null }, { valid_until: { gt: now } }] },
    ],
  };
}
export function isControlEvidenceUsable(
  item: { collected_at: Date; valid_from: Date | null; valid_until: Date | null },
  now: Date,
): boolean {
  return (
    item.collected_at <= now &&
    (!item.valid_from || item.valid_from <= now) &&
    (!item.valid_until || item.valid_until > now)
  );
}
