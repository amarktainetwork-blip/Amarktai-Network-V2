-- Production release-candidate authentication and bootstrap guardrails.
ALTER TABLE `admin_users`
  ADD COLUMN `enabled` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `token_version` INTEGER NOT NULL DEFAULT 0;

CREATE TABLE `platform_bootstrap_runs` (
  `id` VARCHAR(191) NOT NULL,
  `bootstrap_key` VARCHAR(191) NOT NULL,
  `inserted_json` LONGTEXT NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `platform_bootstrap_runs_bootstrap_key_idx`(`bootstrap_key`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
