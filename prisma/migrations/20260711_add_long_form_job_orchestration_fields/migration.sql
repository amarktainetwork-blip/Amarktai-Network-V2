-- AlterTable: Add durable long-form orchestration fields to existing jobs.
-- Safe for existing rows: all new columns are nullable or have defaults.
ALTER TABLE `jobs`
  ADD COLUMN `parent_job_id` VARCHAR(191) NULL,
  ADD COLUMN `execution_id` VARCHAR(191) NOT NULL DEFAULT '',
  ADD COLUMN `scene_number` INTEGER NULL,
  ADD COLUMN `workflow_phase` VARCHAR(191) NOT NULL DEFAULT '',
  ADD COLUMN `retry_count` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `queue_job_id` VARCHAR(191) NOT NULL DEFAULT '',
  ADD COLUMN `queued_at` DATETIME(3) NULL;

-- CreateIndex: Exact parent/child and execution lookup for durable long-form recovery.
CREATE INDEX `jobs_parent_job_id_idx` ON `jobs`(`parent_job_id`);
CREATE INDEX `jobs_execution_id_idx` ON `jobs`(`execution_id`);
CREATE INDEX `jobs_app_slug_execution_id_idx` ON `jobs`(`app_slug`, `execution_id`);
CREATE INDEX `jobs_parent_job_id_scene_number_idx` ON `jobs`(`parent_job_id`, `scene_number`);

-- AddForeignKey: Self-reference for long-form parent/scene linkage.
ALTER TABLE `jobs`
  ADD CONSTRAINT `jobs_parent_job_id_fkey`
  FOREIGN KEY (`parent_job_id`) REFERENCES `jobs`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
