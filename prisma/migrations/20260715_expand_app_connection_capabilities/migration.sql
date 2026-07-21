-- Expand the canonical capability JSON without rewriting prior migration history.
-- Existing values are preserved; the column is not indexed.
ALTER TABLE `app_connections`
    MODIFY `allowed_capabilities` VARCHAR(4096) NOT NULL DEFAULT '[]';
