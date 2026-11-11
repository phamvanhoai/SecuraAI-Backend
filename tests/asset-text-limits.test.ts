import { describe, expect, it } from "vitest";
import { createAssetBodySchema } from "../src/modules/it-asset-management/dto/create-asset.dto.js";
import { updateAssetBodySchema } from "../src/modules/it-asset-management/dto/update-asset.dto.js";
describe("createAssetBodySchema text limits", () => {
  const fields = { name: "CRM", assetType: "SERVER" };
  it.each([2, 101])("rejects name length %i after trimming", (length) => {
    expect(createAssetBodySchema.safeParse({ ...fields, name: "  " + "a".repeat(length) + "  " }).success).toBe(false);
  });
  it.each([3, 100])("accepts name length %i", (length) => {
    expect(createAssetBodySchema.parse({ ...fields, name: "  " + "a".repeat(length) + "  " }).name).toBe("a".repeat(length));
  });
  it.each([1, 19, 2001])("rejects description length %i after trimming", (length) => {
    expect(createAssetBodySchema.safeParse({ ...fields, description: "  " + "a".repeat(length) + "  " }).success).toBe(false);
  });
  it.each([0, 20, 2000])("accepts blank or valid description length %i", (length) => {
    expect(createAssetBodySchema.safeParse({ ...fields, description: "  " + "a".repeat(length) + "  " }).success).toBe(true);
  });
});
describe("updateAssetBodySchema text limits", () => {
  const fields = { name: "CRM", assetType: "SERVER", description: null };
  it.each([2, 101])("rejects name length %i after trimming", (length) => {
    expect(updateAssetBodySchema.safeParse({ ...fields, name: "  " + "a".repeat(length) + "  " }).success).toBe(false);
  });
  it.each([3, 100])("accepts name length %i", (length) => {
    expect(updateAssetBodySchema.parse({ ...fields, name: "  " + "a".repeat(length) + "  " }).name).toBe("a".repeat(length));
  });
  it.each([1, 19, 2001])("rejects description length %i after trimming", (length) => {
    expect(updateAssetBodySchema.safeParse({ ...fields, description: "  " + "a".repeat(length) + "  " }).success).toBe(false);
  });
  it.each([0, 20, 2000])("accepts blank or valid description length %i", (length) => {
    expect(updateAssetBodySchema.safeParse({ ...fields, description: "  " + "a".repeat(length) + "  " }).success).toBe(true);
  });
});
