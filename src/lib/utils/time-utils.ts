// =====================================================
// 时间工具函数
// =====================================================

import { format, parseISO, startOfMonth, endOfMonth, isValid, addHours } from "date-fns";
import { zhCN } from "date-fns/locale";

// 马达加斯加 UTC+3
const MG_OFFSET = 3;

function toMG(d: Date): Date {
  return addHours(d, MG_OFFSET);
}

/**
 * 格式化为标准日期时间字符串 (YYYY-MM-DD HH:mm) — 马达加斯加时间
 */
export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (!isValid(d)) return "—";
  return format(toMG(d), "yyyy-MM-dd HH:mm");
}

/**
 * 格式化为日期 (YYYY-MM-DD) — 马达加斯加时间
 */
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (!isValid(d)) return "—";
  return format(toMG(d), "yyyy-MM-dd");
}

/**
 * 格式化为时间 (HH:mm) — 马达加斯加时间
 */
export function formatTime(date: string | Date | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (!isValid(d)) return "—";
  return format(toMG(d), "HH:mm");
}

/**
 * 格式化为中文日期时间 — 马达加斯加时间
 */
export function formatDateTimeCN(
  date: string | Date | null | undefined
): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (!isValid(d)) return "—";
  return format(toMG(d), "yyyy年MM月dd日 HH:mm", { locale: zhCN });
}

/**
 * 获取当月的起止日期
 */
export function getMonthRange(month: string): { start: Date; end: Date } {
  const [year, monthNum] = month.split("-").map(Number);
  const date = new Date(year, monthNum - 1, 1);
  return {
    start: startOfMonth(date),
    end: endOfMonth(date),
  };
}

/**
 * 获取当前月份字符串 YYYY-MM
 */
export function getCurrentMonth(): string {
  return format(new Date(), "yyyy-MM");
}

/**
 * 获取月份显示名称
 */
export function getMonthLabel(month: string): string {
  const [year, monthNum] = month.split("-");
  return `${year}年${Number(monthNum)}月`;
}

/**
 * 生成月份列表（最近12个月）
 */
export function getRecentMonths(count = 12): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(format(d, "yyyy-MM"));
  }
  return months;
}

/**
 * 判断日期是否属于指定月份
 */
export function isInMonth(date: string | Date, month: string): boolean {
  const d = typeof date === "string" ? new Date(date) : date;
  const monthStart = startOfMonth(new Date(month + "-01"));
  const monthEnd = endOfMonth(new Date(month + "-01"));
  return d >= monthStart && d <= monthEnd;
}

/**
 * Local time string for input[type=datetime-local]
 */
export function toDatetimeLocalValue(date: string | Date | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (!isValid(d)) return "";
  return format(d, "yyyy-MM-dd'T'HH:mm");
}

/**
 * Current local datetime value
 */
export function nowDatetimeLocal(): string {
  return format(new Date(), "yyyy-MM-dd'T'HH:mm");
}

/**
 * 格式化小时数为可读文本
 */
export function formatHours(hours: number): string {
  if (hours < 0) return `-${formatHours(Math.abs(hours))}`;
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (m === 60) return `${h + 1} 小时`;
  if (h === 0) return `${m} 分钟`;
  if (m === 0) return `${h} 小时`;
  return `${h} 小时 ${m} 分钟`;
}

/**
 * 格式化金额为万
 */
export function formatAmount(amount: number): string {
  return `${amount.toLocaleString("zh-CN")} 万`;
}

/**
 * 格式化工资为 Ar
 */
export function formatSalary(salary: number): string {
  return `${salary.toLocaleString("zh-CN")} Ar`;
}

/**
 * 计算距离要求的剩余时间（小时）
 */
export function calcRemainingHours(expectedAt: string | Date): number {
  const expected = new Date(expectedAt);
  const now = new Date();
  const diffMs = expected.getTime() - now.getTime();
  return Math.round((diffMs / (1000 * 60 * 60)) * 10) / 10;
}

/**
 * 计算已工作时长（小时）
 */
export function calcElapsedHours(startTime: string | Date): number {
  const start = new Date(startTime);
  const now = new Date();
  const totalMinutes = (now.getTime() - start.getTime()) / (1000 * 60);
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
  if (actual < expected) return 0;
  const totalMinutes = (actual.getTime() - expected.getTime()) / (1000 * 60);
  return Math.round((totalMinutes / 60) * 10) / 10;
}
