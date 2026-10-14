-- Flexible manual archive cell text (display layer; typed columns unchanged).
ALTER TABLE "archive_rows" ADD COLUMN "manual_cell_values" JSONB NOT NULL DEFAULT '{}';
