"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { createClient } from "@/lib/supabase/client";
import { nowDatetimeLocal, mgDatetimeToUTC } from "@/lib/utils/time-utils";
import { ArrowLeft, Play } from "lucide-react";
import Link from "next/link";

export default function StartSessionPage() {
  const { t } = useLocale();
  const router = useRouter();
  const supabase = createClient();

  const [orders, setOrders] = useState<Array<{ id: string; order_code: string; target_amount: number; initial_balance: number; order_amount?: number; status: string }>>([]);
  const [employees, setEmployees] = useState<Array<{ id: string; employee_code: string; chinese_name: string; status: string; current_order?: string | null; current_machine?: string | null }>>([]);
  const [machines, setMachines] = useState<Array<{ id: string; machine_code: string; machine_name: string; status: string; current_employee?: string | null }>>([]);
  const [busyEmployeeIds, setBusyEmployeeIds] = useState<Set<string>>(new Set());
  const [runningForOrder, setRunningForOrder] = useState<Record<string, string>>({}); // order_id → employee_id who's running
  const [selectedOrder, setSelectedOrder] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [selectedMachine, setSelectedMachine] = useState("");
  const [startTime, setStartTime] = useState(nowDatetimeLocal());
  const [startAmount, setStartAmount] = useState("0");
  const [lastEndAmount, setLastEndAmount] = useState<number | null>(null);
  const [gapReason, setGapReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSamePlayer, setIsSamePlayer] = useState(false); // 同一个人回来继续打

  const balanceGap = lastEndAmount != null && startAmount
    ? parseFloat(startAmount) - lastEndAmount
    : 0;
  const hasGap = balanceGap !== 0 && lastEndAmount != null;

  // 当选择订单时，自动计算初始余额
  useEffect(() => {
    if (!selectedOrder) { setStartAmount("0"); return; }
    const order = orders.find(o => o.id === selectedOrder);
    if (!order) return;

    // 查该订单最后一条 completed work_session 的 end_amount
    supabase
      .from("work_sessions")
      .select("end_amount")
      .eq("order_id", selectedOrder)
      .eq("status", "completed")
      .order("end_time", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0 && data[0].end_amount != null) {
          // 有已完成记录 → 用上一位的结束余额
          const lastEnd = data[0].end_amount as number;
          setLastEndAmount(lastEnd);
          setStartAmount(String(lastEnd));
        } else {
          // 新订单 → 用订单的初始余额
          const ib = (order as { initial_balance?: number }).initial_balance || 0;
          setLastEndAmount(null);
          setStartAmount(String(ib));
        }
        setGapReason("");
      });
  }, [selectedOrder, orders]);

  useEffect(() => {
    async function loadData() {
      // Fetch all in parallel
      const [orderRes, empRes, mcRes, runningRes] = await Promise.all([
        supabase.from("orders").select("id, order_code, target_amount, initial_balance, order_amount, status").order("created_at", { ascending: false }),
        supabase.from("employees").select("id, employee_code, chinese_name, status").eq("is_active", true).order("employee_code"),
        supabase.from("machines").select("id, machine_code, machine_name, status").eq("is_active", true).order("machine_code"),
        supabase.from("work_sessions").select("employee_id, machine_id, orders(order_code), machines(machine_code)").eq("status", "running"),
      ]);

      // Orders
      if (orderRes.data) {
        const activeOrders = (orderRes.data as typeof orders).filter(
          (o) => o.status !== "completed" && o.status !== "cancelled"
        );
        setOrders(activeOrders);
      }

      // Running info
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const running = (runningRes.data || []) as any[];
      const busyEmpIds = new Set<string>();
      const ordRunMap: Record<string, string> = {};
      for (const r of running) {
        busyEmpIds.add(r.employee_id as string);
        if (r.orders?.order_code) {
          ordRunMap[r.order_id as string] = r.employee_id as string;
        }
      }
      setBusyEmployeeIds(busyEmpIds);
      setRunningForOrder(ordRunMap);

      // Employees with status
      const emps = ((empRes.data || []) as typeof employees);
      setEmployees(emps);

      // Machines
      setMachines((mcRes.data || []) as typeof machines);
    }
    loadData();
  }, []);

  // 检查选的打手是不是正在跑这个订单的同一个人（客户上号后回来继续打）
  useEffect(() => {
    if (selectedOrder && selectedEmployee) {
      const currentRunner = runningForOrder[selectedOrder];
      setIsSamePlayer(currentRunner === selectedEmployee);
    } else {
      setIsSamePlayer(false);
    }
  }, [selectedOrder, selectedEmployee, runningForOrder]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    // 防呆：余额超过 2000 万弹确认
    const initBal = parseFloat(startAmount) || 0;
    if (initBal > 2000) {
      if (!confirm(`⚠️ 手机当前余额 ${initBal.toLocaleString("zh-CN")} 万，确认正确吗？\n\n请核实手机实际余额！`)) return;
    }

    if (!selectedOrder || !selectedEmployee || !selectedMachine) {
      setError("请选择订单、打手和设备");
      return;
    }

    // If balance changed (client played), require reason but just as note
    if (hasGap && !gapReason.trim()) {
      setError("余额有变化，请填写原因（客户上号？）/ Veuillez expliquer la différence de solde");
      return;
    }

    // Same player back after client kicked them — use API
    if (isSamePlayer) {
      const res = await fetch("/api/work-sessions/checkpoint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: null, // will be resolved by API
          order_id: selectedOrder,
          employee_id: selectedEmployee,
          current_balance: parseFloat(startAmount),
          balance_gap: hasGap ? balanceGap : 0,
          gap_reason: hasGap ? gapReason : null,
        }),
      });
      const result = await res.json();
      if (!res.ok) { setError(result.error || "操作失败"); setLoading(false); return; }
      setSuccess("✅ 已恢复打单，余额已更新！");
      setLoading(false);
      setTimeout(() => router.push("/machines/dashboard"), 1500);
      return;
    }

    const emp = employees.find((e) => e.id === selectedEmployee);
    if (emp && emp.status !== "official" && emp.status !== "advanced") {
      if (!confirm(`该员工状态为"${emp.status}"，确定要继续吗？`)) return;
    }

    setLoading(true);
    const res = await fetch("/api/work-sessions/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        order_id: selectedOrder,
        employee_id: selectedEmployee,
        machine_id: selectedMachine,
        start_time: mgDatetimeToUTC(startTime),
        start_amount: parseFloat(startAmount) || 0,
        balance_gap: hasGap ? balanceGap : 0,
        gap_reason: hasGap ? gapReason : null,
      }),
    });

    const result = await res.json();

    if (!res.ok) {
      setError(result.error || "操作失败");
      setLoading(false);
      return;
    }

    setSuccess("✅ 打单已开始 / Session démarrée!");
    setLoading(false);

    setTimeout(() => {
      router.push("/machines/dashboard");
    }, 1500);
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-xl">
      <div className="flex items-center gap-4">
        <Link href="/entry">
          <Button variant="ghost" size="sm"><ArrowLeft size={18} /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("ss.title")}</h1>
          <p className="text-sm text-gray-500 mt-1">{t("ss.subtitle")}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        {error && <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}
        {success && <div className="bg-green-50 text-green-700 px-4 py-3 rounded-lg text-sm font-medium">{success}</div>}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t("ss.order")} *</label>
          <select
            value={selectedOrder}
            onChange={(e) => setSelectedOrder(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">{t("ss.order_placeholder")}</option>
            {orders.map((o) => (
              <option key={o.id} value={o.id}>
                {o.order_code} — {((o.order_amount as number) || o.target_amount - (o.initial_balance || 0)).toLocaleString("zh-CN")}万 [{o.status}]
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t("ss.machine")} *</label>
          <select
            value={selectedMachine}
            onChange={(e) => setSelectedMachine(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">{t("ss.machine_placeholder")}</option>
            {machines.map((m) => {
              const isBusy = m.status === "in_use";
              const isDisabled = m.status === "repair" || m.status === "disabled";
              return (
                <option key={m.id} value={m.id} disabled={isDisabled}>
                  {m.machine_code} {m.machine_name}
                  {isBusy ? " 🔴 使用中" : " 🟢 空闲"}
                  {isDisabled ? " ⛔" : ""}
                </option>
              );
            })}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t("ss.employee")} *</label>
          <div className="grid grid-cols-1 gap-2 mb-2">
            {employees.length === 0 && (
              <p className="text-sm text-gray-400 py-2">{t("ss.no_employees")}</p>
            )}
            {employees
              .filter((e) => e.status !== "training")
              .map((e) => {
              const isBusy = busyEmployeeIds.has(e.id) && runningForOrder[selectedOrder] !== e.id;
              const isSame = isSamePlayer && selectedEmployee === e.id;
              return (
                <button
                  type="button"
                  key={e.id}
                  onClick={() => setSelectedEmployee(e.id)}
                  className={`flex items-center justify-between px-4 py-3 rounded-lg border-2 transition-all text-left cursor-pointer ${
                    selectedEmployee === e.id
                      ? "border-blue-500 bg-blue-50 ring-2 ring-blue-200"
                      : "border-gray-200 hover:border-blue-300 hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${isBusy ? "bg-red-400" : "bg-green-400"}`} />
                    <div>
                      <span className="font-medium text-gray-900">
                        {e.employee_code} {e.chinese_name}
                      </span>
                      <span className="text-xs text-gray-400 ml-2">[{e.status}]</span>
                    </div>
                  </div>
                  <div>
                    {isSame ? (
                      <Badge variant="blue">🔵 回来继续</Badge>
                    ) : isBusy ? (
                      <Badge variant="red">🔴 打单中</Badge>
                    ) : (
                      <Badge variant="green">🟢 空闲</Badge>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <Input
          label={t("ss.start_time") + " *"}
          type="datetime-local"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
        />

        <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
          <label className="block text-sm font-medium text-gray-600 mb-1">
            {t("ss.start_amount")} *
          </label>
          <input
            type="number"
            value={startAmount}
            onChange={(e) => setStartAmount(e.target.value)}
            className="w-full text-2xl font-mono font-bold bg-transparent border-none focus:outline-none focus:ring-0 text-gray-900"
            placeholder="0"
          />
          <p className="text-xs text-blue-600 mt-1">
            💡 {t("ss.auto_fill_hint")}
          </p>
        </div>

        {/* Balance gap warning */}
        {hasGap && (
          <div className={`rounded-lg p-4 space-y-3 ${balanceGap > 0 ? "bg-orange-50 border-2 border-orange-300" : "bg-red-50 border-2 border-red-300"}`}>
            <div className="flex items-center gap-2">
              <span className="text-xl">{balanceGap > 0 ? "⚠️" : "🔻"}</span>
              <div>
                <p className={`font-semibold ${balanceGap > 0 ? "text-orange-800" : "text-red-800"}`}>
                  {balanceGap > 0 ? `余额增加 +${balanceGap.toLocaleString("zh-CN")} 万` : `余额减少 ${balanceGap.toLocaleString("zh-CN")} 万`}
                </p>
                <p className={`text-xs ${balanceGap > 0 ? "text-orange-600" : "text-red-600"}`}>
                  上次结束 {lastEndAmount?.toLocaleString("zh-CN")} 万 → 现在 {parseFloat(startAmount || "0").toLocaleString("zh-CN")} 万
                  （客户{balanceGap > 0 ? "赢了" : "输了"} {Math.abs(balanceGap).toLocaleString("zh-CN")} 万）
                </p>
              </div>
            </div>
            <div>
              <label className={`block text-sm font-medium ${balanceGap > 0 ? "text-orange-700" : "text-red-700"} mb-1`}>
                原因 / Raison *（客户上号？）
              </label>
              <select
                value={gapReason}
                onChange={(e) => setGapReason(e.target.value)}
                className={`w-full rounded-lg border px-3 py-2 text-sm bg-white ${balanceGap > 0 ? "border-orange-300" : "border-red-300"}`}
              >
                <option value="">请选择原因...</option>
                <option value="客户上号打了 / Client a joué">客户上号打了 / Client a joué</option>
                <option value="客户赢了 / Client a gagné">客户赢了 / Client a gagné</option>
                <option value="客户输了 / Client a perdu">客户输了 / Client a perdu</option>
                <option value="充值 / Rechargement">充值 / Rechargement</option>
                <option value="掉分 / Chute de solde">掉分 / Chute de solde</option>
                <option value="其他 / Autre">其他 / Autre</option>
              </select>
            </div>
            <p className={`text-xs ${balanceGap > 0 ? "text-orange-500" : "text-red-500"}`}>
              {balanceGap > 0
                ? "💡 余额增加，差额计入客户盈亏，抵扣剩余需打金额"
                : "💡 余额减少，差额计入客户盈亏，需要补打回来"}
            </p>
          </div>
        )}

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
          🟢 空闲 | 🔴 打单中 — 选空闲打手，不能用已在打单的
        </div>

        <Button type="submit" variant="primary" size="lg" block loading={loading}>
          <Play size={20} className="mr-2" />
          开始记录 / Démarrer
        </Button>
      </form>
    </div>
  );
}
