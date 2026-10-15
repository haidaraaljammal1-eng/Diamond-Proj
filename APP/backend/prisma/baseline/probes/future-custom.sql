-- Disposable probe. Not a production migration.
-- The scenario runner copies this file into a temporary migration directory
-- and deletes that directory before it exits.

CREATE FUNCTION diamond_phase1_future_probe()
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS 'SELECT 1';
