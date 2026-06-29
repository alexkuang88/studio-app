-- ============================================================
-- Studio Manager - Complete Initial Database Schema
-- 完整建表，包含所有生产列 + paused约束 + 无递归RLS
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. profiles
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'operator')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 2. employees
-- ============================================================
CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_code TEXT NOT NULL UNIQUE,
  chinese_name TEXT NOT NULL,
  local_name TEXT,
  phone TEXT,
  facebook TEXT,
  status TEXT NOT NULL DEFAULT 'training' CHECK (status IN ('training', 'official', 'advanced', 'suspended', 'left')),
  can_take_order BOOLEAN DEFAULT false,
  note TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 3. machines
-- ============================================================
CREATE TABLE IF NOT EXISTS machines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_code TEXT NOT NULL UNIQUE,
  machine_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'in_use', 'repair', 'disabled')),
  note TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 4. orders (完整生产列，含 paused 状态)
-- ============================================================
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_code TEXT NOT NULL UNIQUE,
  order_source TEXT NOT NULL CHECK (order_source IN ('Douyin','WeChat','Old client','Agent order','Referral','Other','agent1','agent2','agent3','agent4','agent5','xianyu')),
  client_note TEXT,
  target_amount DECIMAL(12,2) NOT NULL,
  completed_amount DECIMAL(12,2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'ready_to_complete', 'completed', 'overdue', 'cancelled', 'paused')),
  current_employee_id UUID REFERENCES employees(id),
  current_machine_id UUID REFERENCES machines(id),
  order_received_at TIMESTAMPTZ NOT NULL,
  expected_completion_at TIMESTAMPTZ NOT NULL,
  actual_completed_at TIMESTAMPTZ,
  responsible_user TEXT,
  note TEXT,
  completion_note TEXT,
  force_complete_reason TEXT,
  created_by UUID REFERENCES profiles(id),
  is_void BOOLEAN DEFAULT false,
  void_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  -- 后续新增列
  initial_balance DECIMAL(12,2) DEFAULT 0,
  total_client_amount DECIMAL(12,2) DEFAULT 0,
  order_amount DECIMAL(12,2),
  unit_price DECIMAL(12,2) DEFAULT 0,
  order_revenue DECIMAL(12,2) DEFAULT 0,
  paused_at TIMESTAMPTZ,
  total_paused_seconds DECIMAL(12,2) DEFAULT 0,
  latest_balance DECIMAL(12,2),
  working_note TEXT,
  -- 对账结算
  is_settled BOOLEAN DEFAULT false,
  settled_amount DECIMAL(12,2),
  settled_at TIMESTAMPTZ,
  settled_note TEXT
);

-- ============================================================
-- 5. work_sessions (完整生产列)
-- ============================================================
CREATE TABLE IF NOT EXISTS work_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  machine_id UUID NOT NULL REFERENCES machines(id) ON DELETE RESTRICT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  start_amount DECIMAL(12,2) NOT NULL,
  end_amount DECIMAL(12,2),
  result_amount DECIMAL(12,2),
  work_hours DECIMAL(6,2),
  efficiency DECIMAL(6,2),
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'void')),
  note TEXT,
  void_reason TEXT,
  created_by UUID REFERENCES profiles(id),
  voided_by UUID REFERENCES profiles(id),
  voided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  -- 后续新增列
  balance_gap DECIMAL(12,2) DEFAULT 0,
  gap_reason TEXT,
  current_balance DECIMAL(12,2),
  last_checkpoint_at TIMESTAMPTZ
);

-- ============================================================
-- 6. salary_advances — 工资预支
-- ============================================================
CREATE TABLE IF NOT EXISTS salary_advances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id),
  amount DECIMAL(12,2) NOT NULL,
  month TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_salary_advances_employee ON salary_advances(employee_id);
CREATE INDEX IF NOT EXISTS idx_salary_advances_month ON salary_advances(month);

-- ============================================================
-- 7. salary_locks
-- ============================================================
CREATE TABLE IF NOT EXISTS salary_locks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month TEXT NOT NULL UNIQUE,
  locked_by UUID NOT NULL REFERENCES profiles(id),
  locked_at TIMESTAMPTZ DEFAULT now(),
  note TEXT
);

-- ============================================================
-- 7. settings
-- ============================================================
CREATE TABLE IF NOT EXISTS settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  description TEXT,
  updated_by UUID REFERENCES profiles(id),
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO settings (key, value, description) VALUES
  ('salary_rate', '700', '工资单价 Ar/100万'),
  ('minimum_efficiency', '150', '最低达标效率 万/小时'),
  ('advanced_efficiency', '200', '高级效率 万/小时'),
  ('warning_hours_before_overdue', '2', '订单超时前提醒小时数')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- 8. audit_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  action TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id UUID,
  before_data JSONB,
  after_data JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_work_sessions_order ON work_sessions(order_id);
