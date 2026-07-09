"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { useLocale } from "@/lib/i18n/LocaleContext";
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
  calcRemainingAmount,
  calcOrderCompletedAmount,
  calcOverdueHours,
  formatAmount,
  formatSalary,
  calcSalary,
} from "@/lib/utils/calculations";

/** Display amount with French unit explanation (display only, not for calc) */
function formatAmt(amount: number): string {
  return `${formatAmount(amount)} (10k)`;
}
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { isAdmin, profile } = useAuth();
  const canEdit = isAdmin || profile?.role === "operator";
  const isRecorder = profile?.role === "recorder";
  const { t, locale } = useLocale();
  const [order, setOrder] = useState<Record<string, unknown> | null>(null);
  const [sessions, setSessions] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [salaryRate, setSalaryRate] = useState(700);
  const [voidReason, setVoidReason] = useState("");
  const [vodingId, setVodingId] = useState<string | null>(null);
  const [voiding, setVoiding] = useState(false);
  const [showAddAmount, setShowAddAmount] = useState(false);
  const [addAmount, setAddAmount] = useState("");
  const [addExpectedAt, setAddExpectedAt] = useState("");
  const [adding, setAdding] = useState(false);
  const [addMsg, setAddMsg] = useState("");
  const [workingNote, setWorkingNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);
  const [settleAmount, setSettleAmount] = useState("");
  const [settleSaving, setSettleSaving] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const supabase = createClient();

  // 加载现场备注
  useEffect(() => {
    if (order?.working_note !== undefined) {
      setWorkingNote((order.working_note as string) || "");
    }
  }, [order?.working_note]);

  const handleSaveNote = async () => {
    setSavingNote(true);
    await supabase.from("orders").update({ working_note: workingNote }).eq("id", id as string);
    setSavingNote(false);
    setNoteSaved(true);
    setTimeout(() => setNoteSaved(false), 2000);
  };

  useEffect(() => {
    async function fetchOrder() {
      // Fetch order
      const { data: orderData } = await supabase
        .from("orders")
        .select("*, employees(*), machines(*)")
        .eq("id", id)
        .single();

      if (orderData) setOrder(orderData as Record<string, unknown>);

      // Fetch work_sessions
      const { data: sessionsData } = await supabase
        .from("work_sessions")
        .select("*, employees(*), machines(*)")
        .eq("order_id", id)
        .order("start_time", { ascending: true });

      setSessions((sessionsData as Record<string, unknown>[]) || []);

      // Fetch salary rate
      const { data: settingsData } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "salary_rate")
        .single();
      if (settingsData) setSalaryRate(parseFloat(settingsData.value as string));

      setLoading(false);
    }

    fetchOrder();
  }, [id]);

  const handleVoid = async (sessionId: string) => {
    if (!voidReason.trim()) return;
    setVoiding(true);

    const res = await fetch(`/api/work-sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ void_reason: voidReason }),
    });

    if (res.ok) {
      setVoidReason("");
      setVodingId(null);
      window.location.reload();
    }
    setVoiding(false);
  };

  if (loading) {
    return (
      <div className="text-center py-12 text-gray-500">加载中... / Chargement...</div>
    );
  }

  if (!order) {
    return (
      <div className="text-center py-12 text-gray-500">订单不存在 / Commande introuvable</div>
    );
  }

  const completedAmount = calcOrderCompletedAmount(
    sessions as { result_amount: number | null; status: string }[]
  );
  const orderAmountVal = (order.order_amount as number) || ((order.target_amount as number) || 0) - ((order.initial_balance as number) || 0);
  const remainingAmount = Math.max(0, orderAmountVal - completedAmount);
  const status = (order.status as string) || "not_started";
  const isCompletedOrCancelled = status === "completed" || status === "cancelled";

  const handleAddAmount = async () => {
    if (!addAmount || parseFloat(addAmount) <= 0) return;
    setAdding(true);
    const res = await fetch("/api/orders/add-amount", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_id: id, extra_amount: parseFloat(addAmount), new_expected_at: addExpectedAt || null }),
    });
    const result = await res.json();
    if (res.ok) {
      setAddMsg(`✅ 加单 ${addAmount} 万成功，新订单金额 ${result.new_order_amount} 万`);
      setShowAddAmount(false); setAddAmount("");
      window.location.reload();
    } else {
      setAddMsg("❌ " + (result.error || "失败"));
    }
    setAdding(false);
  };
  const isOverdue =
    status !== "completed" &&
    status !== "cancelled" &&
    order.expected_completion_at
      ? new Date() > new Date(order.expected_completion_at as string)
      : false;
  const overdueHours =
    order.expected_completion_at
      ? calcOverdueHours(order.expected_completion_at as string, order.actual_completed_at as string)
      : 0;
  const isOnTime =
    status === "completed" &&
    order.actual_completed_at &&
    order.expected_completion_at
      ? new Date(order.actual_completed_at as string) <=
        new Date(order.expected_completion_at as string)
      : false;

  const emp = order.employees as Record<string, unknown> | null;
  const machine = order.machines as Record<string, unknown> | null;

  // Employee summary
  const employeeSummary: Record<string, { employee: Record<string, unknown>; totalResult: number; totalHours: number }> = {};
  for (const s of sessions) {
    if (s.status !== "completed") continue;
    const e = s.employees as Record<string, unknown>;
    const eid = e?.id as string;
    if (!eid) continue;
    if (!employeeSummary[eid]) {
      employeeSummary[eid] = {
        employee: e,
        totalResult: 0,
        totalHours: 0,
      };
    }
    employeeSummary[eid].totalResult += (s.result_amount as number) || 0;
    employeeSummary[eid].totalHours += (s.work_hours as number) || 0;
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl">
      <div className="flex items-center gap-4">
        <Link href="/orders">
          <Button variant="ghost" size="sm">
            <ArrowLeft size={18} />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            订单详情 / Détail commande
          </h1>
        </div>
      </div>

      {/* Order info */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-mono font-bold">{order.order_code as string}</h2>
            <Badge
              variant={
                status === "completed"
                  ? "green"
                  : status === "in_progress"
                  ? "blue"
                  : isOverdue
                  ? "red"
                  : "gray"
              }
            >
              {ORDER_STATUS_LABELS[status as OrderStatus] || status}
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <InfoBlock label="订单来源" value={ORDER_SOURCE_LABELS[order.order_source as keyof typeof ORDER_SOURCE_LABELS] || (order.order_source as string)} />
          <InfoBlock label={t("order.detail.initial_balance")} value={formatAmt((order.initial_balance as number) || 0)} />
          <InfoBlock label={t("order.detail.order_amount")} value={formatAmt(orderAmountVal)} />
          {!isRecorder && (order.unit_price as number || 0) > 0 && (
            <InfoBlock label={t("order.detail.unit_price")} value={`¥ ${(order.unit_price as number || 0).toLocaleString("zh-CN")} / 100万`} />
          )}
          {!isRecorder && <InfoBlock label={t("order.detail.order_revenue")} value={(order.order_revenue as number || 0) > 0 ? `¥ ${(order.order_revenue as number || 0).toLocaleString("zh-CN")}` : "—"} />}
          <InfoBlock label={t("order.detail.target_balance")} value={formatAmt((order.target_amount as number) || 0)} />
          {((order.total_client_amount as number) || 0) !== 0 && (
            <InfoBlock label={t("order.detail.client_balance")} value={((order.total_client_amount as number) || 0) > 0 ? `+${formatAmt((order.total_client_amount as number) || 0)}` : formatAmt((order.total_client_amount as number) || 0)} />
          )}
          <InfoBlock label={t("order.detail.completed")} value={formatAmt(completedAmount)} highlight={completedAmount >= orderAmountVal} />
          <InfoBlock label={t("order.detail.remaining")} value={formatAmt(remainingAmount)} highlight={remainingAmount <= 0} />
          <InfoBlock label={t("order.detail.received")} value={formatDateTime(order.order_received_at as string)} />
          <InfoBlock label={t("order.detail.expected")} value={formatDateTime(order.expected_completion_at as string)} />
          <InfoBlock label={t("order.detail.actual_completed")} value={formatDateTime(order.actual_completed_at as string)} />
          <InfoBlock
            label={t("order.detail.completion_status")}
            value={
              status === "completed"
                ? isOnTime
                  ? "✅ 按时完成 / À temps"
                  : `⚠️ 超时 ${formatHoursText(overdueHours)}`
                : "—"
            }
          />
          {(order.current_employee_id as string) && (
            <>
              <InfoBlock label={t("dash.operator")} value={emp ? `${emp.employee_code} ${emp.chinese_name}` : "—"} />
              <InfoBlock label={t("order.detail.current_machine")} value={machine ? `${machine.machine_code} / Machine ${String(machine.machine_code).replace(/^M0*/, "")}` : "—"} />
            </>
          )}
        </div>

        {((order.client_note as string) || (order.note as string) || (order.responsible_user as string)) && (
          <div className="mt-4 pt-4 border-t text-sm text-gray-500 space-y-1">
            {(order.responsible_user as string) && <p>负责人 / Responsable: {order.responsible_user as string}</p>}
            {(order.client_note as string) && <p>客户备注 / Note client: {order.client_note as string}</p>}
            {(order.note as string) && <p>备注 / Note: {order.note as string}</p>}
          </div>
        )}

        {/* 取消订单 */}
        {!isCompletedOrCancelled && (
          <div className="mt-4 pt-4 border-t">
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="block text-xs text-gray-600 mb-1">取消原因 / Raison d'annulation</label>
                <input type="text" value={cancelReason} onChange={e => setCancelReason(e.target.value)}
                  placeholder="客户取消 / Client a annulé"
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
              </div>
              <Button variant="danger" size="sm"
                loading={cancelling}
                onClick={async () => {
                  if (!cancelReason.trim()) return;
                  setCancelling(true);
                  // 如果有running分段，先关闭
                  await supabase.from("work_sessions").update({
                    status: "void", void_reason: `订单取消: ${cancelReason}`
                  }).eq("order_id", id as string).eq("status", "running");
                  // 释放设备
                  if (order.current_machine_id) {
                    await supabase.from("machines").update({ status: "available" }).eq("id", order.current_machine_id as string);
                  }
                  // 取消订单
                  await supabase.from("orders").update({
                    status: "cancelled", current_employee_id: null, current_machine_id: null,
                    completion_note: `取消: ${cancelReason}`, updated_at: new Date().toISOString()
                  }).eq("id", id as string);
                  setCancelling(false);
                  window.location.reload();
                }}>
                取消订单 / Annuler
              </Button>
            </div>
          </div>
        )}

        {/* 标记已收款 */}
        {isCompletedOrCancelled && !(order.is_settled as boolean) && canEdit && (
          <div className="mt-4 pt-4 border-t">
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="block text-xs text-gray-600 mb-1">结算金额 / Montant réglé</label>
                <input type="number"
                  value={settleAmount}
                  onChange={e => setSettleAmount(e.target.value)}
                  placeholder={(order.order_revenue as number) > 0 ? String(order.order_revenue) : "输入实际收款金额"}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900" />
              </div>
              <Button variant="primary" size="sm"
                loading={settleSaving}
                onClick={async () => {
                  setSettleSaving(true);
                  const amt = parseFloat(settleAmount);
                  await supabase.from("orders").update({
                    is_settled: true,
                    settled_amount: !isNaN(amt) && amt > 0 ? amt : (order.order_revenue as number) || null,
                    settled_at: new Date().toISOString(),
                    settled_note: "详情页手动标记",
                  }).eq("id", id as string);
                  setOrder({ ...order, is_settled: true, settled_amount: !isNaN(amt) && amt > 0 ? amt : (order.order_revenue as number) } as any);
                  setSettleSaving(false);
                  setSettleAmount("");
                }}>
                ✅ 标记已收款
              </Button>
            </div>
            <p className="text-xs text-gray-400 mt-1">输入实际到手金额，留空则默认使用系统收入</p>
          </div>
        )}
        {(order.is_settled as boolean) && (
          <div className="mt-4 pt-4 border-t">
            <div className="flex items-center gap-2 text-sm text-green-600">
              <span>✅ 已收款</span>
              {(order.settled_amount as number) > 0 && (
                <span className="font-bold">¥ {(order.settled_amount as number || order.order_revenue as number || 0).toLocaleString("zh-CN")}</span>
              )}
              <span className="text-xs text-gray-400">{order.settled_at ? new Date(order.settled_at as string).toLocaleString("zh-CN") : ""}</span>
            </div>
          </div>
        )}

        {/* 现场备注 — 随时编辑 */}
        <div className="mt-4 pt-4 border-t">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-medium text-gray-700">📝 现场备注 / Note terrain</span>
            <span className="text-xs text-gray-400">| 随时编辑记录 / Éditable à tout moment</span>
            {noteSaved && <span className="text-xs text-green-600 font-medium">✓ 已保存 / Sauvegardé</span>}
          </div>
          <textarea
            value={workingNote}
            onChange={(e) => { setWorkingNote(e.target.value); setNoteSaved(false); }}
            rows={3}
            placeholder="例如：老板挤号，明天上午10点可以登号接着打... / Ex: patron a repris le compte, dispo demain 10h..."
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex justify-end mt-2">
            <Button size="sm" variant="primary" onClick={handleSaveNote} loading={savingNote}>
              保存备注 / Enregistrer
            </Button>
          </div>
        </div>

        {/* 客户加单 — Admin 和 Operator 都能用 */}
        {!isCompletedOrCancelled && (
          <div className="mt-4 pt-4 border-t">
            {!showAddAmount ? (
              <button onClick={() => { setShowAddAmount(true); setAddMsg(""); }}
                className="w-full py-2 rounded-lg bg-green-500 hover:bg-green-600 text-white text-sm font-medium transition-colors">
                ➕ 客户加单 / Ajouter au montant
              </button>
            ) : (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-3">
                <h4 className="font-semibold text-green-800">客户加单 / Ajouter du montant</h4>
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <label className="block text-xs text-gray-600 mb-1">追加金额（万） / Montant (10k)</label>
                    <input type="number" value={addAmount} onChange={e => setAddAmount(e.target.value)}
                      placeholder="例如 500 / Ex: 500" className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs text-gray-600 mb-1">新要求完成时间（可选） / Échéance (optionnel)</label>
                    <input type="datetime-local" value={addExpectedAt} onChange={e => setAddExpectedAt(e.target.value)}
                      className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
                  </div>
                </div>
                {addAmount && (
                  <div className="text-sm text-green-700">
                    新订单金额 / Nv montant: {(orderAmountVal + (parseFloat(addAmount)||0)).toLocaleString("zh-CN")} 万
                    {(order.unit_price as number || 0) > 0 && (
                      ` | 新收入 / Nv revenu: ¥ ${Math.round((orderAmountVal + (parseFloat(addAmount)||0)) / 100 * ((order.unit_price as number)||0)).toLocaleString("zh-CN")}`
                    )}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleAddAmount} loading={adding} disabled={!addAmount}>确认加单 / Confirmer</Button>
                  <Button size="sm" variant="ghost" onClick={() => { setShowAddAmount(false); setAddAmount(""); }}>取消 / Annuler</Button>
                </div>
                {addMsg && <p className={`text-xs ${addMsg.startsWith("✅") ? "text-green-600" : "text-red-600"}`}>{addMsg}</p>}
              </div>
            )}
          </div>
        )}

        {/* 编辑订单数据 — Admin & Operator */}
        {!isRecorder && canEdit && (
          <div className="mt-4 pt-4 border-t">
            <h3 className="font-semibold text-gray-800 mb-3">编辑订单数据 / Modifier la commande</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {[
                { k: "order_amount", label: "订单金额(万)" },
                { k: "target_amount", label: "目标余额(万)" },
                { k: "completed_amount", label: "已完成(万)" },
                { k: "initial_balance", label: "初始余额(万)" },
                { k: "unit_price", label: "客单价" },
                { k: "order_revenue", label: "收入" },
                { k: "latest_balance", label: "最新余额(万)" },
                { k: "total_client_amount", label: "客户盈亏(万)" },
              ].map(({ k, label }) => (
                <div key={k}>
                  <label className="block text-xs text-gray-500 mb-0.5">{label}</label>
                  <input
                    type="number"
                    step="any"
                    defaultValue={String((order as any)[k] ?? "")}
                    onBlur={async (e) => {
                      const val = e.target.value;
                      if (val === "" || val === String((order as any)[k] ?? "")) return;
                      const num = parseFloat(val);
                      if (isNaN(num)) { e.target.value = String((order as any)[k] ?? ""); return; }
                      const updates: any = { [k]: num };
                      if (k === "unit_price") {
                        updates.order_revenue = Math.round(orderAmountVal / 100 * num);
                      }
                      if (k === "order_amount") {
                        updates.order_revenue = Math.round(num / 100 * ((order.unit_price as number) || 0));
                        updates.target_amount = ((order.initial_balance as number) || 0) + num;
                      }
                      await supabase.from("orders").update(updates).eq("id", id as string);
                      e.target.value = String(num);
                      setOrder({ ...order, ...updates } as any);
                      if (k === "order_amount") window.location.reload();
                    }}
                    className="w-full rounded border border-gray-300 px-2 py-1 text-xs font-mono"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 客户上号记录 */}
      {sessions.filter((s) => (s.balance_gap as number) !== 0).length > 0 && (
        <div className="bg-white rounded-xl border border-orange-200 overflow-hidden">
          <div className="px-6 py-4 border-b bg-orange-50">
            <h3 className="font-semibold text-orange-800">客户上号记录 / Activité client</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-orange-50/50 border-b">
                <tr>
                  <th className="px-4 py-2 text-left">时间 / Heure</th>
                  <th className="px-4 py-2 text-left">原因 / Raison</th>
                  <th className="px-4 py-2 text-right">余额变化 / Variation</th>
                  <th className="px-4 py-2 text-right">订单目标调整 / Ajustement</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sessions.filter((s) => (s.balance_gap as number) !== 0).map((ws) => {
                  const gap = ws.balance_gap as number;
                  return (
                    <tr key={ws.id as string} className="hover:bg-orange-50/30">
                      <td className="px-4 py-2 text-xs">{formatDateTime(ws.start_time as string)}</td>
                      <td className="px-4 py-2 text-xs">{ws.gap_reason as string || "—"}</td>
                      <td className={`px-4 py-2 text-right font-mono text-xs font-bold ${gap > 0 ? "text-green-600" : "text-red-600"}`}>
                        {gap > 0 ? "+" : ""}{gap.toLocaleString("zh-CN")} 万
                      </td>
                      <td className="px-4 py-2 text-right text-xs text-gray-500">
                        {gap > 0 ? "减" : "加"} {Math.abs(gap).toLocaleString("zh-CN")} 万
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Employee summary */}
      {!isRecorder && Object.keys(employeeSummary).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b bg-gray-50">
            <h3 className="font-semibold">员工参与汇总 / Résumé par employé</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-2 text-left">员工 / Employé</th>
                  <th className="px-4 py-2 text-right">完成金额(万) / Montant</th>
                  <th className="px-4 py-2 text-right">总工时(h) / Heures</th>
                  <th className="px-4 py-2 text-right">平均效率(万/h) / Efficacité</th>
                  <th className="px-4 py-2 text-right">工资估算 / Salaire est.</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {Object.values(employeeSummary).map((item) => (
                  <tr key={item.employee.id as string} className="hover:bg-gray-50">
                    <td className="px-4 py-2">
                      {item.employee.employee_code as string} {item.employee.chinese_name as string}
                    </td>
                    <td className="px-4 py-2 text-right font-mono">
                      {item.totalResult.toLocaleString("zh-CN")}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {item.totalHours.toFixed(1)}h
                    </td>
                    <td className="px-4 py-2 text-right">
                      {item.totalHours > 0
                        ? (item.totalResult / item.totalHours).toFixed(1)
                        : "—"}
                    </td>
                    <td className="px-4 py-2 text-right font-mono">
                      {formatSalary(calcSalary(item.totalResult, salaryRate))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Work sessions list */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b bg-gray-50">
          <h3 className="font-semibold">分段记录 / Sessions de travail</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-3 py-2 text-left">{t("order.detail.col_emp")}</th>
                <th className="px-3 py-2 text-left hidden md:table-cell">{t("order.detail.col_device")}</th>
                <th className="px-3 py-2 text-left">{t("order.detail.col_start_time")}</th>
                <th className="px-3 py-2 text-left">{t("order.detail.col_end_time")}</th>
                <th className="px-3 py-2 text-right">{t("order.detail.col_start_amount")}</th>
                <th className="px-3 py-2 text-right">{t("order.detail.col_end_amount")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("order.detail.col_result")}</th>
                <th className="px-3 py-2 text-right hidden sm:table-cell">{t("order.detail.col_hours")}</th>
                <th className="px-3 py-2 text-right hidden sm:table-cell">{t("order.detail.col_efficiency")}</th>
                <th className="px-3 py-2 text-center">{t("order.detail.col_status")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sessions.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-6 text-center text-gray-500">
                    暂无记录 / Aucune session
                  </td>
                </tr>
              ) : (
                sessions.map((ws) => {
                  const wsEmp = ws.employees as Record<string, unknown> | null;
                  const wsMachine = ws.machines as Record<string, unknown> | null;
                  const wsStatus = ws.status as string;
                  return (
                    <tr
                      key={ws.id as string}
                      className={`hover:bg-gray-50 ${
                        wsStatus === "void" ? "bg-red-50 text-gray-400" : ""
                      } ${wsStatus === "running" ? "bg-blue-50" : ""}`}
                    >
                      <td className="px-3 py-2 whitespace-nowrap">
                        {wsEmp
                          ? `${wsEmp.employee_code} ${wsEmp.chinese_name}`
                          : "—"}
                      </td>
                      <td className="px-3 py-2 hidden md:table-cell">
                        {wsMachine?.machine_code as string || "—"}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {formatDateTime(ws.start_time as string)}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {formatDateTime(ws.end_time as string)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        {(ws.start_amount as number)?.toLocaleString("zh-CN")}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        {ws.end_amount != null
                          ? (ws.end_amount as number).toLocaleString("zh-CN")
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-medium">
                        {ws.result_amount != null
                          ? (ws.result_amount as number).toLocaleString("zh-CN")
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-right text-xs hidden sm:table-cell">
                        {ws.work_hours != null ? `${(ws.work_hours as number).toFixed(1)}h` : "—"}
                      </td>
                      <td className="px-3 py-2 text-right text-xs hidden sm:table-cell">
                        {ws.efficiency != null ? `${(ws.efficiency as number).toFixed(1)}` : "—"}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {wsStatus === "running" ? (
                          <Badge variant="blue">进行中 / En cours</Badge>
                        ) : wsStatus === "void" ? (
                          <Badge variant="red">已作废 / Annulé</Badge>
                        ) : (
                          <Badge variant="green">已完成 / Terminé</Badge>
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

      {/* Void section */}
      {isAdmin && vodingId && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
          <h4 className="font-semibold text-red-800">作废记录 / Annuler la session</h4>
          <Input
            label="作废原因 / Raison *"
            value={voidReason}
            onChange={(e) => setVoidReason(e.target.value)}
            placeholder="请填写作废原因..."
          />
          <div className="flex gap-2">
            <Button
              variant="danger"
              onClick={() => handleVoid(vodingId)}
              loading={voiding}
              disabled={!voidReason.trim()}
            >
              确认作废 / Confirmer
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setVodingId(null);
                setVoidReason("");
              }}
            >
              取消 / Annuler
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoBlock({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-gray-500 mb-0.5">{label}</dt>
      <dd
        className={`text-sm font-medium ${
          highlight ? "text-green-600 font-bold" : "text-gray-900"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
