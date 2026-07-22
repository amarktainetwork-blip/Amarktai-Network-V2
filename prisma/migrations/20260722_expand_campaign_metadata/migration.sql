-- Canonical campaign briefs include channel, offering, audience, quality,
-- approval, provenance, and budget evidence and exceed VARCHAR(191).
ALTER TABLE `campaigns` MODIFY `metadata` LONGTEXT NOT NULL DEFAULT '{}';

-- Approved campaign child requests carry durable execution provenance and
-- dispatch policy, which also exceeds MariaDB's default VARCHAR(191).
ALTER TABLE `campaign_items` MODIFY `metadata` LONGTEXT NOT NULL DEFAULT '{}';
