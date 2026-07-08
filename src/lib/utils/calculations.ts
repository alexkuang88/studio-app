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
 * - 跨天分段按每天工时比例拆分产量
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
    start_time: string | null;
    end_time: string | null;
    work_hours: number | null;
  }>,
  baseRate: number,
  premiumRate: number,
  threshold: number,
  startDate: string,
  legacyRate: number
): Map<string, number> {
  // employee_id → MG_day → sum
  const dailyTotals: Record<string, Record<string, number>> = {};

  for (const s of sessions) {
    if (!s.end_time || !s.start_time || s.result_amount == null) continue;
    const eid = s.employee_id;
    const result = s.result_amount;
    const start = new Date(s.start_time);
    const end = new Date(s.end_time);
    const totalMs = end.getTime() - start.getTime();
    if (totalMs <= 0) continue;

    if (!dailyTotals[eid]) dailyTotals[eid] = {};

    const startDay = getMGDay(s.start_time);
    const endDay = getMGDay(s.end_time);

    if (startDay === endDay) {
      dailyTotals[eid][startDay] = (dailyTotals[eid][startDay] || 0) + result;
      continue;
    }

    // 跨天：按每天工时比例拆分
    // 马达加斯加午夜 = UTC 21:00
    const portions: Array<{ day: string; ms: number }> = [];
    let cursor = start.getTime();

    // 第1段：从 start 到当日 MG 午夜
    let midnight = new Date(start);
    midnight.setUTCHours(21, 0, 0, 0);
    if (midnight.getTime() <= cursor) {
      midnight.setUTCDate(midnight.getUTCDate() + 1);
      midnight.setUTCHours(21, 0, 0, 0);
    }
    if (midnight.getTime() < end.getTime()) {
      portions.push({ day: startDay, ms: midnight.getTime() - cursor });
      cursor = midnight.getTime();
    } else {
      portions.push({ day: startDay, ms: totalMs });
    }

    // 中间完整天（每天从 MG午夜 到下一个 MG午夜）
    while (cursor < end.getTime() - 60000) {
      const nextMidnight = new Date(cursor);
      nextMidnight.setUTCDate(nextMidnight.getUTCDate() + 1);
      nextMidnight.setUTCHours(21, 0, 0, 0);
      const dayMs = Math.min(nextMidnight.getTime(), end.getTime()) - cursor;
      if (dayMs <= 0) break;
      const dayLabel = getMGDay(new Date(cursor));
      portions.push({ day: dayLabel, ms: dayMs });
      cursor += dayMs;
    }

    // 按比例分配
    let allocated = 0;
    for (let i = 0; i < portions.length; i++) {
      const p = portions[i];
      let share: number;
      if (i === portions.length - 1) {
        share = result - allocated; // 最后一段用余数，避免舍入误差
      } else {
        share = Math.round(result * (p.ms / totalMs));
      }
      allocated += share;
      dailyTotals[eid][p.day] = (dailyTotals[eid][p.day] || 0) + share;
    }
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
