import { describe, expect, it } from "vitest";
import { archiveAssetBodySchema } from "../src/modules/it-asset-management/dto/archive-asset.dto.js";
import { assignAssetOwnerBodySchema } from "../src/modules/it-asset-management/dto/assign-asset-owner.dto.js";
import { deactivateBusinessServiceSchema } from "../src/modules/it-asset-management/dto/deactivate-business-service.dto.js";
describe("archiveAssetBodySchema reason boundaries", () => {
  const fields = {};
  it.each(["", " ", "a".repeat(19), " " + "a".repeat(19) + " "]) ("rejects short reason %j", (reason) => {
    expect(archiveAssetBodySchema.safeParse({ ...fields, reason }).success).toBe(false);
  });
  it.each([20, 1000])("accepts %i characters after trimming", (length) => {
    expect(archiveAssetBodySchema.parse({ ...fields, reason: "  " + "a".repeat(length) + "  " }).reason).toBe("a".repeat(length));
  });
  it("rejects a reason over the maximum", () => {
    expect(archiveAssetBodySchema.safeParse({ ...fields, reason: "a".repeat(1001) }).success).toBe(false);
  });
});
describe("assignAssetOwnerBodySchema reason boundaries", () => {
  const fields = { ownerUserId: null };
  it.each(["", " ", "a".repeat(19), " " + "a".repeat(19) + " "]) ("rejects short reason %j", (reason) => {
    expect(assignAssetOwnerBodySchema.safeParse({ ...fields, reason }).success).toBe(false);
  });
  it.each([20, 1000])("accepts %i characters after trimming", (length) => {
    expect(assignAssetOwnerBodySchema.parse({ ...fields, reason: "  " + "a".repeat(length) + "  " }).reason).toBe("a".repeat(length));
  });
  it("rejects a reason over the maximum", () => {
    expect(assignAssetOwnerBodySchema.safeParse({ ...fields, reason: "a".repeat(1001) }).success).toBe(false);
  });
});
describe("deactivateBusinessServiceSchema reason boundaries", () => {
  const fields = { expectedUpdatedAt: "2026-11-10T00:00:00Z", confirmationName: "Demo service" };
  it.each(["", " ", "a".repeat(19), " " + "a".repeat(19) + " "]) ("rejects short reason %j", (reason) => {
    expect(deactivateBusinessServiceSchema.safeParse({ ...fields, reason }).success).toBe(false);
  });
  it.each([20, 2000])("accepts %i characters after trimming", (length) => {
    expect(deactivateBusinessServiceSchema.parse({ ...fields, reason: "  " + "a".repeat(length) + "  " }).reason).toBe("a".repeat(length));
  });
  it("rejects a reason over the maximum", () => {
    expect(deactivateBusinessServiceSchema.safeParse({ ...fields, reason: "a".repeat(2001) }).success).toBe(false);
  });
});
