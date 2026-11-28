// A bounded suggestion heuristic, not proof that two records represent the same incident.
const stopWords = new Set([
  'incident',
  'security',
  'reported',
  'confirmed',
  'suspected',
  'the',
  'and',
  'from',
  'with',
  'for',
  'cua',
  'su',
  'co',
  'bao',
  'cao',
]);
export function incidentTitleTerms(title: string): string[] {
  return [
    ...new Set(
      title
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .match(/[\p{L}\p{N}][\p{L}\p{N}._@-]*/gu) ?? [],
    ),
  ]
    .filter((term) => term.length >= 3 && !stopWords.has(term))
    .slice(0, 20);
}

export function relatedTitleTerms(title: string, other: string): string[] {
  const terms = incidentTitleTerms(title);
  const otherTerms = new Set(incidentTitleTerms(other));
  const shared = terms.filter((term) => otherTerms.has(term));
  return shared.length >= Math.min(2, terms.length) &&
    shared.length / Math.max(terms.length, otherTerms.size, 1) >= 0.5 &&
    (shared.length > 1 || (shared[0]?.length ?? 0) >= 6)
    ? shared
    : [];
}
