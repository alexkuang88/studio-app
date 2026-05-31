// =====================================================
// TypeScript 类型定义 — 对应 Supabase 数据库表
// =====================================================

// ---------- 枚举类型 ----------

export type UserRole = "admin" | "operator";

export type EmployeeStatus =
  | "training"
  | "official"
  | "advanced"
  | "suspended"
  | "left";

export type MachineStatus = "available" | "in_use" | "repair" | "disabled";

export type OrderSource =
  | "Douyin"
  | "WeChat"
  | "Old client"
  | "Agent order"
  | "Referral"
  | "Other";

export type OrderStatus =
  | "not_started"
  | "in_progress"
  | "ready_to_complete"
  | "completed"
  | "overdue"
  | "cancelled"
  | "paused";

export type WorkSessionStatus = "running" | "completed" | "void";

export type AuditAction =
  | "create"
  | "update"
  | "void"
  | "lock_salary"
  | "unlock_salary"
  | "complete_order"
  | "force_complete"
  | "handover";

// ---------- 数据库行类型 ----------

export interface Profile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Employee {
  id: string;
  employee_code: string;
  chinese_name: string;
  local_name: string | null;
  phone: string | null;
  facebook: string | null;
  status: EmployeeStatus;
  can_take_order: boolean;
  note: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Machine {
  id: string;
  machine_code: string;
  machine_name: string;
  status: MachineStatus;
  note: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  order_code: string;
  order_source: OrderSource;
  client_note: string | null;
  target_amount: number;
  completed_amount: number;
  status: OrderStatus;
  current_employee_id: string | null;
  current_machine_id: string | null;
  order_received_at: string;
  expected_completion_at: string;
  actual_completed_at: string | null;
  responsible_user: string | null;
  note: string | null;
  completion_note: string | null;
  force_complete_reason: string | null;
  created_by: string | null;
  is_void: boolean;
  void_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkSession {
  id: string;
  order_id: string;
  employee_id: string;
  machine_id: string;
  start_time: string;
  end_time: string | null;
  start_amount: number;
  end_amount: number | null;
  result_amount: number | null;
  work_hours: number | null;
  efficiency: number | null;
  status: WorkSessionStatus;
  note: string | null;
  void_reason: string | null;
  created_by: string | null;
  voided_by: string | null;
  voided_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SalaryLock {
  id: string;
  month: string;
  locked_by: string;
  locked_at: string;
  note: string | null;
}

export interface AppSetting {
  id: string;
  key: string;
  value: string;
  description: string | null;
  updated_by: string | null;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: AuditAction;
  table_name: string;
  record_id: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

// ---------- 联合查询扩展类型 ----------

export interface WorkSessionWithDetails extends WorkSession {
  employees?: Employee;
  machines?: Machine;
  orders?: Order;
}

export interface OrderWithDetails extends Order {
  employees?: Employee;
  machines?: Machine;
  profiles?: Profile;
  work_sessions?: WorkSessionWithDetails[];
}

export interface MachineWithRunning extends Machine {
  running_session?: WorkSessionWithDetails | null;
}

export interface EmployeeMonthlyStats {
  employee: Employee;
  total_result: number;
  total_hours: number;
  avg_efficiency: number;
  salary: number;
  rank: number;
}

// ---------- 表单输入类型 ----------

export interface CreateOrderInput {
  order_code: string;
  order_source: OrderSource;
  client_note?: string;
  target_amount: number;
  order_received_at: string;
  expected_completion_at: string;
  responsible_user?: string;
  note?: string;
}

export interface StartSessionInput {
  order_id: string;
  employee_id: string;
  machine_id: string;
  start_time: string;
  start_amount: number;
}

export interface HandoverInput {
  running_session_id: string;
  end_time: string;
  end_amount: number;
  // 接班信息
  next_employee_id: string;
  next_machine_id?: string; // 默认原设备
}

export interface CompleteOrderInput {
  order_id: string;
  note?: string;
  force_complete_reason?: string; // Admin 强制完成时需要
}

export interface VoidSessionInput {
  session_id: string;
  void_reason: string;
}

export interface LockSalaryInput {
  month: string;
  note?: string;
}

// ---------- 常量 ----------

export const ORDER_SOURCE_LABELS: Record<OrderSource, string> = {
  Douyin: "抖音客户 / Douyin",
  WeChat: "微信客户 / WeChat",
  "Old client": "老客户 / Old client",
  "Agent order": "中介订单 / Agent order",
  Referral: "朋友介绍 / Referral",
  Other: "其他 / Other",
};

export const EMPLOYEE_STATUS_LABELS: Record<EmployeeStatus, string> = {
  training: "培训中 / Formation",
  official: "正式 / Officiel",
  advanced: "高级 / Avancé",
  suspended: "暂停 / Suspendu",
  left: "离职 / Parti",
};

export const MACHINE_STATUS_LABELS: Record<MachineStatus, string> = {
  available: "空闲 / Disponible",
  in_use: "使用中 / En utilisation",
  repair: "维修 / Réparation",
  disabled: "停用 / Désactivé",
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  not_started: "未开始 / Non commencé",
  in_progress: "进行中 / En cours",
  ready_to_complete: "可完成 / Prêt à terminer",
  completed: "已完成 / Terminé",
  overdue: "超时 / En retard",
  cancelled: "已取消 / Annulé",
  paused: "暂停中 / En pause",
};

export const DEFAULT_SALARY_RATE = 700; // Ar / 100万