CREATE INDEX IF NOT EXISTS idx_work_sessions_employee ON work_sessions(employee_id);
CREATE INDEX IF NOT EXISTS idx_work_sessions_machine ON work_sessions(machine_id);
CREATE INDEX IF NOT EXISTS idx_work_sessions_status ON work_sessions(status);
CREATE INDEX IF NOT EXISTS idx_work_sessions_start_time ON work_sessions(start_time);
CREATE INDEX IF NOT EXISTS idx_work_sessions_end_time ON work_sessions(end_time);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_order_received ON orders(order_received_at);
CREATE INDEX IF NOT EXISTS idx_orders_current_employee ON orders(current_employee_id);
CREATE INDEX IF NOT EXISTS idx_orders_current_machine ON orders(current_machine_id);
CREATE INDEX IF NOT EXISTS idx_orders_expected_completion ON orders(expected_completion_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_table ON audit_logs(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);

-- ============================================================
-- Partial unique indexes (防呆)
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_running_per_order ON work_sessions(order_id) WHERE status = 'running';
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_running_per_machine ON work_sessions(machine_id) WHERE status = 'running';
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_running_per_employee ON work_sessions(employee_id) WHERE status = 'running';

-- ============================================================
-- Auto-update updated_at trigger
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_employees_updated_at ON employees;
CREATE TRIGGER update_employees_updated_at BEFORE UPDATE ON employees FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_machines_updated_at ON machines;
CREATE TRIGGER update_machines_updated_at BEFORE UPDATE ON machines FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_orders_updated_at ON orders;
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_work_sessions_updated_at ON work_sessions;
CREATE TRIGGER update_work_sessions_updated_at BEFORE UPDATE ON work_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Auto-create profile on signup
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data ->> 'name', split_part(NEW.email, '@', 1)), 'operator');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- RLS (无递归版本)
-- ============================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- profiles (无自引用，避免递归)
DROP POLICY IF EXISTS "profiles_select" ON profiles;
DROP POLICY IF EXISTS "profiles_update" ON profiles;
DROP POLICY IF EXISTS "profiles_insert" ON profiles;
CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "profiles_insert" ON profiles FOR INSERT WITH CHECK (true);

-- employees
DROP POLICY IF EXISTS "employees_select" ON employees;
DROP POLICY IF EXISTS "employees_insert" ON employees;
DROP POLICY IF EXISTS "employees_update" ON employees;
DROP POLICY IF EXISTS "employees_delete" ON employees;
CREATE POLICY "employees_select" ON employees FOR SELECT USING (true);
CREATE POLICY "employees_insert" ON employees FOR INSERT WITH CHECK (true);
CREATE POLICY "employees_update" ON employees FOR UPDATE USING (true);
CREATE POLICY "employees_delete" ON employees FOR DELETE USING (true);

-- machines
DROP POLICY IF EXISTS "machines_select" ON machines;
DROP POLICY IF EXISTS "machines_insert" ON machines;
DROP POLICY IF EXISTS "machines_update" ON machines;
DROP POLICY IF EXISTS "machines_delete" ON machines;
CREATE POLICY "machines_select" ON machines FOR SELECT USING (true);
CREATE POLICY "machines_insert" ON machines FOR INSERT WITH CHECK (true);
CREATE POLICY "machines_update" ON machines FOR UPDATE USING (true);
CREATE POLICY "machines_delete" ON machines FOR DELETE USING (true);

-- orders
DROP POLICY IF EXISTS "orders_select" ON orders;
DROP POLICY IF EXISTS "orders_insert" ON orders;
DROP POLICY IF EXISTS "orders_update" ON orders;
CREATE POLICY "orders_select" ON orders FOR SELECT USING (true);
CREATE POLICY "orders_insert" ON orders FOR INSERT WITH CHECK (true);
CREATE POLICY "orders_update" ON orders FOR UPDATE USING (true);

-- work_sessions
DROP POLICY IF EXISTS "work_sessions_select" ON work_sessions;
DROP POLICY IF EXISTS "work_sessions_insert" ON work_sessions;
DROP POLICY IF EXISTS "work_sessions_update" ON work_sessions;
CREATE POLICY "work_sessions_select" ON work_sessions FOR SELECT USING (true);
CREATE POLICY "work_sessions_insert" ON work_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "work_sessions_update" ON work_sessions FOR UPDATE USING (true);

-- salary_locks
DROP POLICY IF EXISTS "salary_locks_select" ON salary_locks;
DROP POLICY IF EXISTS "salary_locks_insert" ON salary_locks;
DROP POLICY IF EXISTS "salary_locks_delete" ON salary_locks;
CREATE POLICY "salary_locks_select" ON salary_locks FOR SELECT USING (true);
CREATE POLICY "salary_locks_insert" ON salary_locks FOR INSERT WITH CHECK (true);
CREATE POLICY "salary_locks_delete" ON salary_locks FOR DELETE USING (true);

-- settings
DROP POLICY IF EXISTS "settings_select" ON settings;
DROP POLICY IF EXISTS "settings_insert" ON settings;
DROP POLICY IF EXISTS "settings_update" ON settings;
CREATE POLICY "settings_select" ON settings FOR SELECT USING (true);
CREATE POLICY "settings_insert" ON settings FOR INSERT WITH CHECK (true);
CREATE POLICY "settings_update" ON settings FOR UPDATE USING (true);

-- audit_logs
DROP POLICY IF EXISTS "audit_logs_select" ON audit_logs;
DROP POLICY IF EXISTS "audit_logs_insert" ON audit_logs;
CREATE POLICY "audit_logs_select" ON audit_logs FOR SELECT USING (true);
CREATE POLICY "audit_logs_insert" ON audit_logs FOR INSERT WITH CHECK (true);
