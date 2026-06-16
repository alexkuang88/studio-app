-- ============================================================
-- 朋友系统 Schema 升级 — 一次性修复所有差异
-- 在朋友 Supabase SQL Editor 全部执行:
-- https://supabase.com/dashboard/project/qzhyfkfotixaoyhwnsok/sql/new
-- ============================================================

-- ===== orders 缺的列 =====
ALTER TABLE orders ADD COLUMN IF NOT EXISTS initial_balance DECIMAL(12,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_client_amount DECIMAL(12,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_amount DECIMAL(12,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS unit_price DECIMAL(12,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_revenue DECIMAL(12,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_paused_seconds DECIMAL(12,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS latest_balance DECIMAL(12,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS working_note TEXT;

-- ===== work_sessions 缺的列 =====
ALTER TABLE work_sessions ADD COLUMN IF NOT EXISTS balance_gap DECIMAL(12,2) DEFAULT 0;
ALTER TABLE work_sessions ADD COLUMN IF NOT EXISTS gap_reason TEXT;
ALTER TABLE work_sessions ADD COLUMN IF NOT EXISTS current_balance DECIMAL(12,2);
ALTER TABLE work_sessions ADD COLUMN IF NOT EXISTS last_checkpoint_at TIMESTAMPTZ;

-- ===== 最关键: 修复 orders.status 的 CHECK 约束，加入 paused =====
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status IN ('not_started', 'in_progress', 'ready_to_complete', 'completed', 'overdue', 'cancelled', 'paused'));

-- ===== 修复 RLS 递归 =====
DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Admin can insert profiles" ON profiles;
CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "profiles_insert" ON profiles FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Admin can insert employees" ON employees;
DROP POLICY IF EXISTS "Admin can update employees" ON employees;
DROP POLICY IF EXISTS "Admin can delete employees" ON employees;
CREATE POLICY "employees_insert" ON employees FOR INSERT WITH CHECK (true);
CREATE POLICY "employees_update" ON employees FOR UPDATE USING (true);
CREATE POLICY "employees_delete" ON employees FOR DELETE USING (true);

DROP POLICY IF EXISTS "Admin can insert machines" ON machines;
DROP POLICY IF EXISTS "Admin can update machines" ON machines;
DROP POLICY IF EXISTS "Admin can delete machines" ON machines;
CREATE POLICY "machines_insert" ON machines FOR INSERT WITH CHECK (true);
CREATE POLICY "machines_update" ON machines FOR UPDATE USING (true);
CREATE POLICY "machines_delete" ON machines FOR DELETE USING (true);

DROP POLICY IF EXISTS "Admin can insert/update settings" ON settings;
DROP POLICY IF EXISTS "Admin can update settings" ON settings;
CREATE POLICY "settings_insert" ON settings FOR INSERT WITH CHECK (true);
CREATE POLICY "settings_update" ON settings FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Admin can insert salary_locks" ON salary_locks;
DROP POLICY IF EXISTS "Admin can delete salary_locks" ON salary_locks;
CREATE POLICY "salary_locks_insert" ON salary_locks FOR INSERT WITH CHECK (true);
CREATE POLICY "salary_locks_delete" ON salary_locks FOR DELETE USING (true);

DROP POLICY IF EXISTS "Admin can read audit_logs" ON audit_logs;
CREATE POLICY "audit_logs_select" ON audit_logs FOR SELECT USING (true);
