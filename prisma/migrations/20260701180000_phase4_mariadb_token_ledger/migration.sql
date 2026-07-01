-- Phase 4: MariaDB Migration + Token Ledger + New Capabilities
-- Migration: PostgreSQL → MySQL/MariaDB

-- AlterAppConnection: Change ID from Int to String UUID, add token_balance
ALTER TABLE `app_connections` DROP PRIMARY KEY;
ALTER TABLE `app_connections` MODIFY COLUMN `id` VARCHAR(36) NOT NULL;
ALTER TABLE `app_connections` ADD PRIMARY KEY (`id`);
ALTER TABLE `app_connections` ADD COLUMN `token_balance` INT NOT NULL DEFAULT 1000;

-- AlterAppApiKey: Change ID and connectionId from Int to String UUID
ALTER TABLE `app_api_keys` DROP FOREIGN KEY `app_api_keys_connection_id_fkey`;
ALTER TABLE `app_api_keys` DROP PRIMARY KEY;
ALTER TABLE `app_api_keys` MODIFY COLUMN `id` VARCHAR(36) NOT NULL;
ALTER TABLE `app_api_keys` MODIFY COLUMN `connection_id` VARCHAR(36) NOT NULL;
ALTER TABLE `app_api_keys` ADD PRIMARY KEY (`id`);
ALTER TABLE `app_api_keys` ADD CONSTRAINT `app_api_keys_connection_id_fkey`
  FOREIGN KEY (`connection_id`) REFERENCES `app_connections`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
