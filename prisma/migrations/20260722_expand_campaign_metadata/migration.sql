-- Canonical campaign briefs include channel, offering, audience, quality,
-- approval, provenance, and budget evidence and exceed VARCHAR(191).
ALTER TABLE `campaigns` MODIFY `metadata` LONGTEXT NOT NULL DEFAULT '{}';
