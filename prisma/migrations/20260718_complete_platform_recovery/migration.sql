-- Complete app policy, dynamic model route metadata, and provider-neutral voices.
-- All additions are nullable/defaulted so historical rows remain valid.
ALTER TABLE `model_registry_entries`
  ADD COLUMN `quality_tier` VARCHAR(191) NOT NULL DEFAULT 'standard',
  ADD COLUMN `current_availability` VARCHAR(191) NOT NULL DEFAULT 'defined',
  ADD COLUMN `account_access` VARCHAR(191) NOT NULL DEFAULT 'unknown',
  ADD COLUMN `endpoint_family` VARCHAR(191) NOT NULL DEFAULT '',
  ADD COLUMN `transport_profile` VARCHAR(191) NOT NULL DEFAULT '',
  ADD COLUMN `structured_output_modes` LONGTEXT NULL,
  ADD COLUMN `supported_parameters` LONGTEXT NULL,
  ADD COLUMN `compatibility_version` VARCHAR(191) NOT NULL DEFAULT '',
  ADD COLUMN `deprecated` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `replacement_model` VARCHAR(191) NOT NULL DEFAULT '',
  ADD COLUMN `last_proof_at` DATETIME(3) NULL,
  ADD COLUMN `live_proven_route_count` INTEGER NOT NULL DEFAULT 0;

UPDATE `model_registry_entries`
SET `structured_output_modes` = '[]', `supported_parameters` = '[]'
WHERE `structured_output_modes` IS NULL OR `supported_parameters` IS NULL;
ALTER TABLE `model_registry_entries` MODIFY `structured_output_modes` LONGTEXT NOT NULL, MODIFY `supported_parameters` LONGTEXT NOT NULL;

ALTER TABLE `app_ai_profiles`
  ADD COLUMN `business_context` LONGTEXT NULL,
  ADD COLUMN `product_instructions` LONGTEXT NULL,
  ADD COLUMN `default_quality_target` VARCHAR(191) NOT NULL DEFAULT 'standard',
  ADD COLUMN `default_spend_strategy` VARCHAR(191) NOT NULL DEFAULT 'best_value',
  ADD COLUMN `default_route_pool` LONGTEXT NULL;

UPDATE `app_ai_profiles`
SET `business_context` = '{}', `product_instructions` = '', `default_route_pool` = '[]'
WHERE `business_context` IS NULL OR `default_route_pool` IS NULL;
ALTER TABLE `app_ai_profiles` MODIFY `business_context` LONGTEXT NOT NULL, MODIFY `product_instructions` LONGTEXT NOT NULL, MODIFY `default_route_pool` LONGTEXT NOT NULL;

ALTER TABLE `app_capability_grants`
  ADD COLUMN `routing_mode` VARCHAR(191) NOT NULL DEFAULT 'automatic',
  ADD COLUMN `quality_target` VARCHAR(191) NOT NULL DEFAULT 'standard',
  ADD COLUMN `spend_strategy` VARCHAR(191) NOT NULL DEFAULT 'best_value',
  ADD COLUMN `fixed_provider` VARCHAR(191) NOT NULL DEFAULT '',
  ADD COLUMN `fixed_model` VARCHAR(191) NOT NULL DEFAULT '',
  ADD COLUMN `preferred_pool` LONGTEXT NULL,
  ADD COLUMN `selectable_allowlist` LONGTEXT NULL,
  ADD COLUMN `restricted_pool` LONGTEXT NULL,
  ADD COLUMN `workflow_step_overrides` LONGTEXT NULL;

UPDATE `app_capability_grants`
SET `preferred_pool` = '[]', `selectable_allowlist` = '[]', `restricted_pool` = '[]', `workflow_step_overrides` = '{}'
WHERE `preferred_pool` IS NULL OR `selectable_allowlist` IS NULL OR `restricted_pool` IS NULL OR `workflow_step_overrides` IS NULL;
ALTER TABLE `app_capability_grants` MODIFY `preferred_pool` LONGTEXT NOT NULL, MODIFY `selectable_allowlist` LONGTEXT NOT NULL, MODIFY `restricted_pool` LONGTEXT NOT NULL, MODIFY `workflow_step_overrides` LONGTEXT NOT NULL;

ALTER TABLE `voice_library`
  ADD COLUMN `compatible_models` LONGTEXT NULL,
  ADD COLUMN `locale` VARCHAR(191) NOT NULL DEFAULT '',
  ADD COLUMN `use_case_tags` LONGTEXT NULL,
  ADD COLUMN `source_type` VARCHAR(191) NOT NULL DEFAULT 'catalogue',
  ADD COLUMN `consent_status` VARCHAR(191) NOT NULL DEFAULT 'provider_catalogue',
  ADD COLUMN `ownership_reference` VARCHAR(191) NOT NULL DEFAULT '',
  ADD COLUMN `last_verified_at` DATETIME(3) NULL;

UPDATE `voice_library`
SET `compatible_models` = '[]', `use_case_tags` = '[]'
WHERE `compatible_models` IS NULL OR `use_case_tags` IS NULL;
ALTER TABLE `voice_library` MODIFY `compatible_models` LONGTEXT NOT NULL, MODIFY `use_case_tags` LONGTEXT NOT NULL;

ALTER TABLE `app_connections`
  ADD COLUMN `app_type` VARCHAR(191) NOT NULL DEFAULT 'general',
  ADD COLUMN `website` VARCHAR(191) NOT NULL DEFAULT '',
  ADD COLUMN `description` TEXT NOT NULL,
  ADD COLUMN `environment` VARCHAR(191) NOT NULL DEFAULT 'production',
  ADD COLUMN `onboarding_state` VARCHAR(191) NOT NULL DEFAULT 'identity',
  ADD COLUMN `webhook_url` VARCHAR(191) NOT NULL DEFAULT '',
  ADD COLUMN `connection_health` VARCHAR(191) NOT NULL DEFAULT 'not_tested',
  ADD COLUMN `activated_at` DATETIME(3) NULL;
