import { describe, expect, it } from "vitest";
import type { ZodType } from "zod";
import { createRiskAssessmentBodySchema } from "../src/modules/risk-assessment/dto/create-risk-assessment.dto.js";
import { identifyThreatBodySchema, updateThreatBodySchema } from "../src/modules/risk-assessment/dto/identify-threat.dto.js";
import { identifyVulnerabilityBodySchema, updateVulnerabilityBodySchema } from "../src/modules/risk-assessment/dto/identify-vulnerability.dto.js";
import { assessInherentRiskBodySchema } from "../src/modules/risk-assessment/dto/assess-inherent-risk.dto.js";
import { assessResidualRiskBodySchema } from "../src/modules/risk-assessment/dto/assess-residual-risk.dto.js";
import { defineTargetRiskBodySchema } from "../src/modules/risk-assessment/dto/define-target-risk.dto.js";
import { createTreatmentPlanBodySchema } from "../src/modules/risk-assessment/dto/create-treatment-plan.dto.js";
import { updateTreatmentPlanBodySchema } from "../src/modules/risk-assessment/dto/update-treatment-plan.dto.js";
import { submitRiskAcceptanceBodySchema, decideRiskAcceptanceBodySchema, openRiskReviewBodySchema } from "../src/modules/risk-assessment/dto/risk-acceptance.dto.js";
import { acceptanceCostSchema } from "../src/modules/risk-assessment/dto/acceptance-cost.dto.js";
import { completeRiskReviewSchema } from "../src/modules/risk-assessment/dto/complete-risk-review.dto.js";
const cases: Array<{ label: string; schema: ZodType; min: number; max: number }> = [
  { label: "createRiskAssessmentBodySchema.title", schema: createRiskAssessmentBodySchema.shape.title, min: 3, max: 100 },
  { label: "createRiskAssessmentBodySchema.description", schema: createRiskAssessmentBodySchema.shape.description, min: 20, max: 2000 },
  { label: "identifyThreatBodySchema.name", schema: identifyThreatBodySchema.shape.name, min: 2, max: 100 },
  { label: "identifyThreatBodySchema.description", schema: identifyThreatBodySchema.shape.description, min: 20, max: 2000 },
  { label: "updateThreatBodySchema.name", schema: updateThreatBodySchema.shape.name, min: 2, max: 100 },
  { label: "updateThreatBodySchema.description", schema: updateThreatBodySchema.shape.description, min: 20, max: 2000 },
  { label: "identifyVulnerabilityBodySchema.name", schema: identifyVulnerabilityBodySchema.shape.name, min: 2, max: 100 },
  { label: "identifyVulnerabilityBodySchema.description", schema: identifyVulnerabilityBodySchema.shape.description, min: 20, max: 2000 },
  { label: "updateVulnerabilityBodySchema.name", schema: updateVulnerabilityBodySchema.shape.name, min: 2, max: 100 },
  { label: "updateVulnerabilityBodySchema.description", schema: updateVulnerabilityBodySchema.shape.description, min: 20, max: 2000 },
  { label: "assessInherentRiskBodySchema.assessmentReason", schema: assessInherentRiskBodySchema.shape.assessmentReason, min: 10, max: 2000 },
  { label: "assessResidualRiskBodySchema.assessmentReason", schema: assessResidualRiskBodySchema.shape.assessmentReason, min: 10, max: 2000 },
  { label: "defineTargetRiskBodySchema.rationale", schema: defineTargetRiskBodySchema.shape.rationale, min: 10, max: 2000 },
  { label: "createTreatmentPlanBodySchema.title", schema: createTreatmentPlanBodySchema.shape.title, min: 3, max: 100 },
  { label: "updateTreatmentPlanBodySchema.title", schema: updateTreatmentPlanBodySchema.shape.title, min: 3, max: 100 },
  { label: "submitRiskAcceptanceBodySchema.assessmentReason", schema: submitRiskAcceptanceBodySchema.shape.assessmentReason, min: 10, max: 2000 },
  { label: "submitRiskAcceptanceBodySchema.acceptanceReason", schema: submitRiskAcceptanceBodySchema.shape.acceptanceReason, min: 10, max: 2000 },
  { label: "decideRiskAcceptanceBodySchema.reason", schema: decideRiskAcceptanceBodySchema.shape.reason, min: 10, max: 2000 },
  { label: "openRiskReviewBodySchema.reason", schema: openRiskReviewBodySchema.shape.reason, min: 10, max: 2000 },
  { label: "acceptanceCostSchema.basis", schema: acceptanceCostSchema.shape.basis, min: 10, max: 2000 },
  { label: "completeRiskReviewSchema.conclusion", schema: completeRiskReviewSchema.shape.conclusion, min: 10, max: 2000 },
  { label: "createTreatmentPlanBodySchema action title", schema: createTreatmentPlanBodySchema.shape.actions.element.shape.title, min: 3, max: 100 },
  { label: "updateTreatmentPlanBodySchema action title", schema: updateTreatmentPlanBodySchema.shape.actions.element.shape.title, min: 3, max: 100 },
];
describe.each(cases)("$label text boundaries", ({ schema, min, max }) => {
  it.each(["below", "minimum", "maximum", "above"])("checks %s after trimming", (boundary) => {
    const length = boundary === "below" ? min - 1 : boundary === "minimum" ? min : boundary === "maximum" ? max : max + 1;
    expect(schema.safeParse("  " + "a".repeat(length) + "  ").success).toBe(length >= min && length <= max);
  });
  it("rejects whitespace-only required text", () => expect(schema.safeParse("   ").success).toBe(false));
});
const description = createTreatmentPlanBodySchema.shape.actions.element.shape.description;
describe("optional action description", () => {
  it.each([undefined, "", "   ", "a".repeat(20), "a".repeat(2000)])("accepts blank or in-range text", (value) => expect(description.safeParse(value).success).toBe(true));
  it.each([1, 19, 2001])("rejects %i characters after trimming", (length) => expect(description.safeParse("  " + "a".repeat(length) + "  ").success).toBe(false));
});
