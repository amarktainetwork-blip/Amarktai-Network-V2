-- AlterTable: Add providerClaimAt for atomic music execution claim
ALTER TABLE `jobs` ADD COLUMN `provider_claim_at` DATETIME(3) NULL;
