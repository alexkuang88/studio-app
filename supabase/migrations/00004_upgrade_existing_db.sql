-- ============================================================
-- 已有数据库升级脚本 (幂等，可重复执行)
-- 用于朋友系统: https://supabase.com/dashboard/project/qzhyfkfotixaoyhwnsok/sql/new
-- ============================================================

-- 补充 orders 缺列
ALTER TABLE orders ADD COLUMN IF NOT EXISTS initial_balance DECIMAL(12,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_client_amount DECIMAL(12,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_amount DECIMAL(12,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS unit_price DECIMAL(12,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_revenue DECIMAL(12,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_paused_seconds DECIMAL(12,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS latest_balance DECIMAL(12,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS working_note TEXT;

-- 补充 work_sessions 缺列
ALTER TABLE work_sessions ADD COLUMN IF NOT EXISTS balance_gap DECIMAL(12,2) DEFAULT 0;
ALTER TABLE work_sessions ADD COLUMN IF NOT EXISTS gap_reason TEXT;
ALTER TABLE work_sessions ADD COLUMN IF NOT EXISTS current_balance DECIMAL(12,2);
ALTER TABLE work_sessions ADD COLUMN IF NOT EXISTS last_checkpoint_at TIMESTAMPTZ;

-- 修复 paused 约束
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status IN ('not_started', 'in_progress', 'ready_to_complete', 'completed', 'overdue', 'cancelled', 'paused'));

-- 替换所有 RLS 策略为无递归版本
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "profiles_insert" ON profiles FOR INSERT WITH CHECK (true);

CREATE POLICY "employees_select" ON employees FOR SELECT USING (true);
CREATE POLICY "employees_insert" ON employees FOR INSERT WITH CHECK (true);
CREATE POLICY "employees_update" ON employees FOR UPDATE USING (true);
CREATE POLICY "employees_delete" ON employees FOR DELETE USING (true);

CREATE POLICY "machines_select" ON machines FOR SELECT USING (true);
CREATE POLICY "machines_insert" ON machines FOR INSERT WITH CHECK (true);
CREATE POLICY "machines_update" ON machines FOR UPDATE USING (true);
CREATE POLICY "machines_delete" ON machines FOR DELETE USING (true);

CREATE POLICY "orders_select" ON orders FOR SELECT USING (true);
CREATE POLICY "orders_insert" ON orders FOR INSERT WITH CHECK (true);
CREATE POLICY "orders_update" ON orders FOR UPDATE USING (true);

CREATE POLICY "work_sessions_select" ON work_sessions FOR SELECT USING (true);
CREATE POLICY "work_sessions_insert" ON work_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "work_sessions_update" ON work_sessions FOR UPDATE USING (true);

CREATE POLICY "salary_locks_select" ON salary_locks FOR SELECT USING (true);
CREATE POLICY "salary_locks_insert" ON salary_locks FOR INSERT WITH CHECK (true);
CREATE POLICY "salary_locks_delete" ON salary_locks FOR DELETE USING (true);

CREATE POLICY "settings_select" ON settings FOR SELECT USING (true);
CREATE POLICY "settings_insert" ON settings FOR INSERT WITH CHECK (true);
CREATE POLICY "settings_update" ON settings FOR UPDATE USING (true);

CREATE POLICY "audit_logs_select" ON audit_logs FOR SELECT USING (true);
CREATE POLICY "audit_logs_insert" ON audit_logs FOR INSERT WITH CHECK (true);
