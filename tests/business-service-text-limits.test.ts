import { describe, expect, it } from "vitest";
import { createBusinessServiceSchema } from "../src/modules/it-asset-management/dto/create-business-service.dto.js";
import { updateBusinessServiceSchema } from "../src/modules/it-asset-management/dto/update-business-service.dto.js";
describe("createBusinessServiceSchema text limits", () => {
  const fields = { name: "CRM" };
  it.each([2, 101])("rejects name length %i", (length) => {
    expect(createBusinessServiceSchema.safeParse({ ...fields, name: "  " + "a".repeat(length) + "  " }).success).toBe(false);
  });
  it.each([3, 100])("accepts name length %i after normalization", (length) => {
    expect(createBusinessServiceSchema.parse({ ...fields, name: "  " + "a".repeat(length) + "  " }).name).toBe("a".repeat(length));
  });
  it.each([1, 19, 2001])("rejects description length %i", (length) => {
    expect(createBusinessServiceSchema.safeParse({ ...fields, description: "  " + "a".repeat(length) + "  " }).success).toBe(false);
  });
  it.each([undefined, null, "", "   ", "a".repeat(20), "a".repeat(2000)])("accepts optional or valid description", (description) => {
    expect(createBusinessServiceSchema.safeParse({ ...fields, description }).success).toBe(true);
  });
});
describe("updateBusinessServiceSchema text limits", () => {
  const fields = { name: "CRM", expectedUpdatedAt: "2026-11-10T00:00:00Z" };
  it.each([2, 101])("rejects name length %i", (length) => {
    expect(updateBusinessServiceSchema.safeParse({ ...fields, name: "  " + "a".repeat(length) + "  " }).success).toBe(false);
  });
  it.each([3, 100])("accepts name length %i after normalization", (length) => {
    expect(updateBusinessServiceSchema.parse({ ...fields, name: "  " + "a".repeat(length) + "  " }).name).toBe("a".repeat(length));
  });
  it.each([1, 19, 2001])("rejects description length %i", (length) => {
    expect(updateBusinessServiceSchema.safeParse({ ...fields, description: "  " + "a".repeat(length) + "  " }).success).toBe(false);
  });
  it.each([undefined, null, "", "   ", "a".repeat(20), "a".repeat(2000)])("accepts optional or valid description", (description) => {
    expect(updateBusinessServiceSchema.safeParse({ ...fields, description }).success).toBe(true);
  });
});
