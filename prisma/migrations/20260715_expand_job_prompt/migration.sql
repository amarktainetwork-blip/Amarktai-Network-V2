-- Job prompts include normalized media prompts and generated long-form scene
-- prompts, both of which intentionally exceed MariaDB's default VARCHAR(191).
ALTER TABLE `jobs` MODIFY `prompt` TEXT NOT NULL;
