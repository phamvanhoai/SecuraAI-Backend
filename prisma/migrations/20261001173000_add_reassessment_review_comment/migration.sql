ALTER TABLE "public"."risk_reassessment_requests"
ADD COLUMN "review_comment" TEXT;

COMMENT ON COLUMN "public"."risk_reassessment_requests"."review_comment"
IS 'Reviewer rationale when a reassessment request is rejected or otherwise decided.';
