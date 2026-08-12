"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  ORDER_SOURCE_LABELS,
  ORDER_STATUS_LABELS,
  type OrderStatus,
} from "@/lib/types/database";
import {
  formatDateTime,
  formatHours as formatHoursText,
} from "@/lib/utils/time-utils";
import {
  calcOrderCompletedAmount,
  calcOverdueHours,
  calcRemainingAmount,
  formatAmount,
} from "@/lib/utils/calculations";
import { X, Loader2 } from "lucide-react";

export default function OrderSlidePanel({
  orderId,
  onClose,
}: {
  orderId: string;
  onClose: () => void;
}) {
  const supabase = createClient();
  const { isAdmin, profile } = useAuth();
  const canEdit = isAdmin || profile?.role === "operator";
  const isRecorder = profile?.role === "recorder";

  const [order, setOrder] = useState<Record<string, unknown> | null>(null);
  const [sessions, setSessions] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const fetchOrder = async () => {
    setLoading(true);
    const [{ data: orderData }, { data: sessionsData }] = await Promise.all([
      supabase
        .from("orders")
        .select("*, employees(*), machines(*)")
        .eq("id", orderId)
        .single(),
      supabase
        .from("work_sessions")
        .select("*, employees(*), machines(*)")
        .eq("order_id", orderId)
        .order("start_time", { ascending: true }),
    ]);
    if (orderData) setOrder(orderData as Record<string, unknown>);
    setSessions((sessionsData as Record<string, unknown>[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchOrder(); }, [orderId]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex justify-end">
        <div className="absolute inset-0 bg-black/30" onClick={onClose} />
        <div className="relative w-full max-w-lg bg-white h-full overflow-y-auto shadow-2xl animate-slide-in">
          <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white z-10">
            <h2 className="text-lg font-bold">加载中... / Chargement...</h2>
            <Button variant="ghost" size="sm" onClick={onClose}><X size={20} /></Button>
          </div>
          <div className="flex items-center justify-center py-20">
            <Loader2 size={32} className="animate-spin text-gray-400" />
          </div>
        </div>
      </div>
    );
  }

  if (!order) {
    return null;
  }

  const completedAmount = calcOrderCompletedAmount(sessions as { result_amount: number | null; status: string }[]);
  const orderAmountVal = (order.order_amount as number) || ((order.target_amount as number) || 0) - ((order.initial_balance as number) || 0);
  const remainingAmount = calcRemainingAmount(orderAmountVal, completedAmount);
  const status = (order.status as string) || "not_started";
  const isCompletedOrCancelled = status === "completed" || status === "cancelled";
  const isOverdue = status !== "completed" && status !== "cancelled" && order.expected_completion_at
    ? new Date() > new Date(order.expected_completion_at as string) : false;
  const overdueHours = order.expected_completion_at
    ? calcOverdueHours(order.expected_completion_at as string, order.actual_completed_at as string) : 0;
  const isOnTime = status === "completed" && order.actual_completed_at && order.expected_completion_at
    ? new Date(order.actual_completed_at as string) <= new Date(order.expected_completion_at as string) : false;

  const emp = order.employees as Record<string, unknown> | null;
  const machine = order.machines as Record<string, unknown> | null;

  function formatAmt(amount: number): string { return `${formatAmount(amount)} (10k)`; }

  // Employee summary
  const employeeSummary: Record<string, { employee: Record<string, unknown>; totalResult: number; totalHours: number }> = {};
  for (const s of sessions) {
    if (s.status !== "completed") continue;
    const e = s.employees as Record<string, unknown>;
    const eid = e?.id as string;
    if (!eid) continue;
    if (!employeeSummary[eid]) { employeeSummary[eid] = { employee: e, totalResult: 0, totalHours: 0 }; }
    employeeSummary[eid].totalResult += (s.result_amount as number) || 0;
    employeeSummary[eid].totalHours += (s.work_hours as number) || 0;
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white h-full overflow-y-auto shadow-2xl" style={{ animation: "slideIn 0.2s ease-out" }}>
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white z-10">
          <h2 className="text-lg font-bold font-mono">{order.order_code as string}</h2>
          <Button variant="ghost" size="sm" onClick={onClose}><X size={20} /></Button>
        </div>

        <div className="p-4 space-y-4">
          {/* Info */}
          <div className="bg-gray-50 rounded-lg p-3 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">订单来源</span><span>{ORDER_SOURCE_LABELS[order.order_source as keyof typeof ORDER_SOURCE_LABELS] || order.order_source as string}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">订单金额</span><span className="font-mono font-bold">{formatAmt(orderAmountVal)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">已完成</span><span className={`font-mono font-bold ${completedAmount >= orderAmountVal ? "text-green-600" : ""}`}>{formatAmt(completedAmount)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">未完成</span><span className="font-mono">{formatAmt(remainingAmount)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">状态</span><Badge variant={status === "completed" ? "green" : status === "in_progress" ? "blue" : isOverdue ? "red" : "gray"}>{ORDER_STATUS_LABELS[status as OrderStatus] || status}</Badge></div>
            {!isRecorder && (order.order_revenue as number || 0) > 0 && <div className="flex justify-between"><span className="text-gray-500">收入</span><span className="text-green-600 font-bold">¥ {(order.order_revenue as number).toLocaleString()}</span></div>}
            {(emp || machine) && (
              <div className="flex justify-between"><span className="text-gray-500">当前</span><span>{emp ? `${emp.employee_code} ${emp.chinese_name}` : "—"} / {machine ? `${machine.machine_code} ${machine.machine_name}` : "—"}</span></div>
            )}
          </div>

          {/* Sessions table */}
          {sessions.length > 0 && (
            <div>
              <h4 className="font-semibold text-sm mb-2">分段记录 ({sessions.length})</h4>
              <div className="max-h-60 overflow-y-auto text-xs">
                <table className="w-full">
                  <thead className="bg-gray-100 sticky top-0"><tr><th className="text-left p-1">员工</th><th className="text-left p-1">时间</th><th className="text-right p-1">余额</th><th className="text-right p-1">成绩</th><th className="text-right p-1">工时</th></tr></thead>
                  <tbody className="divide-y">
                    {sessions.map((ws) => {
                      const e = ws.employees as Record<string, unknown> | null;
                      const wsStatus = ws.status as string;
                      return (
                        <tr key={ws.id as string} className={wsStatus === "void" ? "text-gray-300 line-through" : wsStatus === "running" ? "bg-blue-50" : ""}>
                          <td className="p-1">{e ? `${e.employee_code} ${e.chinese_name}` : "—"}</td>
                          <td className="p-1">{formatDateTime(ws.start_time as string)}</td>
                          <td className="p-1 text-right font-mono">{(ws.start_amount as number)?.toLocaleString()} → {ws.end_amount != null ? (ws.end_amount as number).toLocaleString() : "—"}</td>
                          <td className={`p-1 text-right font-mono font-medium ${(ws.result_amount as number || 0) < 0 ? "text-red-500" : ""}`}>{(ws.result_amount as number || 0).toLocaleString()}万</td>
                          <td className="p-1 text-right">{ws.work_hours != null ? `${(ws.work_hours as number).toFixed(1)}h` : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Cancel button */}
          {!isCompletedOrCancelled && canEdit && (
            <div className="border-t pt-3">
              <div className="flex gap-2">
                <input type="text" value={cancelReason} onChange={e => setCancelReason(e.target.value)} placeholder="取消原因" className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs" />
                <Button variant="danger" size="sm" loading={cancelling} onClick={async () => {
                  if (!cancelReason.trim()) return;
                  setCancelling(true);
                  await supabase.from("work_sessions").update({ status: "void", void_reason: `订单取消: ${cancelReason}` }).eq("order_id", orderId).eq("status", "running");
                  if (order.current_machine_id) await supabase.from("machines").update({ status: "available" }).eq("id", order.current_machine_id as string);
                  await supabase.from("orders").update({ status: "cancelled", current_employee_id: null, current_machine_id: null, completion_note: `取消: ${cancelReason}`, updated_at: new Date().toISOString() }).eq("id", orderId);
                  setCancelling(false);
                  fetchOrder();
                }}>
                  取消订单
                </Button>
              </div>
            </div>
          )}

          {/* Full detail link */}
          <div className="border-t pt-3 text-center">
            <a href={`/orders/${orderId}`} className="text-sm text-blue-600 hover:underline" target="_blank">
              打开完整详情 / Ouvrir page complète ↗
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
