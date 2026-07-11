"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { useAuth } from "@/lib/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import {
  ORDER_SOURCE_LABELS,
  ORDER_STATUS_LABELS,
  type OrderStatus,
} from "@/lib/types/database";
import {
  formatDateTime,
  calcRemainingHours,
  formatHours as formatHoursText,
} from "@/lib/utils/time-utils";
import {
  calcRemainingAmount,
  formatAmount,
  isOrderOverdue,
  isOrderNearingDue,
} from "@/lib/utils/calculations";
import { Plus, Search } from "lucide-react";
import Link from "next/link";

export default function OrdersPage() {
  return (
    <Suspense fallback={<div className="text-center py-12 text-gray-500">加载中... / Chargement...</div>}>
      <OrdersContent />
    </Suspense>
  );
}

function OrdersContent() {
  const { t } = useLocale();
  const { profile } = useAuth();
  const isRecorder = profile?.role === "recorder";
  const searchParams = useSearchParams();

  const [orders, setOrders] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "");
  const [sourceFilter, setSourceFilter] = useState("");
  const [todayOnly, setTodayOnly] = useState(searchParams.get("today") === "1");
  const [overdueOnly, setOverdueOnly] = useState(searchParams.get("overdue") === "1");
  const [nearingOnly, setNearingOnly] = useState(searchParams.get("nearing") === "1");
  const [label, setLabel] = useState("");
  const [dateFilter, setDateFilter] = useState(""); // 按日期筛选

  const supabase = createClient();

  const fetchOrders = async () => {
    setLoading(true);

    let query = supabase
      .from("orders")
      .select(
        "*, employees!orders_current_employee_id_fkey(chinese_name, employee_code), machines!orders_current_machine_id_fkey(machine_code, machine_name)"
      )
      .order("created_at", { ascending: false })
      .limit(200);

    if (statusFilter) query = query.eq("status", statusFilter);
    if (sourceFilter) query = query.eq("order_source", sourceFilter);
    if (search) query = query.ilike("order_code", `%${search}%`);

    // 日期筛选：用马达加斯加时间 (+03:00)
    if (dateFilter) {
      const startISO = `${dateFilter}T00:00:00+03:00`;
      const endISO = `${dateFilter}T23:59:59+03:00`;
      if (statusFilter === "completed" || statusFilter === "cancelled") {
        query = query.gte("actual_completed_at", startISO).lte("actual_completed_at", endISO);
      } else {
        query = query.gte("created_at", startISO).lte("created_at", endISO);
      }
    }
    // 今日筛选：马达加斯加时间 (UTC+3)
    if (todayOnly && !dateFilter) {
      const mgToday = new Date(new Date().getTime() + 3 * 3600000).toISOString().slice(0, 10);
      const startISO = `${mgToday}T00:00:00+03:00`;
      if (statusFilter === "completed") {
        query = query.gte("actual_completed_at", startISO);
      } else {
        query = query.gte("created_at", startISO);
      }
    }

    const { data } = await query;
    let list = (data as Record<string, unknown>[]) || [];

    // 前端过滤超时/即将超时
    const now = new Date();
    if (overdueOnly) {
      list = list.filter((o: any) => {
        const s = o.status;
        if (s === "completed" || s === "cancelled" || s === "paused" || s === "not_started") return false;
        if (!o.expected_completion_at) return false;
        return new Date(o.expected_completion_at) < now;
      });
      setLabel("已超时");
    }
    if (nearingOnly) {
      const warningTime = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      list = list.filter((o: any) => {
        const s = o.status;
        if (s === "completed" || s === "cancelled" || s === "paused" || s === "not_started") return false;
        if (!o.expected_completion_at) return false;
        const exp = new Date(o.expected_completion_at);
        return exp >= now && exp <= warningTime;
      });
      setLabel("即将超时");
    }

    setOrders(list);
    setLoading(false);
  };

  useEffect(() => {
    fetchOrders();
  }, [statusFilter, sourceFilter, search]);

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "completed":
        return "green" as const;
      case "in_progress":
        return "blue" as const;
      case "ready_to_complete":
        return "purple" as const;
      case "overdue":
        return "red" as const;
      case "paused":
        return "orange" as const;
      case "cancelled":
        return "gray" as const;
      default:
        return "gray" as const;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {t("orders.title")}
          </h1>
          <p className="text-gray-500 mt-1">
            {t("orders.total")}: {orders.length}
            {dateFilter && <span className="ml-2 text-blue-600 font-medium">· {dateFilter}</span>}
            {todayOnly && <span className="ml-2 text-blue-600 font-medium">· {t("orders.today")}</span>}
            {overdueOnly && <span className="ml-2 text-red-600 font-medium">· {t("orders.overdue_label")}</span>}
            {nearingOnly && <span className="ml-2 text-orange-600 font-medium">· {t("orders.nearing_label")}</span>}
          </p>
        </div>
        <Link href="/orders/new">
          <Button variant="primary">
            <Plus size={18} className="mr-1" />
            {t("orders.new")}
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="搜索订单号... / Rechercher..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[160px]"
        />
        <input
          type="date"
          value={dateFilter}
          onChange={(e) => { setDateFilter(e.target.value); setTodayOnly(false); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-[140px]"
          title="选择日期筛选"
        />
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={[
            { value: "", label: t("orders.all_status") },
            ...Object.entries(ORDER_STATUS_LABELS).map(([v, l]) => ({
              value: v,
              label: l,
            })),
          ]}
        />
        <Select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          options={[
            { value: "", label: t("orders.all_source") },
            ...Object.entries(ORDER_SOURCE_LABELS).map(([v, l]) => ({
              value: v,
              label: l,
            })),
          ]}
        />
        <Button variant="outline" onClick={fetchOrders}>
          <Search size={18} className="mr-1" />刷新
        </Button>
      </div>

      {/* Orders table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-3 py-3 text-left">{t("orders.code")}</th>
                <th className="px-3 py-3 text-left hidden lg:table-cell max-w-[120px]">{t("orders.client_note")}</th>
                <th className="px-3 py-3 text-left hidden sm:table-cell">{t("orders.source")}</th>
                <th className="px-3 py-3 text-left hidden lg:table-cell">{t("orders.received")}</th>
                <th className="px-3 py-3 text-right">{t("orders.order_amount")}</th>
                <th className="px-3 py-3 text-right">{t("orders.initial_balance")}</th>
                <th className="px-3 py-3 text-right">{t("orders.target_balance")}</th>
                <th className="px-3 py-3 text-right">{t("orders.latest_balance")}</th>
                {!isRecorder && <th className="px-3 py-3 text-right hidden md:table-cell">{t("orders.revenue")}</th>}
                <th className="px-3 py-3 text-left">{t("orders.status")}</th>
                <th className="px-3 py-3 text-left hidden lg:table-cell">{t("orders.operator_device")}</th>
                <th className="px-3 py-3 text-left hidden md:table-cell">{t("orders.expected")}</th>
                <th className="px-3 py-3 text-left hidden md:table-cell">{t("orders.completed_at")}</th>
                <th className="px-3 py-3 text-left hidden lg:table-cell">{t("orders.time_remaining")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr>
                  <td colSpan={isRecorder ? 12 : 13} className="px-4 py-6 text-center text-gray-500">
                    加载中... / Chargement...
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={isRecorder ? 12 : 13} className="px-4 py-6 text-center text-gray-500">
                    暂无订单 / Aucune commande
                  </td>
                </tr>
              ) : (
                orders.map((order) => {
                  const status = order.status as string;
                  const targetAmount = (order.target_amount as number) || 0;
                  const initialBal = (order.initial_balance as number) || 0;
                  // 用固定订单金额，不受客户盈亏影响
                  const orderAmountDb = (order.order_amount as number) || (targetAmount - initialBal);
                  const clientGoal = orderAmountDb;
                  const isOverdue =
                    status !== "completed" &&
                    status !== "cancelled" &&
                    status !== "not_started" &&
                    isOrderOverdue(order.expected_completion_at as string);
                  const remaining = calcRemainingAmount(
                    targetAmount,
                    (order.completed_amount as number) || 0
                  );
                  const remainingHrs = calcRemainingHours(
                    order.expected_completion_at as string
                  );
                  const emp = order.employees as Record<string, unknown> | null;
                  const machine = order.machines as Record<string, unknown> | null;

                  let rowBg = "";
                  if (isOverdue) rowBg = "bg-red-50";
                  else if (status === "paused") rowBg = "bg-orange-50";
                  else if (status === "ready_to_complete") rowBg = "bg-green-50";
                  else if (status === "completed") rowBg = "";

                  return (
                    <tr key={order.id as string} className={`hover:bg-gray-100 ${rowBg}`}>
                      <td className="px-3 py-3">
                        <Link
                          href={`/orders/${order.id}`}
                          className="font-mono font-medium text-blue-600 hover:underline"
                        >
                          {order.order_code as string}
                        </Link>
                      </td>
                      <td className="px-3 py-3 hidden lg:table-cell text-xs text-gray-500 max-w-[120px] truncate" title={(order.client_note as string) || ""}>
                        {(order.client_note as string) || "—"}
                      </td>
                      <td className="px-3 py-3 hidden sm:table-cell text-gray-500">
                        {ORDER_SOURCE_LABELS[order.order_source as keyof typeof ORDER_SOURCE_LABELS] || order.order_source as string}
                      </td>
                      <td className="px-3 py-3 hidden lg:table-cell text-xs text-gray-500 whitespace-nowrap">
                        {formatDateTime(order.order_received_at as string)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono font-medium text-blue-600">
                        {clientGoal.toLocaleString("zh-CN")}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-xs text-gray-500">
                        {initialBal.toLocaleString("zh-CN")}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-xs text-gray-500">
                        {targetAmount.toLocaleString("zh-CN")}
                      </td>
                      <td className="px-3 py-3 text-right font-mono font-bold text-xs text-blue-700">
                        {(order.latest_balance as number) != null ? `${(order.latest_balance as number).toLocaleString("zh-CN")}` : "—"}
                      </td>
{!isRecorder && (
                      <td className="px-3 py-3 text-right font-mono text-xs text-green-600 font-medium hidden md:table-cell">
                        {(order.order_revenue as number || 0) > 0 ? `¥ ${(order.order_revenue as number).toLocaleString("zh-CN")}` : "—"}
                      </td>
                      )}
                      <td className="px-3 py-3">
                        <Badge variant={getStatusBadgeVariant(status)}>
                          {ORDER_STATUS_LABELS[status as OrderStatus] || status}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 hidden lg:table-cell text-xs">
                        {emp
                          ? `${String(emp.employee_code).replace(/^N0*/, "")}号${emp.chinese_name}`
                          : "—"}
                        {machine ? ` / ${machine.machine_code} / Machine ${String(machine.machine_code).replace(/^M0*/, "")}` : ""}
                      </td>
                      <td className="px-3 py-3 text-xs hidden md:table-cell">
                        {formatDateTime(order.expected_completion_at as string)}
                        {isOverdue && (
                          <span className="ml-1 text-red-600 font-bold">
                            ⚠️
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs hidden md:table-cell">
                        {formatDateTime(order.actual_completed_at as string)}
                      </td>
                      <td className="px-3 py-3 hidden lg:table-cell">
                        {status === "completed" ? (
                          <span className="text-green-600 text-xs">已完成 / Terminé</span>
                        ) : status === "paused" ? (
                          <span className="text-orange-600 text-xs font-medium">⏸ 暂停中 / En pause</span>
                        ) : status === "cancelled" ? (
                          <span className="text-gray-400 text-xs">已取消 / Annulé</span>
                        ) : remainingHrs > 0 ? (
                          <span className={`text-xs ${remainingHrs <= 2 ? "text-orange-600 font-bold" : "text-gray-500"}`}>
                            {formatHoursText(remainingHrs)}
                          </span>
                        ) : (
                          <span className="text-red-600 text-xs font-bold">
                            已超时 / En retard {formatHoursText(Math.abs(remainingHrs))}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
