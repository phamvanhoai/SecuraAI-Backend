import { describe, expect, it } from 'vitest';
import {
  editPolicyDraftBodySchema,
  editPolicyDraftParamsSchema,
} from '../src/modules/policy-compliance-control/dto/edit-policy-draft.dto.js';

describe('edit policy draft DTO', () => {
  it('trims and accepts supported partial updates', () => {
    expect(
      editPolicyDraftBodySchema.parse({
        title: '  Updated policy  ',
        description: null,
        versionNumber: ' 1.1 ',
        content: ' Updated content ',
        changeSummary: ' Revised scope ',
      }),
    ).toEqual({
      title: 'Updated policy',
      description: null,
      versionNumber: '1.1',
      content: 'Updated content',
      changeSummary: 'Revised scope',
    });
  });

  it('rejects empty updates and unknown fields', () => {
    expect(editPolicyDraftBodySchema.safeParse({}).success).toBe(false);
    expect(editPolicyDraftBodySchema.safeParse({ policyCode: 'NEW' }).success).toBe(false);
  });

  it('requires UUID route identifiers', () => {
    expect(
      editPolicyDraftParamsSchema.safeParse({ policyId: 'invalid', versionId: 'invalid' }).success,
    ).toBe(false);
  });
});
