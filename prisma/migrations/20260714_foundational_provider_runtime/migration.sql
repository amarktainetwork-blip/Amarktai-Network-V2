-- Additive runtime truth used by canonical Orchestra model matching.
ALTER TABLE `model_registry_entries`
  ADD COLUMN `supports_music_generation` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `capabilities_json` LONGTEXT NOT NULL DEFAULT '[]';
