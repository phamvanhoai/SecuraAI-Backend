-- Files remain private; only generated image identifiers, names and hashes are stored here.
ALTER TABLE "notifications" ADD COLUMN "image_references" jsonb NOT NULL DEFAULT '[]'::jsonb;
