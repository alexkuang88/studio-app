// =====================================================
// 时间工具函数
// =====================================================

import { format, startOfMonth, endOfMonth, isValid } from "date-fns";

// 马达加斯加 UTC+3
const MG_OFFSET = 3;

/**
 * 将 Date 转为马达加斯加时间字符串，不依赖浏览器时区
 */
function formatMG(d: Date, pattern: string): string {
  const mg = new Date(d.getTime() + MG_OFFSET * 3600000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return pattern
    .replace("yyyy", String(mg.getUTCFullYear()))
    .replace("MM", pad(mg.getUTCMonth() + 1))
    .replace("dd", pad(mg.getUTCDate()))
    .replace("HH", pad(mg.getUTCHours()))
    .replace("mm", pad(mg.getUTCMinutes()));
}

/**
 * 格式化为标准日期时间字符串 (YYYY-MM-DD HH:mm) — 马达加斯加时间
 */
export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (!isValid(d)) return "—";
  return formatMG(d, "yyyy-MM-dd HH:mm");
}

/**
 * 格式化为日期 (YYYY-MM-DD)
 */
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (!isValid(d)) return "—";
  return formatMG(d, "yyyy-MM-dd");
}

/**
 * 格式化为时间 (HH:mm)
 */
export function formatTime(date: string | Date | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (!isValid(d)) return "—";
  return formatMG(d, "HH:mm");
}

/**
 * 格式化为中文日期时间
 */
export function formatDateTimeCN(date: string | Date | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (!isValid(d)) return "—";
  const mg = new Date(d.getTime() + MG_OFFSET * 3600000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${mg.getUTCFullYear()}年${pad(mg.getUTCMonth() + 1)}月${pad(mg.getUTCDate())}日 ${pad(mg.getUTCHours())}:${pad(mg.getUTCMinutes())}`;
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
/**
 * 当前马达加斯加时间，用于 datetime-local input 默认值
 */
/** 马达加斯加当前时间 UTC+3，用于 input[type=datetime-local] 默认值 */
export function nowDatetimeLocal(): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const mg = new Date(Date.now() + 3 * 3600000);
  return `${mg.getUTCFullYear()}-${pad(mg.getUTCMonth()+1)}-${pad(mg.getUTCDate())}T${pad(mg.getUTCHours())}:${pad(mg.getUTCMinutes())}`;
}

/**
 * 将马达加斯加时间字符串转为 UTC ISO 字符串
 * 用于 API 提交时先转 UTC
 * 例: "2026-05-31T14:18" → "2026-05-31T11:18:00.000Z"
 */
export function mgDatetimeToUTC(mgDatetime: string): string {
  return new Date(mgDatetime + "+03:00").toISOString();
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
