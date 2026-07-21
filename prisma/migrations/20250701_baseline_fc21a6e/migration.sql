-- CreateTable
CREATE TABLE `admin_users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(191) NOT NULL,
    `password_hash` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `admin_users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `products` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NOT NULL DEFAULT 'app',
    `short_description` VARCHAR(191) NOT NULL,
    `long_description` VARCHAR(191) NOT NULL DEFAULT '',
    `status` VARCHAR(191) NOT NULL DEFAULT 'coming_soon',
    `access_type` VARCHAR(191) NOT NULL DEFAULT 'public',
    `featured` BOOLEAN NOT NULL DEFAULT false,
    `primary_url` VARCHAR(191) NOT NULL DEFAULT '',
    `hosted_here` BOOLEAN NOT NULL DEFAULT false,
    `hosting_scope` VARCHAR(191) NOT NULL DEFAULT 'external_domain',
    `subdomain` VARCHAR(191) NOT NULL DEFAULT '',
    `custom_domain` VARCHAR(191) NOT NULL DEFAULT '',
    `environment` VARCHAR(191) NOT NULL DEFAULT 'production',
    `public_visibility` BOOLEAN NOT NULL DEFAULT true,
    `monitoring_enabled` BOOLEAN NOT NULL DEFAULT false,
    `integration_enabled` BOOLEAN NOT NULL DEFAULT false,
    `app_type` VARCHAR(191) NOT NULL DEFAULT 'app',
    `ready_to_deploy` BOOLEAN NOT NULL DEFAULT false,
    `ai_enabled` BOOLEAN NOT NULL DEFAULT false,
    `connected_to_brain` BOOLEAN NOT NULL DEFAULT false,
    `onboarding_status` VARCHAR(191) NOT NULL DEFAULT 'unconfigured',
    `onboarding_completed_at` DATETIME(3) NULL,
    `app_secret` VARCHAR(191) NOT NULL DEFAULT '',
    `custom_instructions` VARCHAR(191) NOT NULL DEFAULT '',
    `sort_order` INTEGER NOT NULL DEFAULT 99,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `products_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `api_keys` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `provider` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `api_key` VARCHAR(191) NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `app_integrations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `product_id` INTEGER NOT NULL,
    `integration_token` VARCHAR(191) NOT NULL,
    `heartbeat_enabled` BOOLEAN NOT NULL DEFAULT true,
    `metrics_enabled` BOOLEAN NOT NULL DEFAULT true,
    `events_enabled` BOOLEAN NOT NULL DEFAULT true,
    `vps_enabled` BOOLEAN NOT NULL DEFAULT false,
    `last_heartbeat_at` DATETIME(3) NULL,
    `health_status` VARCHAR(191) NOT NULL DEFAULT 'unknown',
    `uptime` DOUBLE NULL,
    `version` VARCHAR(191) NOT NULL DEFAULT '',
    `environment` VARCHAR(191) NOT NULL DEFAULT 'production',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `app_integrations_product_id_key`(`product_id`),
    UNIQUE INDEX `app_integrations_integration_token_key`(`integration_token`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `app_metric_definitions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `product_id` INTEGER NOT NULL,
    `metric_key` VARCHAR(191) NOT NULL,
    `metric_label` VARCHAR(191) NOT NULL,
    `metric_type` VARCHAR(191) NOT NULL DEFAULT 'number',
    `default_chart_type` VARCHAR(191) NOT NULL DEFAULT 'line',
    `is_enabled` BOOLEAN NOT NULL DEFAULT true,
    `sort_order` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `app_metric_points` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `product_id` INTEGER NOT NULL,
    `metric_key` VARCHAR(191) NOT NULL,
    `metric_value` DOUBLE NOT NULL,
    `metric_label` VARCHAR(191) NOT NULL DEFAULT '',
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `app_events` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `product_id` INTEGER NOT NULL,
    `event_type` VARCHAR(191) NOT NULL,
    `severity` VARCHAR(191) NOT NULL DEFAULT 'info',
    `title` VARCHAR(191) NOT NULL,
    `message` VARCHAR(191) NOT NULL DEFAULT '',
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `vps_resource_snapshots` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `product_id` INTEGER NOT NULL,
    `cpu_percent` DOUBLE NOT NULL DEFAULT 0,
    `ram_percent` DOUBLE NOT NULL DEFAULT 0,
    `ram_used_mb` DOUBLE NOT NULL DEFAULT 0,
    `ram_total_mb` DOUBLE NOT NULL DEFAULT 0,
    `disk_percent` DOUBLE NOT NULL DEFAULT 0,
    `disk_used_gb` DOUBLE NOT NULL DEFAULT 0,
    `disk_total_gb` DOUBLE NOT NULL DEFAULT 0,
    `net_in_kbps` DOUBLE NOT NULL DEFAULT 0,
    `net_out_kbps` DOUBLE NOT NULL DEFAULT 0,
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `dashboard_widget_configs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `product_id` INTEGER NULL,
    `widget_key` VARCHAR(191) NOT NULL,
    `widget_type` VARCHAR(191) NOT NULL,
    `is_visible` BOOLEAN NOT NULL DEFAULT true,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `settings_json` VARCHAR(191) NOT NULL DEFAULT '{}',

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contact_submissions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `company_or_project` VARCHAR(191) NOT NULL DEFAULT '',
    `message` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `waitlist_entries` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `interest` VARCHAR(191) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ai_providers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `provider_key` VARCHAR(191) NOT NULL,
    `display_name` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `api_key` VARCHAR(191) NOT NULL DEFAULT '',
    `masked_preview` VARCHAR(191) NOT NULL DEFAULT '',
    `base_url` VARCHAR(191) NOT NULL DEFAULT '',
    `default_model` VARCHAR(191) NOT NULL DEFAULT '',
    `fallback_model` VARCHAR(191) NOT NULL DEFAULT '',
    `credential_usage_policy` VARCHAR(191) NOT NULL DEFAULT 'backend_runtime_allowed',
    `health_status` VARCHAR(191) NOT NULL DEFAULT 'unconfigured',
    `health_message` VARCHAR(191) NOT NULL DEFAULT '',
    `last_checked_at` DATETIME(3) NULL,
    `notes` VARCHAR(191) NOT NULL DEFAULT '',
    `sort_order` INTEGER NOT NULL DEFAULT 99,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ai_providers_provider_key_key`(`provider_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `brain_events` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `trace_id` VARCHAR(191) NOT NULL,
    `product_id` INTEGER NULL,
    `app_slug` VARCHAR(191) NOT NULL DEFAULT '',
    `task_type` VARCHAR(191) NOT NULL DEFAULT '',
    `execution_mode` VARCHAR(191) NOT NULL DEFAULT 'direct',
    `classification_json` VARCHAR(191) NOT NULL DEFAULT '{}',
    `routed_provider` VARCHAR(191) NULL,
    `routed_model` VARCHAR(191) NULL,
    `validation_used` BOOLEAN NOT NULL DEFAULT false,
    `consensus_used` BOOLEAN NOT NULL DEFAULT false,
    `confidence_score` DOUBLE NULL,
    `success` BOOLEAN NOT NULL DEFAULT false,
    `error_message` VARCHAR(191) NULL,
    `warnings_json` VARCHAR(191) NOT NULL DEFAULT '[]',
    `latency_ms` INTEGER NULL,
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `brain_events_app_slug_idx`(`app_slug`),
    INDEX `brain_events_trace_id_idx`(`trace_id`),
    INDEX `brain_events_timestamp_idx`(`timestamp`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `memory_entries` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `app_slug` VARCHAR(191) NOT NULL,
    `memory_type` VARCHAR(191) NOT NULL DEFAULT 'event',
    `key` VARCHAR(191) NOT NULL DEFAULT '',
    `content` VARCHAR(191) NOT NULL,
    `importance` DOUBLE NOT NULL DEFAULT 0.5,
    `expires_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `memory_entries_app_slug_idx`(`app_slug`),
    INDEX `memory_entries_memory_type_idx`(`memory_type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `provider_budgets` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `provider_key` VARCHAR(191) NOT NULL,
    `monthly_budget_usd` DOUBLE NULL,
    `current_spend_usd` DOUBLE NOT NULL DEFAULT 0,
    `warning_threshold_pct` DOUBLE NOT NULL DEFAULT 75,
    `critical_threshold_pct` DOUBLE NOT NULL DEFAULT 90,
    `notes` VARCHAR(191) NOT NULL DEFAULT '',
    `updated_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `provider_budgets_provider_key_key`(`provider_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `playground_projects` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL DEFAULT 'general',
    `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
    `description` VARCHAR(191) NOT NULL DEFAULT '',
    `prompt_history_json` VARCHAR(191) NOT NULL DEFAULT '[]',
    `files_json` VARCHAR(191) NOT NULL DEFAULT '[]',
    `agent_configs_json` VARCHAR(191) NOT NULL DEFAULT '[]',
    `workflows_json` VARCHAR(191) NOT NULL DEFAULT '[]',
    `tags_json` VARCHAR(191) NOT NULL DEFAULT '[]',
    `github_repo` VARCHAR(191) NULL,
    `github_branch` VARCHAR(191) NULL,
    `last_pushed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `playground_projects_status_idx`(`status`),
    INDEX `playground_projects_type_idx`(`type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `github_configs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `username` VARCHAR(191) NOT NULL DEFAULT '',
    `access_token` VARCHAR(191) NOT NULL DEFAULT '',
    `default_owner` VARCHAR(191) NOT NULL DEFAULT '',
    `last_validated_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `github_push_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `project_id` INTEGER NOT NULL,
    `repo_full_name` VARCHAR(191) NOT NULL,
    `branch` VARCHAR(191) NOT NULL,
    `commit_sha` VARCHAR(191) NULL,
    `commit_message` VARCHAR(191) NOT NULL,
    `files_changed` INTEGER NOT NULL DEFAULT 0,
    `success` BOOLEAN NOT NULL DEFAULT false,
    `error` VARCHAR(191) NULL,
    `pushed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `github_push_logs_project_id_idx`(`project_id`),
    INDEX `github_push_logs_pushed_at_idx`(`pushed_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `repo_workspaces` (
    `id` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(191) NOT NULL DEFAULT 'github',
    `owner` VARCHAR(191) NOT NULL,
    `repo` VARCHAR(191) NOT NULL,
    `branch` VARCHAR(191) NOT NULL,
    `remote_url` VARCHAR(191) NOT NULL,
    `local_path` VARCHAR(191) NOT NULL,
    `current_commit` VARCHAR(191) NOT NULL DEFAULT '',
    `status` VARCHAR(191) NOT NULL DEFAULT 'ready',
    `last_synced_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `repo_workspaces_status_idx`(`status`),
    INDEX `repo_workspaces_updated_at_idx`(`updated_at`),
    UNIQUE INDEX `repo_workspaces_owner_repo_branch_key`(`owner`, `repo`, `branch`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `repo_tasks` (
    `id` VARCHAR(191) NOT NULL,
    `repo_workspace_id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `user_request` VARCHAR(191) NOT NULL DEFAULT '',
    `agent_mode` VARCHAR(191) NOT NULL,
    `selected_model` VARCHAR(191) NOT NULL DEFAULT '',
    `selected_model_tier` VARCHAR(191) NOT NULL DEFAULT '',
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `plan_json` VARCHAR(191) NOT NULL DEFAULT '{}',
    `changed_files_json` VARCHAR(191) NOT NULL DEFAULT '[]',
    `test_status` VARCHAR(191) NOT NULL DEFAULT '',
    `build_status` VARCHAR(191) NOT NULL DEFAULT '',
    `artifact_ids_json` VARCHAR(191) NOT NULL DEFAULT '[]',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `repo_tasks_repo_workspace_id_idx`(`repo_workspace_id`),
    INDEX `repo_tasks_status_idx`(`status`),
    INDEX `repo_tasks_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `repo_patches` (
    `id` VARCHAR(191) NOT NULL,
    `repo_workspace_id` VARCHAR(191) NOT NULL,
    `repo_task_id` VARCHAR(191) NULL,
    `title` VARCHAR(191) NOT NULL,
    `diff_text` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'proposed',
    `branch_name` VARCHAR(191) NOT NULL DEFAULT '',
    `commit_sha` VARCHAR(191) NULL,
    `pr_url` VARCHAR(191) NULL,
    `artifact_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `repo_patches_repo_workspace_id_idx`(`repo_workspace_id`),
    INDEX `repo_patches_repo_task_id_idx`(`repo_task_id`),
    INDEX `repo_patches_status_idx`(`status`),
    INDEX `repo_patches_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `video_generation_jobs` (
    `id` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(191) NOT NULL,
    `model_id` VARCHAR(191) NOT NULL,
    `prompt` VARCHAR(191) NOT NULL,
    `style` VARCHAR(191) NULL,
    `duration` INTEGER NULL,
    `aspect_ratio` VARCHAR(191) NULL,
    `app_slug` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `provider_job_id` VARCHAR(191) NULL,
    `result_url` VARCHAR(191) NULL,
    `result_meta` VARCHAR(191) NULL,
    `error_message` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `video_generation_jobs_status_idx`(`status`),
    INDEX `video_generation_jobs_app_slug_idx`(`app_slug`),
    INDEX `video_generation_jobs_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `model_registry_entries` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `provider` VARCHAR(191) NOT NULL,
    `model_id` VARCHAR(191) NOT NULL,
    `display_name` VARCHAR(191) NOT NULL,
    `family` VARCHAR(191) NOT NULL DEFAULT '',
    `category` VARCHAR(191) NOT NULL DEFAULT 'text',
    `primary_role` VARCHAR(191) NOT NULL DEFAULT 'chat',
    `cost_tier` VARCHAR(191) NOT NULL DEFAULT 'low',
    `latency_tier` VARCHAR(191) NOT NULL DEFAULT 'medium',
    `context_window` INTEGER NOT NULL DEFAULT 4096,
    `supports_text` BOOLEAN NOT NULL DEFAULT false,
    `supports_reasoning` BOOLEAN NOT NULL DEFAULT false,
    `supports_code` BOOLEAN NOT NULL DEFAULT false,
    `supports_chat` BOOLEAN NOT NULL DEFAULT false,
    `supports_image_generation` BOOLEAN NOT NULL DEFAULT false,
    `supports_image_editing` BOOLEAN NOT NULL DEFAULT false,
    `supports_video_planning` BOOLEAN NOT NULL DEFAULT false,
    `supports_video_generation` BOOLEAN NOT NULL DEFAULT false,
    `supports_stt` BOOLEAN NOT NULL DEFAULT false,
    `supports_tts` BOOLEAN NOT NULL DEFAULT false,
    `supports_realtime_voice` BOOLEAN NOT NULL DEFAULT false,
    `supports_embeddings` BOOLEAN NOT NULL DEFAULT false,
    `supports_reranking` BOOLEAN NOT NULL DEFAULT false,
    `supports_research` BOOLEAN NOT NULL DEFAULT false,
    `supports_multimodal` BOOLEAN NOT NULL DEFAULT false,
    `supports_tool_use` BOOLEAN NOT NULL DEFAULT false,
    `supports_structured_output` BOOLEAN NOT NULL DEFAULT false,
    `source` VARCHAR(191) NOT NULL DEFAULT 'unknown',
    `catalog_completeness` VARCHAR(191) NOT NULL DEFAULT 'unknown',
    `is_live_discovered` BOOLEAN NOT NULL DEFAULT false,
    `model_owner` VARCHAR(191) NOT NULL DEFAULT '',
    `provider_raw_type` VARCHAR(191) NOT NULL DEFAULT '',
    `provider_raw_category` VARCHAR(191) NOT NULL DEFAULT '',
    `raw_metadata` LONGTEXT NOT NULL DEFAULT '{}',
    `discovered_at` DATETIME(3) NULL,
    `last_synced_at` DATETIME(3) NULL,
    `pricing_source` VARCHAR(191) NOT NULL DEFAULT 'unknown',
    `pricing_confidence` VARCHAR(191) NOT NULL DEFAULT 'unknown',
    `pricing_unit` VARCHAR(191) NOT NULL DEFAULT '',
    `pricing_currency` VARCHAR(191) NOT NULL DEFAULT '',
    `pricing_raw_metadata` LONGTEXT NOT NULL DEFAULT '{}',
    `last_pricing_synced_at` DATETIME(3) NULL,
    `pricing_blocker` VARCHAR(191) NOT NULL DEFAULT '',
    `estimated_unit_cost` DOUBLE NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `hidden` BOOLEAN NOT NULL DEFAULT false,
    `notes` LONGTEXT NOT NULL DEFAULT '',
    `safety_tags` VARCHAR(191) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `model_registry_entries_provider_idx`(`provider`),
    INDEX `model_registry_entries_category_idx`(`category`),
    INDEX `model_registry_entries_enabled_idx`(`enabled`),
    INDEX `model_registry_entries_source_idx`(`source`),
    INDEX `model_registry_entries_is_live_discovered_idx`(`is_live_discovered`),
    UNIQUE INDEX `model_registry_entries_provider_model_id_key`(`provider`, `model_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `app_ai_profiles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `app_slug` VARCHAR(191) NOT NULL,
    `app_name` VARCHAR(191) NOT NULL,
    `app_type` VARCHAR(191) NOT NULL DEFAULT 'general',
    `domain` VARCHAR(191) NOT NULL DEFAULT 'general',
    `default_routing_mode` VARCHAR(191) NOT NULL DEFAULT 'direct',
    `allowed_providers` VARCHAR(191) NOT NULL DEFAULT '[]',
    `allowed_models` VARCHAR(191) NOT NULL DEFAULT '[]',
    `preferred_models` VARCHAR(191) NOT NULL DEFAULT '[]',
    `fallback_chain` VARCHAR(191) NOT NULL DEFAULT '[]',
    `cost_mode` VARCHAR(191) NOT NULL DEFAULT 'balanced',
    `max_cost_per_request` DOUBLE NULL,
    `monthly_budget_cap` DOUBLE NULL,
    `safe_mode` BOOLEAN NOT NULL DEFAULT true,
    `adult_mode` BOOLEAN NOT NULL DEFAULT false,
    `suggestive_mode` BOOLEAN NOT NULL DEFAULT false,
    `enabled_capabilities` VARCHAR(191) NOT NULL DEFAULT '[]',
    `enabled_agents` VARCHAR(191) NOT NULL DEFAULT '[]',
    `routing_strategy` VARCHAR(191) NOT NULL DEFAULT 'balanced',
    `allow_benchmark` BOOLEAN NOT NULL DEFAULT false,
    `base_personality` VARCHAR(191) NOT NULL DEFAULT '',
    `emotion_context_window` INTEGER NOT NULL DEFAULT 0,
    `escalation_rules` VARCHAR(191) NOT NULL DEFAULT '[]',
    `validator_rules` VARCHAR(191) NOT NULL DEFAULT '[]',
    `agent_permissions` VARCHAR(191) NOT NULL DEFAULT '[]',
    `multimodal_permissions` VARCHAR(191) NOT NULL DEFAULT '[]',
    `memory_namespace` VARCHAR(191) NOT NULL DEFAULT '',
    `retrieval_namespace` VARCHAR(191) NOT NULL DEFAULT '',
    `budget_sensitivity` VARCHAR(191) NOT NULL DEFAULT 'medium',
    `latency_sensitivity` VARCHAR(191) NOT NULL DEFAULT 'medium',
    `logging_privacy_rules` VARCHAR(191) NOT NULL DEFAULT '[]',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `app_ai_profiles_app_slug_key`(`app_slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fine_tune_jobs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `job_id` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `base_model` VARCHAR(191) NOT NULL,
    `training_file` VARCHAR(191) NOT NULL,
    `hyperparameters` VARCHAR(191) NOT NULL DEFAULT '{}',
    `app_slug` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finished_at` DATETIME(3) NULL,
    `trained_tokens` INTEGER NULL,
    `result_model` VARCHAR(191) NULL,
    `error` VARCHAR(191) NULL,

    UNIQUE INDEX `fine_tune_jobs_job_id_key`(`job_id`),
    INDEX `fine_tune_jobs_app_slug_idx`(`app_slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `batch_jobs` (
    `id` VARCHAR(191) NOT NULL,
    `app_slug` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `config` VARCHAR(191) NOT NULL DEFAULT '{}',
    `progress` VARCHAR(191) NOT NULL DEFAULT '{}',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `started_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `error` VARCHAR(191) NULL,

    INDEX `batch_jobs_app_slug_idx`(`app_slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `batch_job_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `batch_id` VARCHAR(191) NOT NULL,
    `item_id` VARCHAR(191) NOT NULL,
    `item_index` INTEGER NOT NULL,
    `input` VARCHAR(191) NOT NULL,
    `task_type` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `output` VARCHAR(191) NULL,
    `error` VARCHAR(191) NULL,
    `provider` VARCHAR(191) NULL,
    `model` VARCHAR(191) NULL,
    `latency_ms` INTEGER NULL,
    `tokens` INTEGER NULL,

    INDEX `batch_job_items_batch_id_idx`(`batch_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workflow_definitions` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NOT NULL DEFAULT '',
    `app_slug` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `steps` VARCHAR(191) NOT NULL DEFAULT '{}',
    `entry_step_id` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
    `metadata` VARCHAR(191) NOT NULL DEFAULT '{}',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `workflow_definitions_app_slug_idx`(`app_slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workflow_runs` (
    `id` VARCHAR(191) NOT NULL,
    `workflow_id` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'running',
    `input` VARCHAR(191) NOT NULL DEFAULT '{}',
    `output` VARCHAR(191) NULL,
    `stepResults` VARCHAR(191) NOT NULL DEFAULT '{}',
    `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completed_at` DATETIME(3) NULL,
    `total_latency` INTEGER NOT NULL DEFAULT 0,
    `error` VARCHAR(191) NULL,

    INDEX `workflow_runs_workflow_id_idx`(`workflow_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `prompt_templates` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NOT NULL DEFAULT '',
    `app_slug` VARCHAR(191) NOT NULL,
    `template` VARCHAR(191) NOT NULL,
    `system_prompt` VARCHAR(191) NULL,
    `variables` VARCHAR(191) NOT NULL DEFAULT '[]',
    `version` INTEGER NOT NULL DEFAULT 1,
    `parent_version` INTEGER NULL,
    `tags` VARCHAR(191) NOT NULL DEFAULT '[]',
    `category` VARCHAR(191) NOT NULL DEFAULT 'custom',
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `metrics` VARCHAR(191) NOT NULL DEFAULT '{}',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `prompt_templates_app_slug_idx`(`app_slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `prompt_template_versions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `template_id` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `content` VARCHAR(191) NOT NULL,
    `system_prompt` VARCHAR(191) NULL,
    `metrics` VARCHAR(191) NOT NULL DEFAULT '{}',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `prompt_template_versions_template_id_idx`(`template_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `prompt_ab_tests` (
    `id` VARCHAR(191) NOT NULL,
    `template_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `variant_a` INTEGER NOT NULL,
    `variant_b` INTEGER NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
    `results` VARCHAR(191) NOT NULL DEFAULT '{}',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `started_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,

    INDEX `prompt_ab_tests_template_id_idx`(`template_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `app_strategy_records` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `app_slug` VARCHAR(191) NOT NULL,
    `app_name` VARCHAR(191) NOT NULL,
    `app_type` VARCHAR(191) NOT NULL DEFAULT 'general',
    `goals` VARCHAR(191) NOT NULL DEFAULT '[]',
    `kpis` VARCHAR(191) NOT NULL DEFAULT '[]',
    `recommendations` VARCHAR(191) NOT NULL DEFAULT '[]',
    `strategy_state` VARCHAR(191) NOT NULL DEFAULT 'not_configured',
    `last_updated` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `app_strategy_records_app_slug_key`(`app_slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `webhook_registrations` (
    `id` VARCHAR(191) NOT NULL,
    `app_slug` VARCHAR(191) NOT NULL,
    `url` VARCHAR(191) NOT NULL,
    `secret` VARCHAR(191) NOT NULL,
    `events` VARCHAR(191) NOT NULL DEFAULT '[]',
    `active` BOOLEAN NOT NULL DEFAULT true,
    `metadata` VARCHAR(191) NOT NULL DEFAULT '{}',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `webhook_registrations_app_slug_idx`(`app_slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `webhook_delivery_log` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `webhook_id` VARCHAR(191) NOT NULL,
    `event_id` VARCHAR(191) NOT NULL,
    `event_type` VARCHAR(191) NOT NULL,
    `url` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `status_code` INTEGER NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `max_attempts` INTEGER NOT NULL DEFAULT 5,
    `last_attempt_at` DATETIME(3) NULL,
    `next_retry_at` DATETIME(3) NULL,
    `error` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `webhook_delivery_log_webhook_id_idx`(`webhook_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `app_agents` (
    `id` VARCHAR(191) NOT NULL,
    `app_slug` VARCHAR(191) NOT NULL,
    `app_name` VARCHAR(191) NOT NULL,
    `app_url` VARCHAR(191) NOT NULL DEFAULT '',
    `app_type` VARCHAR(191) NOT NULL DEFAULT 'general',
    `purpose` VARCHAR(191) NOT NULL DEFAULT '',
    `active` BOOLEAN NOT NULL DEFAULT true,
    `tone` VARCHAR(191) NOT NULL DEFAULT 'professional',
    `response_length` VARCHAR(191) NOT NULL DEFAULT 'balanced',
    `creativity` VARCHAR(191) NOT NULL DEFAULT 'balanced',
    `must_show_source_for_quotes` BOOLEAN NOT NULL DEFAULT false,
    `must_use_trusted_sources` BOOLEAN NOT NULL DEFAULT false,
    `can_answer_without_source` VARCHAR(191) NOT NULL DEFAULT 'sometimes',
    `separate_quote_from_explanation` BOOLEAN NOT NULL DEFAULT false,
    `adult_mode` BOOLEAN NOT NULL DEFAULT false,
    `sensitive_topic_mode` VARCHAR(191) NOT NULL DEFAULT 'standard',
    `must_handoff_serious_topics` BOOLEAN NOT NULL DEFAULT false,
    `topics_needing_care` VARCHAR(191) NOT NULL DEFAULT '[]',
    `human_expert_available` BOOLEAN NOT NULL DEFAULT false,
    `handoff_triggers` VARCHAR(191) NOT NULL DEFAULT '[]',
    `human_contact_method` VARCHAR(191) NOT NULL DEFAULT '',
    `knowledge_categories` VARCHAR(191) NOT NULL DEFAULT '[]',
    `knowledge_notes` VARCHAR(191) NOT NULL DEFAULT '',
    `must_always_do` VARCHAR(191) NOT NULL DEFAULT '[]',
    `must_never_do` VARCHAR(191) NOT NULL DEFAULT '[]',
    `admin_notes` VARCHAR(191) NOT NULL DEFAULT '',
    `structured_rules` VARCHAR(191) NOT NULL DEFAULT '[]',
    `budget_mode` VARCHAR(191) NOT NULL DEFAULT 'balanced',
    `allow_premium_only_when_needed` BOOLEAN NOT NULL DEFAULT true,
    `learning_enabled` BOOLEAN NOT NULL DEFAULT false,
    `auto_improvement_enabled` BOOLEAN NOT NULL DEFAULT false,
    `admin_review_required` BOOLEAN NOT NULL DEFAULT true,
    `last_learning_cycle_at` DATETIME(3) NULL,
    `specialty_profile` VARCHAR(191) NOT NULL DEFAULT '{}',
    `weak_areas` VARCHAR(191) NOT NULL DEFAULT '[]',
    `religious_mode` VARCHAR(191) NOT NULL DEFAULT 'none',
    `religious_branch` VARCHAR(191) NOT NULL DEFAULT '',
    `approved_source_packs` VARCHAR(191) NOT NULL DEFAULT '[]',
    `doctrine_aware_routing` BOOLEAN NOT NULL DEFAULT false,
    `crawl_status` VARCHAR(191) NOT NULL DEFAULT 'none',
    `last_crawl_at` DATETIME(3) NULL,
    `crawl_summary` VARCHAR(191) NOT NULL DEFAULT '',
    `detected_niche` VARCHAR(191) NOT NULL DEFAULT '',
    `detected_capabilities` VARCHAR(191) NOT NULL DEFAULT '[]',
    `allowed_capabilities` VARCHAR(191) NOT NULL DEFAULT '["chat","reasoning","code"]',
    `preferred_providers` VARCHAR(191) NOT NULL DEFAULT '[]',
    `preferred_models` VARCHAR(191) NOT NULL DEFAULT '[]',
    `fallback_chain` VARCHAR(191) NOT NULL DEFAULT '[]',
    `voice_style` VARCHAR(191) NOT NULL DEFAULT 'neutral',
    `voice_tone` VARCHAR(191) NOT NULL DEFAULT 'professional',
    `voice_personality` VARCHAR(191) NOT NULL DEFAULT 'helpful',
    `voice_speed` VARCHAR(191) NOT NULL DEFAULT 'normal',
    `voice_gender` VARCHAR(191) NOT NULL DEFAULT 'neutral',
    `voice_accent` VARCHAR(191) NOT NULL DEFAULT '',
    `memory_namespace` VARCHAR(191) NOT NULL DEFAULT '',
    `retrieval_namespace` VARCHAR(191) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `app_agents_app_slug_key`(`app_slug`),
    INDEX `app_agents_app_type_idx`(`app_type`),
    INDEX `app_agents_active_idx`(`active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `system_alerts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `alert_type` VARCHAR(191) NOT NULL,
    `severity` VARCHAR(191) NOT NULL DEFAULT 'warning',
    `title` VARCHAR(191) NOT NULL,
    `message` VARCHAR(191) NOT NULL,
    `app_slug` VARCHAR(191) NULL,
    `metadata` VARCHAR(191) NOT NULL DEFAULT '{}',
    `resolved` BOOLEAN NOT NULL DEFAULT false,
    `resolved_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `system_alerts_alert_type_idx`(`alert_type`),
    INDEX `system_alerts_severity_idx`(`severity`),
    INDEX `system_alerts_resolved_idx`(`resolved`),
    INDEX `system_alerts_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `app_agent_learning_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `agent_id` VARCHAR(191) NOT NULL,
    `cycle_date` DATETIME(3) NOT NULL,
    `cycle_type` VARCHAR(191) NOT NULL DEFAULT 'daily',
    `summary` VARCHAR(191) NOT NULL DEFAULT '',
    `improvements` VARCHAR(191) NOT NULL DEFAULT '[]',
    `metrics` VARCHAR(191) NOT NULL DEFAULT '{}',
    `status` VARCHAR(191) NOT NULL DEFAULT 'completed',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `app_agent_learning_logs_agent_id_idx`(`agent_id`),
    INDEX `app_agent_learning_logs_cycle_date_idx`(`cycle_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `integration_configs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `key` VARCHAR(191) NOT NULL,
    `display_name` VARCHAR(191) NOT NULL,
    `api_key` VARCHAR(191) NOT NULL DEFAULT '',
    `api_url` VARCHAR(191) NOT NULL DEFAULT '',
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `notes` VARCHAR(191) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `integration_configs_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `artifacts` (
    `id` VARCHAR(191) NOT NULL,
    `app_slug` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `sub_type` VARCHAR(191) NOT NULL DEFAULT '',
    `title` VARCHAR(191) NOT NULL DEFAULT '',
    `description` LONGTEXT NOT NULL,
    `provider` VARCHAR(191) NOT NULL DEFAULT '',
    `model` VARCHAR(191) NOT NULL DEFAULT '',
    `trace_id` VARCHAR(191) NOT NULL DEFAULT '',
    `storage_driver` VARCHAR(191) NOT NULL DEFAULT 'local',
    `storage_path` VARCHAR(191) NOT NULL DEFAULT '',
    `storage_url` VARCHAR(191) NOT NULL DEFAULT '',
    `mime_type` VARCHAR(191) NOT NULL DEFAULT '',
    `file_size_bytes` INTEGER NOT NULL DEFAULT 0,
    `previewable` BOOLEAN NOT NULL DEFAULT true,
    `downloadable` BOOLEAN NOT NULL DEFAULT true,
    `status` VARCHAR(191) NOT NULL DEFAULT 'completed',
    `error_message` LONGTEXT NOT NULL,
    `cost_usd_cents` INTEGER NOT NULL DEFAULT 0,
    `metadata` LONGTEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `artifacts_app_slug_idx`(`app_slug`),
    INDEX `artifacts_type_idx`(`type`),
    INDEX `artifacts_status_idx`(`status`),
    INDEX `artifacts_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `app_budget_configs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `app_slug` VARCHAR(191) NOT NULL,
    `monthly_budget_cents` INTEGER NOT NULL DEFAULT 0,
    `daily_budget_cents` INTEGER NOT NULL DEFAULT 0,
    `requests_per_minute` INTEGER NOT NULL DEFAULT 100,
    `requests_per_day` INTEGER NOT NULL DEFAULT 10000,
    `capability_quotas` VARCHAR(191) NOT NULL DEFAULT '{}',
    `premium_toggles` VARCHAR(191) NOT NULL DEFAULT '{}',
    `paused` BOOLEAN NOT NULL DEFAULT false,
    `pause_reason` VARCHAR(191) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `app_budget_configs_app_slug_key`(`app_slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `usage_meters` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `app_slug` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `capability` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(191) NOT NULL,
    `model` VARCHAR(191) NOT NULL DEFAULT '',
    `request_count` INTEGER NOT NULL DEFAULT 0,
    `success_count` INTEGER NOT NULL DEFAULT 0,
    `error_count` INTEGER NOT NULL DEFAULT 0,
    `input_tokens` INTEGER NOT NULL DEFAULT 0,
    `output_tokens` INTEGER NOT NULL DEFAULT 0,
    `cost_usd_cents` INTEGER NOT NULL DEFAULT 0,
    `artifact_count` INTEGER NOT NULL DEFAULT 0,
    `latency_ms_sum` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `usage_meters_app_slug_idx`(`app_slug`),
    INDEX `usage_meters_date_idx`(`date`),
    INDEX `usage_meters_capability_idx`(`capability`),
    UNIQUE INDEX `usage_meters_app_slug_date_capability_provider_model_key`(`app_slug`, `date`, `capability`, `provider`, `model`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `manager_agent_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `manager_type` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `summary` VARCHAR(191) NOT NULL DEFAULT '',
    `details` VARCHAR(191) NOT NULL DEFAULT '{}',
    `severity` VARCHAR(191) NOT NULL DEFAULT 'info',
    `resolved` BOOLEAN NOT NULL DEFAULT false,
    `resolved_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `manager_agent_logs_manager_type_idx`(`manager_type`),
    INDEX `manager_agent_logs_severity_idx`(`severity`),
    INDEX `manager_agent_logs_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workspace_configs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `model_policy` VARCHAR(191) NOT NULL DEFAULT 'best',
    `fixed_model` VARCHAR(191) NULL,
    `enabled_features` VARCHAR(191) NOT NULL DEFAULT '[]',
    `workspace_sessions` VARCHAR(191) NOT NULL DEFAULT '[]',
    `file_contexts` VARCHAR(191) NOT NULL DEFAULT '[]',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workspace_sessions` (
    `id` VARCHAR(191) NOT NULL,
    `trace_id` VARCHAR(191) NOT NULL,
    `model_policy` VARCHAR(191) NOT NULL DEFAULT 'best',
    `resolved_model` VARCHAR(191) NOT NULL DEFAULT '',
    `task_type` VARCHAR(191) NOT NULL DEFAULT 'chat',
    `input` VARCHAR(191) NOT NULL DEFAULT '',
    `output` VARCHAR(191) NULL,
    `file_contexts` VARCHAR(191) NOT NULL DEFAULT '[]',
    `success` BOOLEAN NOT NULL DEFAULT false,
    `latency_ms` INTEGER NULL,
    `error` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `workspace_sessions_created_at_idx`(`created_at`),
    INDEX `workspace_sessions_trace_id_idx`(`trace_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `aiva_conversations` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL DEFAULT 'New Conversation',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `aiva_messages` (
    `id` VARCHAR(191) NOT NULL,
    `conversation_id` VARCHAR(191) NOT NULL,
    `role` VARCHAR(191) NOT NULL,
    `content` VARCHAR(191) NOT NULL,
    `capability` VARCHAR(191) NOT NULL DEFAULT '',
    `provider` VARCHAR(191) NOT NULL DEFAULT '',
    `model` VARCHAR(191) NOT NULL DEFAULT '',
    `output_type` VARCHAR(191) NOT NULL DEFAULT 'text',
    `artifact_id` VARCHAR(191) NULL,
    `fallback_used` BOOLEAN NOT NULL DEFAULT false,
    `warning` VARCHAR(191) NULL,
    `error_message` VARCHAR(191) NULL,
    `metadata` VARCHAR(191) NOT NULL DEFAULT '{}',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `aiva_messages_conversation_id_idx`(`conversation_id`),
    INDEX `aiva_messages_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `aiva_memories` (
    `id` VARCHAR(191) NOT NULL,
    `memory_type` VARCHAR(191) NOT NULL DEFAULT 'preference',
    `key` VARCHAR(191) NOT NULL DEFAULT '',
    `content` VARCHAR(191) NOT NULL,
    `importance` DOUBLE NOT NULL DEFAULT 0.5,
    `tags` VARCHAR(191) NOT NULL DEFAULT '[]',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `aiva_memories_memory_type_idx`(`memory_type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `app_intelligence_profiles` (
    `id` VARCHAR(191) NOT NULL,
    `app_slug` VARCHAR(191) NOT NULL,
    `website_url` VARCHAR(191) NOT NULL DEFAULT '',
    `business_type` VARCHAR(191) NOT NULL DEFAULT '',
    `brand_summary` VARCHAR(191) NOT NULL DEFAULT '',
    `brand_tone` VARCHAR(191) NOT NULL DEFAULT '',
    `target_users` VARCHAR(191) NOT NULL DEFAULT '[]',
    `products_services` VARCHAR(191) NOT NULL DEFAULT '[]',
    `support_knowledge` VARCHAR(191) NOT NULL DEFAULT '',
    `content_topics` VARCHAR(191) NOT NULL DEFAULT '[]',
    `risks` VARCHAR(191) NOT NULL DEFAULT '[]',
    `recommended_capabilities` VARCHAR(191) NOT NULL DEFAULT '[]',
    `recommended_model_package` VARCHAR(191) NOT NULL DEFAULT '{}',
    `crawl_summary` VARCHAR(191) NOT NULL DEFAULT '',
    `crawl_artifact_id` VARCHAR(191) NULL,
    `last_crawled_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `app_intelligence_profiles_app_slug_key`(`app_slug`),
    INDEX `app_intelligence_profiles_app_slug_idx`(`app_slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `aiva_avatar_configs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `state` VARCHAR(191) NOT NULL,
    `artifact_id` VARCHAR(191) NULL,
    `image_url` VARCHAR(191) NOT NULL DEFAULT '',
    `prompt` VARCHAR(191) NOT NULL DEFAULT '',
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `aiva_avatar_configs_state_key`(`state`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `healing_records` (
    `id` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NOT NULL,
    `severity` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `affected_resource` VARCHAR(191) NOT NULL,
    `action_taken` VARCHAR(191) NULL,
    `action_detail` VARCHAR(191) NULL,
    `auto_healed` BOOLEAN NOT NULL DEFAULT false,
    `resolved` BOOLEAN NOT NULL DEFAULT false,
    `resolved_at` DATETIME(3) NULL,
    `detected_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `healing_records_category_idx`(`category`),
    INDEX `healing_records_severity_idx`(`severity`),
    INDEX `healing_records_resolved_idx`(`resolved`),
    INDEX `healing_records_detected_at_idx`(`detected_at`),
    UNIQUE INDEX `healing_records_category_affected_resource_key`(`category`, `affected_resource`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `music_generation_jobs` (
    `id` VARCHAR(191) NOT NULL,
    `app_slug` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `title` VARCHAR(191) NOT NULL DEFAULT '',
    `theme` VARCHAR(191) NOT NULL,
    `genres` VARCHAR(191) NOT NULL DEFAULT '[]',
    `moods` VARCHAR(191) NOT NULL DEFAULT '[]',
    `vocal_style` VARCHAR(191) NOT NULL DEFAULT '',
    `bpm` INTEGER NOT NULL DEFAULT 0,
    `language` VARCHAR(191) NOT NULL DEFAULT 'en',
    `duration_seconds` INTEGER NOT NULL DEFAULT 180,
    `instrumental` BOOLEAN NOT NULL DEFAULT false,
    `cover_art_choice` VARCHAR(191) NOT NULL DEFAULT 'auto',
    `existing_lyrics` VARCHAR(191) NOT NULL DEFAULT '',
    `production_notes` VARCHAR(191) NOT NULL DEFAULT '',
    `artifact_id` VARCHAR(191) NULL,
    `result_json` VARCHAR(191) NULL,
    `error_message` VARCHAR(191) NULL,
    `provider` VARCHAR(191) NOT NULL DEFAULT '',
    `model` VARCHAR(191) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `started_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `music_generation_jobs_app_slug_idx`(`app_slug`),
    INDEX `music_generation_jobs_status_idx`(`status`),
    INDEX `music_generation_jobs_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `capability_registry` (
    `id` VARCHAR(191) NOT NULL,
    `capability_key` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NOT NULL DEFAULT '',
    `category` VARCHAR(191) NOT NULL DEFAULT 'text',
    `required_flags` VARCHAR(191) NOT NULL DEFAULT '[]',
    `allowed_providers` VARCHAR(191) NOT NULL DEFAULT '[]',
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `proof_status` VARCHAR(191) NOT NULL DEFAULT 'SPECULATIVE',
    `source_file` VARCHAR(191) NOT NULL DEFAULT '',
    `proof_file` VARCHAR(191) NOT NULL DEFAULT '',
    `known_issues` VARCHAR(191) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `capability_registry_capability_key_key`(`capability_key`),
    INDEX `capability_registry_category_idx`(`category`),
    INDEX `capability_registry_enabled_idx`(`enabled`),
    INDEX `capability_registry_proof_status_idx`(`proof_status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `provider_capability_map` (
    `id` VARCHAR(191) NOT NULL,
    `provider_key` VARCHAR(191) NOT NULL,
    `capability_key` VARCHAR(191) NOT NULL,
    `models` VARCHAR(191) NOT NULL DEFAULT '[]',
    `endpoints` VARCHAR(191) NOT NULL DEFAULT '[]',
    `proven` BOOLEAN NOT NULL DEFAULT false,
    `proof_type` VARCHAR(191) NOT NULL DEFAULT 'inferred',
    `proof_source` VARCHAR(191) NOT NULL DEFAULT '',
    `last_verified` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `provider_capability_map_provider_key_idx`(`provider_key`),
    INDEX `provider_capability_map_capability_key_idx`(`capability_key`),
    INDEX `provider_capability_map_proven_idx`(`proven`),
    UNIQUE INDEX `provider_capability_map_provider_key_capability_key_key`(`provider_key`, `capability_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `model_discovery_cache` (
    `id` VARCHAR(191) NOT NULL,
    `provider_key` VARCHAR(191) NOT NULL,
    `model_id` VARCHAR(191) NOT NULL,
    `capabilities` VARCHAR(191) NOT NULL DEFAULT '[]',
    `cost_tier` VARCHAR(191) NOT NULL DEFAULT 'medium',
    `latency_tier` VARCHAR(191) NOT NULL DEFAULT 'medium',
    `context_window` INTEGER NOT NULL DEFAULT 4096,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `metadata` VARCHAR(191) NOT NULL DEFAULT '{}',
    `last_seen` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expires_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `model_discovery_cache_provider_key_idx`(`provider_key`),
    INDEX `model_discovery_cache_enabled_idx`(`enabled`),
    INDEX `model_discovery_cache_last_seen_idx`(`last_seen`),
    UNIQUE INDEX `model_discovery_cache_provider_key_model_id_key`(`provider_key`, `model_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `budget_profiles` (
    `id` VARCHAR(191) NOT NULL,
    `profile_key` VARCHAR(191) NOT NULL,
    `display_name` VARCHAR(191) NOT NULL,
    `cost_tier` VARCHAR(191) NOT NULL DEFAULT 'medium',
    `quality_preference` VARCHAR(191) NOT NULL DEFAULT 'medium',
    `latency_preference` VARCHAR(191) NOT NULL DEFAULT 'medium',
    `max_cost_per_request` INTEGER NOT NULL DEFAULT 0,
    `max_fallback_depth` INTEGER NOT NULL DEFAULT 3,
    `allow_premium` BOOLEAN NOT NULL DEFAULT false,
    `allow_streaming` BOOLEAN NOT NULL DEFAULT true,
    `allow_long_running_jobs` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `budget_profiles_profile_key_key`(`profile_key`),
    INDEX `budget_profiles_cost_tier_idx`(`cost_tier`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `avatar_library` (
    `id` VARCHAR(191) NOT NULL,
    `avatar_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `style` VARCHAR(191) NOT NULL DEFAULT 'realistic',
    `provider` VARCHAR(191) NOT NULL DEFAULT 'genx',
    `thumbnail_url` VARCHAR(191) NOT NULL DEFAULT '',
    `voice_id` VARCHAR(191) NOT NULL DEFAULT '',
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `metadata` VARCHAR(191) NOT NULL DEFAULT '{}',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `avatar_library_avatar_id_key`(`avatar_id`),
    INDEX `avatar_library_provider_idx`(`provider`),
    INDEX `avatar_library_enabled_idx`(`enabled`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `voice_library` (
    `id` VARCHAR(191) NOT NULL,
    `voice_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(191) NOT NULL DEFAULT 'genx',
    `model` VARCHAR(191) NOT NULL DEFAULT '',
    `gender` VARCHAR(191) NOT NULL DEFAULT 'neutral',
    `accent` VARCHAR(191) NOT NULL DEFAULT '',
    `language` VARCHAR(191) NOT NULL DEFAULT 'en',
    `style` VARCHAR(191) NOT NULL DEFAULT 'neutral',
    `preview_url` VARCHAR(191) NOT NULL DEFAULT '',
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `metadata` VARCHAR(191) NOT NULL DEFAULT '{}',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `voice_library_voice_id_key`(`voice_id`),
    INDEX `voice_library_provider_idx`(`provider`),
    INDEX `voice_library_enabled_idx`(`enabled`),
    INDEX `voice_library_language_idx`(`language`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `campaigns` (
    `id` VARCHAR(191) NOT NULL,
    `workspace_id` VARCHAR(191) NOT NULL DEFAULT '',
    `app_slug` VARCHAR(191) NOT NULL,
    `brand_id` VARCHAR(191) NOT NULL DEFAULT '',
    `name` VARCHAR(191) NOT NULL,
    `goal` VARCHAR(191) NOT NULL,
    `target_audience` VARCHAR(191) NOT NULL DEFAULT '',
    `platforms` VARCHAR(191) NOT NULL DEFAULT '[]',
    `content_types` VARCHAR(191) NOT NULL DEFAULT '[]',
    `budget_tier` VARCHAR(191) NOT NULL DEFAULT 'balanced',
    `quality_tier` VARCHAR(191) NOT NULL DEFAULT 'standard',
    `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
    `approval_mode` VARCHAR(191) NOT NULL DEFAULT 'auto',
    `duration_days` INTEGER NOT NULL DEFAULT 7,
    `website_url` VARCHAR(191) NOT NULL DEFAULT '',
    `workflow_id` VARCHAR(191) NOT NULL DEFAULT '',
    `metadata` VARCHAR(191) NOT NULL DEFAULT '{}',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `campaigns_app_slug_idx`(`app_slug`),
    INDEX `campaigns_status_idx`(`status`),
    INDEX `campaigns_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `campaign_items` (
    `id` VARCHAR(191) NOT NULL,
    `campaign_id` VARCHAR(191) NOT NULL,
    `platform` VARCHAR(191) NOT NULL,
    `content_type` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL DEFAULT '',
    `caption` VARCHAR(191) NOT NULL DEFAULT '',
    `script` VARCHAR(191) NOT NULL DEFAULT '',
    `hashtags` VARCHAR(191) NOT NULL DEFAULT '[]',
    `prompt_summary` VARCHAR(191) NOT NULL DEFAULT '',
    `scheduled_for` DATETIME(3) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
    `approval_status` VARCHAR(191) NOT NULL DEFAULT 'draft',
    `approval_notes` VARCHAR(191) NOT NULL DEFAULT '',
    `metadata` VARCHAR(191) NOT NULL DEFAULT '{}',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `campaign_items_campaign_id_idx`(`campaign_id`),
    INDEX `campaign_items_platform_idx`(`platform`),
    INDEX `campaign_items_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `generated_assets` (
    `id` VARCHAR(191) NOT NULL,
    `workspace_id` VARCHAR(191) NOT NULL DEFAULT '',
    `app_slug` VARCHAR(191) NOT NULL,
    `brand_id` VARCHAR(191) NOT NULL DEFAULT '',
    `campaign_id` VARCHAR(191) NULL,
    `campaign_item_id` VARCHAR(191) NULL,
    `asset_type` VARCHAR(191) NOT NULL,
    `capability` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'processing',
    `approval_status` VARCHAR(191) NOT NULL DEFAULT 'draft',
    `approval_notes` VARCHAR(191) NOT NULL DEFAULT '',
    `runtime_selected_provider` VARCHAR(191) NOT NULL DEFAULT '',
    `runtime_selected_model` VARCHAR(191) NOT NULL DEFAULT '',
    `fallback_used` BOOLEAN NOT NULL DEFAULT false,
    `generation_mode` VARCHAR(191) NOT NULL DEFAULT '',
    `prompt_summary` VARCHAR(191) NOT NULL DEFAULT '',
    `source_inputs` VARCHAR(191) NOT NULL DEFAULT '{}',
    `result_url` VARCHAR(191) NULL,
    `result_file_path` VARCHAR(191) NULL,
    `thumbnail_url` VARCHAR(191) NULL,
    `mime_type` VARCHAR(191) NULL,
    `duration_seconds` DOUBLE NULL,
    `width` INTEGER NULL,
    `height` INTEGER NULL,
    `cost_credits` DOUBLE NULL,
    `latency_ms` INTEGER NULL,
    `error` VARCHAR(191) NULL,
    `metadata` VARCHAR(191) NOT NULL DEFAULT '{}',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `generated_assets_app_slug_idx`(`app_slug`),
    INDEX `generated_assets_campaign_id_idx`(`campaign_id`),
    INDEX `generated_assets_campaign_item_id_idx`(`campaign_item_id`),
    INDEX `generated_assets_status_idx`(`status`),
    INDEX `generated_assets_asset_type_idx`(`asset_type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `asset_versions` (
    `id` VARCHAR(191) NOT NULL,
    `asset_id` VARCHAR(191) NOT NULL,
    `version_number` INTEGER NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
    `result_url` VARCHAR(191) NULL,
    `result_file_path` VARCHAR(191) NULL,
    `thumbnail_url` VARCHAR(191) NULL,
    `prompt_summary` VARCHAR(191) NOT NULL DEFAULT '',
    `source_inputs` VARCHAR(191) NOT NULL DEFAULT '{}',
    `provider` VARCHAR(191) NOT NULL DEFAULT '',
    `model` VARCHAR(191) NOT NULL DEFAULT '',
    `cost_credits` DOUBLE NULL,
    `latency_ms` INTEGER NULL,
    `metadata` VARCHAR(191) NOT NULL DEFAULT '{}',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `asset_versions_asset_id_idx`(`asset_id`),
    INDEX `asset_versions_version_number_idx`(`version_number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `publishing_schedules` (
    `id` VARCHAR(191) NOT NULL,
    `workspace_id` VARCHAR(191) NOT NULL DEFAULT '',
    `app_slug` VARCHAR(191) NOT NULL,
    `campaign_id` VARCHAR(191) NULL,
    `campaign_item_id` VARCHAR(191) NULL,
    `asset_id` VARCHAR(191) NULL,
    `agent_id` VARCHAR(191) NULL,
    `platform` VARCHAR(191) NOT NULL DEFAULT 'generic_export',
    `scheduled_for` DATETIME(3) NOT NULL,
    `timezone` VARCHAR(191) NOT NULL DEFAULT 'UTC',
    `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
    `block_reason` VARCHAR(191) NULL,
    `attempt_count` INTEGER NOT NULL DEFAULT 0,
    `max_attempts` INTEGER NOT NULL DEFAULT 3,
    `last_attempt_at` DATETIME(3) NULL,
    `next_retry_at` DATETIME(3) NULL,
    `error` VARCHAR(191) NULL,
    `metadata` VARCHAR(191) NOT NULL DEFAULT '{}',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `publishing_schedules_app_slug_idx`(`app_slug`),
    INDEX `publishing_schedules_campaign_id_idx`(`campaign_id`),
    INDEX `publishing_schedules_status_idx`(`status`),
    INDEX `publishing_schedules_scheduled_for_idx`(`scheduled_for`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `publishing_results` (
    `id` VARCHAR(191) NOT NULL,
    `workspace_id` VARCHAR(191) NOT NULL DEFAULT '',
    `app_slug` VARCHAR(191) NOT NULL,
    `campaign_id` VARCHAR(191) NULL,
    `campaign_item_id` VARCHAR(191) NULL,
    `asset_ids` VARCHAR(191) NOT NULL DEFAULT '[]',
    `platform` VARCHAR(191) NOT NULL DEFAULT 'generic_export',
    `status` VARCHAR(191) NOT NULL DEFAULT 'not_ready',
    `provider` VARCHAR(191) NOT NULL DEFAULT '',
    `external_post_id` VARCHAR(191) NULL,
    `external_post_url` VARCHAR(191) NULL,
    `export_package_id` VARCHAR(191) NULL,
    `error` VARCHAR(191) NULL,
    `published_at` DATETIME(3) NULL,
    `metadata` VARCHAR(191) NOT NULL DEFAULT '{}',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `publishing_results_app_slug_idx`(`app_slug`),
    INDEX `publishing_results_campaign_id_idx`(`campaign_id`),
    INDEX `publishing_results_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `campaign_analytics` (
    `id` VARCHAR(191) NOT NULL,
    `workspace_id` VARCHAR(191) NOT NULL DEFAULT '',
    `app_slug` VARCHAR(191) NOT NULL,
    `campaign_id` VARCHAR(191) NULL,
    `campaign_item_id` VARCHAR(191) NULL,
    `asset_id` VARCHAR(191) NULL,
    `platform` VARCHAR(191) NOT NULL DEFAULT 'generic',
    `external_post_id` VARCHAR(191) NULL,
    `metric_name` VARCHAR(191) NOT NULL,
    `metric_value` DOUBLE NOT NULL,
    `metric_unit` VARCHAR(191) NULL,
    `captured_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `source` VARCHAR(191) NOT NULL DEFAULT 'manual',
    `metadata` VARCHAR(191) NOT NULL DEFAULT '{}',

    INDEX `campaign_analytics_app_slug_idx`(`app_slug`),
    INDEX `campaign_analytics_campaign_id_idx`(`campaign_id`),
    INDEX `campaign_analytics_platform_idx`(`platform`),
    INDEX `campaign_analytics_metric_name_idx`(`metric_name`),
    INDEX `campaign_analytics_captured_at_idx`(`captured_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `recurring_campaign_schedules` (
    `id` VARCHAR(191) NOT NULL,
    `workspace_id` VARCHAR(191) NOT NULL DEFAULT '',
    `app_slug` VARCHAR(191) NOT NULL,
    `campaign_id` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `frequency` VARCHAR(191) NOT NULL DEFAULT 'weekly',
    `cron_expression` VARCHAR(191) NULL,
    `start_date` DATETIME(3) NOT NULL,
    `end_date` DATETIME(3) NULL,
    `max_runs` INTEGER NULL,
    `run_count` INTEGER NOT NULL DEFAULT 0,
    `last_run_at` DATETIME(3) NULL,
    `next_run_at` DATETIME(3) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'active',
    `error` VARCHAR(191) NULL,
    `metadata` VARCHAR(191) NOT NULL DEFAULT '{}',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `recurring_campaign_schedules_app_slug_idx`(`app_slug`),
    INDEX `recurring_campaign_schedules_status_idx`(`status`),
    INDEX `recurring_campaign_schedules_next_run_at_idx`(`next_run_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `app_connections` (
    `id` VARCHAR(191) NOT NULL,
    `app_slug` VARCHAR(191) NOT NULL,
    `app_name` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'active',
    `allowed_capabilities` VARCHAR(191) NOT NULL DEFAULT '[]',
    `daily_budget_cents` INTEGER NOT NULL DEFAULT 0,
    `token_balance` INTEGER NOT NULL DEFAULT 1000,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `app_connections_app_slug_key`(`app_slug`),
    INDEX `app_connections_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `app_api_keys` (
    `id` VARCHAR(191) NOT NULL,
    `connection_id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL DEFAULT 'default',
    `active` BOOLEAN NOT NULL DEFAULT true,
    `last_used_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `app_api_keys_key_key`(`key`),
    INDEX `app_api_keys_connection_id_idx`(`connection_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `jobs` (
    `id` VARCHAR(191) NOT NULL,
    `app_slug` VARCHAR(191) NOT NULL,
    `capability` VARCHAR(191) NOT NULL,
    `prompt` VARCHAR(191) NOT NULL,
    `input_json` LONGTEXT NOT NULL,
    `metadata_json` LONGTEXT NOT NULL,
    `trace_id` VARCHAR(191) NOT NULL DEFAULT '',
    `status` VARCHAR(191) NOT NULL DEFAULT 'queued',
    `provider` VARCHAR(191) NULL DEFAULT '',
    `model` VARCHAR(191) NULL DEFAULT '',
    `artifact_id` VARCHAR(191) NULL,
    `progress` INTEGER NOT NULL DEFAULT 0,
    `output` LONGTEXT NULL,
    `error` LONGTEXT NULL,
    `callback_url` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `started_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `jobs_app_slug_idx`(`app_slug`),
    INDEX `jobs_status_idx`(`status`),
    INDEX `jobs_trace_id_idx`(`trace_id`),
    INDEX `jobs_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `app_integrations` ADD CONSTRAINT `app_integrations_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `app_metric_definitions` ADD CONSTRAINT `app_metric_definitions_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `app_metric_points` ADD CONSTRAINT `app_metric_points_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `app_events` ADD CONSTRAINT `app_events_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vps_resource_snapshots` ADD CONSTRAINT `vps_resource_snapshots_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dashboard_widget_configs` ADD CONSTRAINT `dashboard_widget_configs_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `github_push_logs` ADD CONSTRAINT `github_push_logs_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `playground_projects`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `repo_tasks` ADD CONSTRAINT `repo_tasks_repo_workspace_id_fkey` FOREIGN KEY (`repo_workspace_id`) REFERENCES `repo_workspaces`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `repo_patches` ADD CONSTRAINT `repo_patches_repo_workspace_id_fkey` FOREIGN KEY (`repo_workspace_id`) REFERENCES `repo_workspaces`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `repo_patches` ADD CONSTRAINT `repo_patches_repo_task_id_fkey` FOREIGN KEY (`repo_task_id`) REFERENCES `repo_tasks`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `batch_job_items` ADD CONSTRAINT `batch_job_items_batch_id_fkey` FOREIGN KEY (`batch_id`) REFERENCES `batch_jobs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workflow_runs` ADD CONSTRAINT `workflow_runs_workflow_id_fkey` FOREIGN KEY (`workflow_id`) REFERENCES `workflow_definitions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prompt_template_versions` ADD CONSTRAINT `prompt_template_versions_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `prompt_templates`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prompt_ab_tests` ADD CONSTRAINT `prompt_ab_tests_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `prompt_templates`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `webhook_delivery_log` ADD CONSTRAINT `webhook_delivery_log_webhook_id_fkey` FOREIGN KEY (`webhook_id`) REFERENCES `webhook_registrations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `app_agent_learning_logs` ADD CONSTRAINT `app_agent_learning_logs_agent_id_fkey` FOREIGN KEY (`agent_id`) REFERENCES `app_agents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `aiva_messages` ADD CONSTRAINT `aiva_messages_conversation_id_fkey` FOREIGN KEY (`conversation_id`) REFERENCES `aiva_conversations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `provider_capability_map` ADD CONSTRAINT `provider_capability_map_capability_key_fkey` FOREIGN KEY (`capability_key`) REFERENCES `capability_registry`(`capability_key`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `campaign_items` ADD CONSTRAINT `campaign_items_campaign_id_fkey` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `generated_assets` ADD CONSTRAINT `generated_assets_campaign_id_fkey` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `generated_assets` ADD CONSTRAINT `generated_assets_campaign_item_id_fkey` FOREIGN KEY (`campaign_item_id`) REFERENCES `campaign_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `asset_versions` ADD CONSTRAINT `asset_versions_asset_id_fkey` FOREIGN KEY (`asset_id`) REFERENCES `generated_assets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `app_api_keys` ADD CONSTRAINT `app_api_keys_connection_id_fkey` FOREIGN KEY (`connection_id`) REFERENCES `app_connections`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey

