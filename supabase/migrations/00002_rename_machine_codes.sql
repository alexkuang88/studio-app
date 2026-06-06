-- Rename M07->M007, M10->M010, M16->M016, M20->M020 for correct alphanumeric sorting
-- Run in Supabase SQL Editor: https://supabase.com/dashboard/project/siriqcgcgbvakxfjtrre/sql/new

BEGIN;

UPDATE machines SET machine_code = 'M007' WHERE machine_code = 'M07';
UPDATE machines SET machine_code = 'M010' WHERE machine_code = 'M10';
UPDATE machines SET machine_code = 'M016' WHERE machine_code = 'M16';
UPDATE machines SET machine_code = 'M020' WHERE machine_code = 'M20';

-- Verify
SELECT id, machine_code, machine_name FROM machines WHERE machine_code IN ('M007', 'M010', 'M016', 'M020');

COMMIT;
