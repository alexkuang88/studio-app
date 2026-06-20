"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
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
  const { isAdmin } = useAuth();
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
  const [adjustAmt, setAdjustAmt] = useState("");
  const [adjustingAmt, setAdjustingAmt] = useState(false);
  const [adjustAmtMsg, setAdjustAmtMsg] = useState("");
  const [settleAmount, setSettleAmount] = useState("");
  const [settleSaving, setSettleSaving] = useState(false);

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
          <InfoBlock label="初始余额 / Solde initial" value={formatAmt((order.initial_balance as number) || 0)} />
          <InfoBlock label="订单金额 / Montant" value={formatAmt(orderAmountVal)} />
          {(order.unit_price as number || 0) > 0 && (
            <InfoBlock label="客单价" value={`¥ ${(order.unit_price as number || 0).toLocaleString("zh-CN")} / 100万`} />
          )}
          <InfoBlock label="订单收入" value={(order.order_revenue as number || 0) > 0 ? `¥ ${(order.order_revenue as number || 0).toLocaleString("zh-CN")}` : "—"} />
          <InfoBlock label="手机目标余额 / Solde cible" value={formatAmt((order.target_amount as number) || 0)} />
          {((order.total_client_amount as number) || 0) !== 0 && (
            <InfoBlock label="客户盈亏 / Solde client" value={((order.total_client_amount as number) || 0) > 0 ? `+${formatAmt((order.total_client_amount as number) || 0)}` : formatAmt((order.total_client_amount as number) || 0)} />
          )}
          <InfoBlock label="已完成 / Complété" value={formatAmt(completedAmount)} highlight={completedAmount >= orderAmountVal} />
          <InfoBlock label="未完成 / Restant" value={formatAmt(remainingAmount)} highlight={remainingAmount <= 0} />
          <InfoBlock label="下单时间 / Réception" value={formatDateTime(order.order_received_at as string)} />
          <InfoBlock label="要求完成时间 / Échéance" value={formatDateTime(order.expected_completion_at as string)} />
          <InfoBlock label="实际完成时间 / Fini le" value={formatDateTime(order.actual_completed_at as string)} />
          <InfoBlock
            label="完成状态 / Statut"
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
              <InfoBlock label="当前打手 / Employé" value={emp ? `${emp.employee_code} ${emp.chinese_name}` : "—"} />
              <InfoBlock label="当前设备 / Machine" value={machine ? `${machine.machine_code} ${machine.machine_name}` : "—"} />
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

        {/* 标记已收款 */}
        {isCompletedOrCancelled && !(order.is_settled as boolean) && (
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

        {/* Admin: 设置客单价 */}
        {isAdmin && (
          <div className="mt-4 pt-4 border-t">
            <div className="flex items-end gap-3">
              <Input
                label="客单价（¥/100万）"
                type="number"
                value={String((order.unit_price as number) || "")}
                onChange={async (e: React.ChangeEvent<HTMLInputElement>) => {
                  const price = parseFloat(e.target.value) || 0;
                  setOrder({ ...order, unit_price: price, order_revenue: Math.round(orderAmountVal / 100 * price) } as any);
                  await supabase.from("orders").update({
                    unit_price: price,
                    order_revenue: Math.round(orderAmountVal / 100 * price),
                  }).eq("id", id as string);
                }}
                placeholder="20"
              />
              <span className="pb-2 text-gray-500 text-sm">× {orderAmountVal.toLocaleString("zh-CN")}万/100</span>
              <div className="pb-0">
                <div className="text-xs text-gray-500 mb-1">= 收入</div>
                <div className="text-lg font-bold text-green-600">
                  ¥ {(order.unit_price as number || 0) > 0
                    ? Math.round(orderAmountVal / 100 * (order.unit_price as number || 0)).toLocaleString("zh-CN")
                    : "—"}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Admin: 调整订单金额（游戏币） */}
        {isAdmin && (
          <div className="mt-4 pt-4 border-t">
            <div className="flex items-end gap-3">
              <Input
                label="调整订单金额（万）"
                type="number"
                value={adjustAmt}
                onChange={(e) => setAdjustAmt(e.target.value)}
                placeholder={String(orderAmountVal)}
              />
              <Button size="sm" variant="primary"
                onClick={async () => {
                  const newAmt = parseFloat(adjustAmt);
                  if (!newAmt || newAmt <= 0) return;
                  setAdjustingAmt(true);
                  const newRev = Math.round(newAmt / 100 * ((order.unit_price as number) || 0));
                  await supabase.from("orders").update({
                    order_amount: newAmt,
                    order_revenue: newRev,
                  }).eq("id", id as string);
                  setAdjustAmtMsg(`✅ 已调整为 ${newAmt.toLocaleString("zh-CN")} 万`);
                  setAdjustingAmt(false);
                  setAdjustAmt("");
                  setOrder({ ...order, order_amount: newAmt, order_revenue: newRev } as any);
                }}
                loading={adjustingAmt}
                disabled={!adjustAmt}
              >确认调整 / Confirmer</Button>
              <span className="pb-2 text-gray-400 text-xs">收入将自动重算</span>
            </div>
            {adjustAmtMsg && <p className="text-xs text-green-600 mt-1">{adjustAmtMsg}</p>}
            <p className="text-xs text-gray-400 mt-1">老板跑路/未完成全额时使用，修改后收入按新金额计算</p>
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
      {Object.keys(employeeSummary).length > 0 && (
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
                <th className="px-3 py-2 text-left">员工 / Employé</th>
                <th className="px-3 py-2 text-left hidden md:table-cell">设备 / Machine</th>
                <th className="px-3 py-2 text-left">开始时间 / Heure début</th>
                <th className="px-3 py-2 text-left">结束时间 / Heure fin</th>
                <th className="px-3 py-2 text-right">初始游戏币 / Solde début</th>
                <th className="px-3 py-2 text-right">结束游戏币 / Solde fin</th>
                <th className="px-3 py-2 text-right font-medium">成绩(万) / Résultat</th>
                <th className="px-3 py-2 text-right hidden sm:table-cell">工时 / Heures</th>
                <th className="px-3 py-2 text-right hidden sm:table-cell">游戏币/每小时 / Pièces/h</th>
                <th className="px-3 py-2 text-center">状态 / Statut</th>
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
