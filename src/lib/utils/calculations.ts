// =====================================================
// 核心计算工具函数
// =====================================================

import {
  differenceInHours,
  differenceInMinutes,
  isAfter,
  isBefore,
} from "date-fns";

/**
 * 计算本次成绩: end_amount - start_amount
 */
export function calcResultAmount(
  startAmount: number,
  endAmount: number
): number {
  return Math.max(0, endAmount - startAmount);
}

/**
 * 计算工作小时（支持跨天）
 */
export function calcWorkHours(startTime: string | Date, endTime: string | Date): number {
  const start = new Date(startTime);
  const end = new Date(endTime);
  const totalMinutes = differenceInMinutes(end, start);
  return Math.round((totalMinutes / 60) * 100) / 100;
}

/**
 * 计算每小时效率: result_amount / work_hours
 */
export function calcEfficiency(resultAmount: number, workHours: number): number {
  if (workHours <= 0) return 0;
  return Math.round((resultAmount / workHours) * 100) / 100;
}

/**
 * 计算订单已完成金额: SUM(result_amount) FROM work_sessions WHERE order_id = ? AND status = 'completed'
 */
export function calcOrderCompletedAmount(
  sessions: { result_amount: number | null; status: string }[]
): number {
  return sessions
    .filter((s) => s.status === "completed" && s.result_amount != null)
    .reduce((sum, s) => sum + (s.result_amount ?? 0), 0);
}

/**
 * 计算订单剩余金额
 */
export function calcRemainingAmount(
  targetAmount: number,
  completedAmount: number
): number {
  return Math.max(0, targetAmount - completedAmount);
}

/**
 * 判断订单是否已达成目标
 */
export function isOrderGoalReached(
  targetAmount: number,
  completedAmount: number
): boolean {
  return completedAmount >= targetAmount;
}

/**
 * 计算工资: total_result / 100 * salaryRate
 * salaryRate = Ar / 100万
 */
export function calcSalary(totalResult: number, salaryRate: number): number {
  return Math.round((totalResult / 100) * salaryRate);
}

/**
 * 判断订单是否超时
 * @param expectedAt 要求完成时间
 * @param actualAt 实际完成时间（可选，默认当前时间）
 */
export function isOrderOverdue(
  expectedAt: string | Date,
  actualAt?: string | Date
): boolean {
  const expected = new Date(expectedAt);
  const actual = actualAt ? new Date(actualAt) : new Date();
  return isAfter(actual, expected);
}

/**
 * 判断订单是否即将超时（在 warningHours 小时内到期）
 */
export function isOrderNearingDue(
  expectedAt: string | Date,
  warningHours: number = 2
): boolean {
  const expected = new Date(expectedAt);
  const warningTime = new Date(expected.getTime() - warningHours * 60 * 60 * 1000);
  return isBefore(warningTime, new Date()) && isBefore(new Date(), expected);
}

/**
 * 计算距离要求的剩余时间（小时）
 */
export function calcRemainingHours(expectedAt: string | Date): number {
  const expected = new Date(expectedAt);
  const now = new Date();
  return Math.round(differenceInHours(expected, now) * 10) / 10;
}

/**
 * 计算已工作时长（小时）
 */
export function calcElapsedHours(startTime: string | Date): number {
  const start = new Date(startTime);
  const now = new Date();
  const totalMinutes = differenceInMinutes(now, start);
  return Math.round((totalMinutes / 60) * 10) / 10;
}

/**
 * 计算超时时长（小时）
 */
export function calcOverdueHours(
  expectedAt: string | Date,
  actualAt?: string | Date
): number {
  const expected = new Date(expectedAt);
  const actual = actualAt ? new Date(actualAt) : new Date();
  if (isBefore(actual, expected)) return 0;
  const totalMinutes = differenceInMinutes(actual, expected);
  return Math.round((totalMinutes / 60) * 10) / 10;
}

/**
 * 格式化金额为万
 */
export function formatAmount(amount: number): string {
  return `${amount.toLocaleString("zh-CN")} 万`;
}

/**
 * 格式化小时数
 */
export function formatHours(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m} 分钟`;
  if (m === 0) return `${h} 小时`;
  return `${h} 小时 ${m} 分钟`;
}

/**
 * 格式化工资为 Ar
 */
export function formatSalary(salary: number): string {
  return `${salary.toLocaleString("zh-CN")} Ar`;
}

// =====================================================
// 阶梯日工资 (v2, 生效日期 2026-07-06)
// =====================================================

/**
 * 返回马达加斯加 (UTC+3) 日期字符串 "YYYY-MM-DD"
 */
export function getMGDay(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const mg = new Date(d.getTime() + 3 * 3600000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${mg.getUTCFullYear()}-${pad(mg.getUTCMonth() + 1)}-${pad(mg.getUTCDate())}`;
}

/**
 * 阶梯日工资计算
 *
 * 按员工+马达加斯加日期分组，逐日判断：
 * - 日产量 >= threshold → premiumRate
 * - 日产量 <  threshold → baseRate
 * - 日期 < startDate（如2026-07-06之前）→ 走 legacyRate（旧单价）
 *
 * @returns Map<employeeId, totalSalary>
 */
export function calcDailyTieredSalary(
  sessions: Array<{
    employee_id: string;
    result_amount: number | null;
    end_time: string | null;
  }>,
  baseRate: number,
  premiumRate: number,
  threshold: number,
  startDate: string,    // "2026-07-06" — 阶梯制度生效日期
  legacyRate: number    // 旧单价，生效日期之前的日期使用
): Map<string, number> {
  // employee_id → MG_day → sum
  const dailyTotals: Record<string, Record<string, number>> = {};

  for (const s of sessions) {
    if (!s.end_time || s.result_amount == null) continue;
    const eid = s.employee_id;
    const day = getMGDay(s.end_time);

    if (!dailyTotals[eid]) dailyTotals[eid] = {};
    dailyTotals[eid][day] = (dailyTotals[eid][day] || 0) + s.result_amount;
  }

  const result = new Map<string, number>();
  for (const [eid, days] of Object.entries(dailyTotals)) {
    let totalSalary = 0;
    for (const [day, dailyResult] of Object.entries(days)) {
      const rate = day < startDate ? legacyRate
        : dailyResult >= threshold ? premiumRate
        : baseRate;
      totalSalary += Math.round((dailyResult / 100) * rate);
    }
    result.set(eid, totalSalary);
  }

  return result;
}
