"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/types/database";
import { formatDateTime, formatHours as formatHoursText } from "@/lib/utils/time-utils";
import { calcRemainingAmount, calcOrderCompletedAmount, calcOverdueHours, formatAmount } from "@/lib/utils/calculations";
import { ArrowLeft, CheckCircle, AlertTriangle } from "lucide-react";
import Link from "next/link";

export default function CompleteOrderPage() {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const supabase = createClient();

  const [orders, setOrders] = useState<Array<Record<string, unknown>>>([]);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Record<string, unknown> | null>(null);
  const [sessions, setSessions] = useState<Array<Record<string, unknown>>>([]);
  const [completionNote, setCompletionNote] = useState("");
  const [forceReason, setForceReason] = useState("");
  const [endAmount, setEndAmount] = useState(""); // 结束最后一棒余额
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    supabase
      .from("orders")
      .select("id, order_code, target_amount, initial_balance, order_amount, status, current_employee_id, current_machine_id, employees!orders_current_employee_id_fkey(employee_code,chinese_name), machines!orders_current_machine_id_fkey(machine_code,machine_name)")
      .in("status", ["in_progress","ready_to_complete","not_started","overdue"])
      .order("created_at", { ascending: false })
      .then(({ data }) => setOrders((data as Record<string, unknown>[]) || []));
  }, []);

  useEffect(() => {
    if (!selectedOrderId) { setSelectedOrder(null); return; }

    supabase
      .from("orders")
      .select("*, employees(*), machines(*)")
      .eq("id", selectedOrderId)
      .single()
      .then(({ data }) => setSelectedOrder(data as Record<string, unknown>));

    supabase
      .from("work_sessions")
      .select("*, employees(*)")
      .eq("order_id", selectedOrderId)
      .order("start_time", { ascending: true })
      .then(({ data }) => setSessions((data as Record<string, unknown>[]) || []));
  }, [selectedOrderId]);

  const hasRunning = sessions.some((s) => s.status === "running");

  const handleComplete = async () => {
    setError("");
    setSuccess("");

    if (!selectedOrder) return;

    // 如果有 running session 但没填结束余额
    if ((hasRunning || !isGoalReached) && !endAmount.trim()) {
      setError("请填写结束余额");
      return;
    }

    const completedAmount = (selectedOrder.completed_amount as number) || 0;
    const targetAmount = (selectedOrder.target_amount as number) || 0;
    const initialBalance = (selectedOrder.initial_balance as number) || 0;
    const orderAmount = (selectedOrder.order_amount as number) || (targetAmount - initialBalance);
    const potentialAmount = endAmount
      ? parseFloat(endAmount)
      : completedAmount;
    const isForce = potentialAmount < orderAmount;

    if (isForce && !forceReason.trim()) {
      setError("提前结束必须填写原因");
      return;
    }

    setLoading(true);
    const res = await fetch(`/api/work-sessions/complete-order/${selectedOrderId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        note: completionNote || null,
        force_complete_reason: isForce ? forceReason : null,
        end_amount: endAmount ? parseFloat(endAmount) : null,
      }),
    });

    const result = await res.json();

    if (!res.ok) {
      setError(result.error || "操作失败");
      setLoading(false);
      return;
    }

    setSuccess(
      `✅ 订单已完成！${result.is_on_time ? "按时完成 / À temps" : "超时完成 / Terminé en retard"}`
    );
    setLoading(false);

    setTimeout(() => router.push("/orders"), 1500);
  };

  const completedAmount = (selectedOrder?.completed_amount as number) || 0;
  const targetAmount = (selectedOrder?.target_amount as number) || 0;
  const initialBalance = (selectedOrder?.initial_balance as number) || 0;
  const totalClientAmount = (selectedOrder?.total_client_amount as number) || 0;
  const orderAmount = (selectedOrder?.order_amount as number) || (targetAmount - initialBalance);
  const runningSession = sessions.find((s) => s.status === "running");
  const runningStartAmount = runningSession ? (runningSession.start_amount as number) || 0 : 0;
  const remainingAmount = Math.max(0, orderAmount - completedAmount);
  const isGoalReached = completedAmount >= orderAmount;

  return (
    <div className="space-y-6 animate-fade-in max-w-xl">
      <div className="flex items-center gap-4">
        <Link href="/entry"><Button variant="ghost" size="sm"><ArrowLeft size={18} /></Button></Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">完成订单 / Terminer la commande</h1>
          <p className="text-sm text-gray-500 mt-1">人工确认订单完成</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        {error && <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}
        {success && <div className="bg-green-50 text-green-700 px-4 py-3 rounded-lg text-sm font-medium">{success}</div>}

        <Select
          label="选择订单 / Choisir commande *"
          value={selectedOrderId}
          onChange={(e) => setSelectedOrderId(e.target.value)}
          options={orders.map((o) => ({
            value: o.id as string,
            label: `${o.order_code} — ${(o.order_amount as number) || ((o.target_amount as number) || 0) - ((o.initial_balance as number) || 0)}万 [${o.status}]${(o.employees as any)?.employee_code ? ` | ${(o.employees as any).employee_code} ${(o.employees as any).chinese_name}` : ""}${(o.machines as any)?.machine_code ? ` | ${(o.machines as any).machine_code}` : ""}`,
          }))}
          placeholder="请选择订单..."
        />

        {selectedOrder && (
          <>
            {/* Order summary */}
            <div className={`rounded-lg p-4 space-y-2 text-sm ${isGoalReached ? "bg-green-50 border border-green-200" : "bg-gray-50"}`}>
              <h4 className="font-semibold">{selectedOrder.order_code as string}</h4>
              <InfoLine label="订单金额" value={formatAmount(orderAmount)} />
              <InfoLine label="手机初始余额" value={formatAmount(initialBalance)} />
              <InfoLine label="手机完成余额" value={formatAmount(targetAmount)} />
              {totalClientAmount !== 0 && (
                <InfoLine label="客户盈亏" value={totalClientAmount > 0 ? `+${formatAmount(totalClientAmount)}` : formatAmount(totalClientAmount)} />
              )}
              <InfoLine label="已完成" value={formatAmount(completedAmount)} highlight={isGoalReached} />
              <InfoLine label="仍需打" value={formatAmount(remainingAmount)} highlight={remainingAmount <= 0} />
              <InfoLine label="当前状态" value={ORDER_STATUS_LABELS[(selectedOrder.status as OrderStatus)] || (selectedOrder.status as string)} />

              {hasRunning && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mt-2 space-y-2">
                  <p className="text-sm text-yellow-800">
                    ⚠️ 当前打手还在打单（开始余额 {runningStartAmount.toLocaleString("zh-CN")} 万），请填写结束余额
                  </p>
                  <Input
                    label={`结束余额 / Solde final (≥ ${runningStartAmount.toLocaleString("zh-CN")} 万)`}
                    type="number"
                    value={endAmount}
                    onChange={(e) => setEndAmount(e.target.value)}
                    placeholder={`>= ${runningStartAmount}`}
                  />
                  {endAmount && parseFloat(endAmount) >= runningStartAmount && (
                    <p className="text-xs text-green-700">
                      本次最后一棒成绩: {(parseFloat(endAmount) - runningStartAmount).toLocaleString("zh-CN")} 万 |
                      完成后总金额: {((completedAmount || 0) + parseFloat(endAmount) - runningStartAmount).toLocaleString("zh-CN")} 万
                    </p>
                  )}
                </div>
              )}
              {!hasRunning && !isGoalReached && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mt-2 space-y-2">
                  <p className="text-sm text-yellow-800">
                    ⚠️ 订单暂停中，请填写最后一棒结束余额（当前已完成 {completedAmount.toLocaleString("zh-CN")} 万）
                  </p>
                  <Input
                    label={`结束余额 / Solde final *`}
                    type="number"
                    value={endAmount}
                    onChange={(e) => setEndAmount(e.target.value)}
                    placeholder={`>= ${completedAmount}`}
                  />
                </div>
              )}

              {isGoalReached ? (
                <div className="bg-green-100 text-green-800 px-3 py-2 rounded font-medium text-center mt-2">
                  ✅ 已达到订单金额 {orderAmount.toLocaleString("zh-CN")} 万，可以完成订单
                </div>
              ) : (
                <div className="bg-orange-100 text-orange-800 px-3 py-2 rounded text-sm">
                  <AlertTriangle size={16} className="inline mr-1" />
                  还需打 {remainingAmount.toLocaleString("zh-CN")} 万才能达到订单金额。全员可提前结束。
                </div>
              )}
            </div>

            {/* Completion note */}
            <Input
              label="完成备注 / Note de complétion"
              value={completionNote}
              onChange={(e) => setCompletionNote(e.target.value)}
              placeholder="（可选）"
            />

            {/* Force complete reason (Admin only, shown when not reached) */}
            {!isGoalReached && (
              <Input
                label="提前结束原因 / Raison de complétion forcée *"
                value={forceReason}
                onChange={(e) => setForceReason(e.target.value)}
                placeholder="必须填写提前结束原因..."
              />
            )}

            <Button
              variant={isGoalReached ? "success" : "danger"}
              size="lg"
              block
              onClick={handleComplete}
              loading={loading}
              disabled={!isGoalReached && !forceReason.trim()}
            >
              <CheckCircle size={20} className="mr-2" />
              {isGoalReached ? "完成订单 / Terminer" : "提前结束 / Terminer en avance"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function InfoLine({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}:</span>
      <span className={`font-medium ${highlight ? "text-green-700 font-bold text-lg" : "text-gray-900"}`}>{value}</span>
    </div>
  );
}
