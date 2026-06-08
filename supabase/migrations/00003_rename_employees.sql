-- Rename N10->N010, N25->N011 for correct alphanumeric sorting
-- Delete N21-N24 (mistakenly entered training employees)
-- Run in Supabase SQL Editor: https://supabase.com/dashboard/project/siriqcgcgbvakxfjtrre/sql/new

BEGIN;

UPDATE employees SET employee_code = 'N010' WHERE employee_code = 'N10';
UPDATE employees SET employee_code = 'N011' WHERE employee_code = 'N25';

DELETE FROM work_sessions WHERE employee_id IN (SELECT id FROM employees WHERE employee_code IN ('N21','N22','N23','N24'));
DELETE FROM employees WHERE employee_code IN ('N21','N22','N23','N24');

COMMIT;
