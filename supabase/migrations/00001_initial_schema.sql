-- ============================================================
-- Studio Manager - Initial Database Schema
-- 游戏工作室内部管理系统 - 初始数据库架构
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. profiles — 用户扩展信息表（对接 Supabase Auth users）
-- ============================================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'operator')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 2. employees — 员工表（打手）
-- ============================================================
CREATE TABLE employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_code TEXT NOT NULL UNIQUE,
  chinese_name TEXT NOT NULL,
  local_name TEXT,
  phone TEXT,
  facebook TEXT,
  status TEXT NOT NULL DEFAULT 'training'
    CHECK (status IN ('training', 'official', 'advanced', 'suspended', 'left')),
  can_take_order BOOLEAN DEFAULT false,
  note TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 3. machines — 设备/机号表
-- ============================================================
CREATE TABLE machines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_code TEXT NOT NULL UNIQUE,
  machine_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'in_use', 'repair', 'disabled')),
  note TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 4. orders — 订单表
-- ============================================================
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_code TEXT NOT NULL UNIQUE,
  order_source TEXT NOT NULL
    CHECK (order_source IN ('Douyin', 'WeChat', 'Old client', 'Agent order', 'Referral', 'Other')),
  client_note TEXT,
  target_amount DECIMAL(12,2) NOT NULL,
  completed_amount DECIMAL(12,2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'in_progress', 'ready_to_complete', 'completed', 'overdue', 'cancelled')),
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
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 5. work_sessions — 员工分段打单记录表（核心表）
-- ============================================================
CREATE TABLE work_sessions (
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
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'void')),
  note TEXT,
  void_reason TEXT,
  created_by UUID REFERENCES profiles(id),
  voided_by UUID REFERENCES profiles(id),
  voided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 6. salary_locks — 工资锁定表
-- ============================================================
CREATE TABLE salary_locks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month TEXT NOT NULL UNIQUE,
  locked_by UUID NOT NULL REFERENCES profiles(id),
  locked_at TIMESTAMPTZ DEFAULT now(),
  note TEXT
);

-- ============================================================
-- 7. settings — 系统设置表
-- ============================================================
CREATE TABLE settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  description TEXT,
  updated_by UUID REFERENCES profiles(id),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 默认设置
INSERT INTO settings (key, value, description) VALUES
  ('salary_rate', '700', '工资单价 Ar/100万'),
  ('minimum_efficiency', '150', '最低达标效率 万/小时'),
  ('advanced_efficiency', '200', '高级效率 万/小时'),
  ('warning_hours_before_overdue', '2', '订单超时前提醒小时数');

-- ============================================================
-- 8. audit_logs — 操作日志表
-- ============================================================
CREATE TABLE audit_logs (
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
-- Indexes 索引
-- ============================================================

-- work_sessions 查询索引
CREATE INDEX idx_work_sessions_order ON work_sessions(order_id);
CREATE INDEX idx_work_sessions_employee ON work_sessions(employee_id);
CREATE INDEX idx_work_sessions_machine ON work_sessions(machine_id);
CREATE INDEX idx_work_sessions_status ON work_sessions(status);
CREATE INDEX idx_work_sessions_start_time ON work_sessions(start_time);
CREATE INDEX idx_work_sessions_end_time ON work_sessions(end_time);

-- orders 查询索引
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_order_received ON orders(order_received_at);
CREATE INDEX idx_orders_current_employee ON orders(current_employee_id);
CREATE INDEX idx_orders_current_machine ON orders(current_machine_id);
CREATE INDEX idx_orders_expected_completion ON orders(expected_completion_at);

-- audit_logs 查询索引
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_table ON audit_logs(table_name);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at);

-- ============================================================
-- Partial Unique Indexes 部分唯一索引（防呆核心）
-- ============================================================

-- 同一个订单同一时间只能有一条 running 记录
CREATE UNIQUE INDEX idx_one_running_per_order
  ON work_sessions(order_id) WHERE status = 'running';

-- 同一台设备同一时间只能有一条 running 记录
CREATE UNIQUE INDEX idx_one_running_per_machine
  ON work_sessions(machine_id) WHERE status = 'running';

-- 同一个打手同一时间只能有一条 running 记录
CREATE UNIQUE INDEX idx_one_running_per_employee
  ON work_sessions(employee_id) WHERE status = 'running';

-- ============================================================
-- Trigger Functions 触发器函数
-- ============================================================

-- 自动更新 updated_at 时间戳
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_employees_updated_at
  BEFORE UPDATE ON employees
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_machines_updated_at
  BEFORE UPDATE ON machines
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_work_sessions_updated_at
  BEFORE UPDATE ON work_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 新用户注册时自动创建 profiles 记录
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'name', split_part(NEW.email, '@', 1)),
    'operator' -- 默认角色为 operator，Admin 手动提升
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 注册触发器（放在 auth.users 表上）
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- RLS Policies 行级安全策略
-- ============================================================

-- 启用所有表的 RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- ---------- profiles ----------
-- 用户可读自己，Admin 可读所有
CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admin can insert profiles"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ---------- employees ----------
-- 所有登录用户可读，Admin 可增改
CREATE POLICY "Authenticated users can read employees"
  ON employees FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Admin can insert employees"
  ON employees FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admin can update employees"
  ON employees FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admin can delete employees"
  ON employees FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ---------- machines ----------
CREATE POLICY "Authenticated users can read machines"
  ON machines FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Admin can insert machines"
  ON machines FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admin can update machines"
  ON machines FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admin can delete machines"
  ON machines FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ---------- orders ----------
CREATE POLICY "Authenticated users can read orders"
  ON orders FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert orders"
  ON orders FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update orders"
  ON orders FOR UPDATE
  USING (auth.role() = 'authenticated');

-- ---------- work_sessions ----------
CREATE POLICY "Authenticated users can read work_sessions"
  ON work_sessions FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert work_sessions"
  ON work_sessions FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update work_sessions"
  ON work_sessions FOR UPDATE
  USING (auth.role() = 'authenticated');

-- ---------- salary_locks ----------
-- 所有登录用户可读，只有 Admin 可操作
CREATE POLICY "Authenticated users can read salary_locks"
  ON salary_locks FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Admin can insert salary_locks"
  ON salary_locks FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admin can delete salary_locks"
  ON salary_locks FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ---------- settings ----------
CREATE POLICY "Authenticated users can read settings"
  ON settings FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Admin can insert/update settings"
  ON settings FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admin can update settings"
  ON settings FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ---------- audit_logs ----------
-- 只有 Admin 可读操作日志
CREATE POLICY "Admin can read audit_logs"
  ON audit_logs FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Authenticated users can insert audit_logs"
  ON audit_logs FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');
