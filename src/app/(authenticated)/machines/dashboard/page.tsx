"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { createClient } from "@/lib/supabase/client";
import { MACHINE_STATUS_LABELS, type Machine } from "@/lib/types/database";
import { formatDateTime, calcRemainingHours, formatHours as formatHoursText } from "@/lib/utils/time-utils";
import { calcRemainingAmount, calcElapsedHours, formatAmount, isOrderOverdue } from "@/lib/utils/calculations";
import { RefreshCw, TrendingUp, Pause } from "lucide-react";

export default function MachineDashboardPage() {
  const { t } = useLocale();
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [updateId, setUpdateId] = useState<string | null>(null);
  const [updateAmt, setUpdateAmt] = useState("");
  const [updating, setUpdating] = useState(false);
  const [updateMsg, setUpdateMsg] = useState("");
  const [pauseId, setPauseId] = useState<string | null>(null);
  const [pauseAmt, setPauseAmt] = useState("");
  const [pausing, setPausing] = useState(false);
  const [pauseMsg, setPauseMsg] = useState("");

  const supabase = createClient();

  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  // Read URL param on client-side mount
  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("status");
    setStatusFilter(s);
  }, []);

  const fetchData = useCallback(async () => {
    const [mcRes, wsRes] = await Promise.all([
      supabase.from("machines").select("*").eq("is_active", true).order("machine_code"),
      supabase.from("work_sessions").select("*, employees(*), orders(*)").eq("status", "running"),
    ]);
    const runningMap: any = {};
    (wsRes.data || []).forEach((s: any) => { runningMap[s.machine_id] = s; });
    const list = ((mcRes.data || []) as Machine[]).map((m) => {
      const r = runningMap[m.id];
      return {
        machine: m,
        isRunning: m.status === "in_use" || !!r,
        empName: r?.employees?.chinese_name || null,
        empCode: r?.employees?.employee_code || null,
        orderCode: r?.orders?.order_code || null,
        orderSource: r?.orders?.order_source || null,
        targetAmt: r?.orders?.target_amount || null,
        completedAmt: r?.orders?.completed_amount || null,
        initialBal: r?.orders?.initial_balance || null,
        orderAmt: (r?.orders?.order_amount as number) || ((r?.orders?.target_amount as number) || 0) - ((r?.orders?.initial_balance as number) || 0),
        clientAmt: r?.orders?.total_client_amount || null,
        startTime: r?.start_time || null,
        expectedAt: r?.orders?.expected_completion_at || null,
        sessionId: r?.id || null,
        startAmt: r?.start_amount || null,
        curBalance: r?.current_balance || null,
        checkpointAt: r?.last_checkpoint_at || null,
      };
    });
    setEntries(list);
    setLoading(false);
    setLastRefresh(new Date());
  }, []);

  useEffect(() => { fetchData(); const t = setInterval(fetchData, 30000); return () => clearInterval(t); }, [fetchData]);

  const handleUpdate = async (e: any) => {
    if (!updateAmt) return;
    setUpdating(true);
    const res = await fetch("/api/work-sessions/checkpoint", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: e.sessionId, current_balance: parseFloat(updateAmt) }),
    });
    const r = await res.json();
    setUpdateMsg(res.ok ? `✅ 已打 ${r.earned_so_far?.toLocaleString() || "?"} 万，效率 ${r.current_efficiency || "?"} 万/h` : "❌ " + (r.error || "失败"));
    if (res.ok) fetchData();
    setUpdating(false);
  };

  const handlePauseAction = async (e: any) => {
    if (!pauseAmt) return;
    setPausing(true);
    const res = await fetch("/api/work-sessions/pause", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: e.sessionId, end_amount: parseFloat(pauseAmt), reason: "客户上号" }),
    });
    const r = await res.json();
    setPauseMsg(res.ok ? `✅ 已暂停！成绩 ${r.result_amount?.toLocaleString() || "?"} 万` : "❌ " + (r.error || "失败"));
    if (res.ok) fetchData();
    setPausing(false);
  };

  if (loading) return <div className="text-center py-12 text-gray-500">加载中...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">设备现场看板 / Tableau de bord machines</h1>
          <p className="text-sm text-gray-500 mt-1">最后刷新: {lastRefresh.toLocaleTimeString("zh-CN")} | 每30秒自动刷新 | 点「更新进度」录入最新余额 | 点「暂停」释放打手</p>
        </div>
        <Button variant="outline" onClick={fetchData}><RefreshCw size={18} className="mr-1" />刷新</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {entries
          .filter((e: any) => {
            if (!statusFilter) return true;
            if (statusFilter === "in_use") return e.machine?.status === "in_use";
            if (statusFilter === "available") return e.machine?.status === "available";
            return true;
          })
          .map((e) => {
          const m = e.machine as Machine;
          const overdue = e.expectedAt ? isOrderOverdue(e.expectedAt) : false;
          const remainHrs = e.expectedAt ? calcRemainingHours(e.expectedAt) : 0;
          const orderAmt = e.orderAmt || ((e.targetAmt || 0) - (e.initialBal || 0));
          const remainAmt = Math.max(0, orderAmt - (e.completedAmt || 0));
          const elapsed = e.startTime ? calcElapsedHours(e.startTime) : 0;
          const earned = e.curBalance != null && e.startAmt != null ? e.curBalance - e.startAmt : null;
          const eff = earned != null && elapsed > 0 ? Math.round((earned / elapsed) * 100) / 100 : null;

          let bc = "border-gray-200";
          if (m.status === "in_use" && overdue) bc = "border-red-400 bg-red-50/50";
          else if (m.status === "in_use" && remainHrs > 0 && remainHrs <= 2) bc = "border-orange-400 bg-orange-50/50";
          else if (m.status === "in_use") bc = "border-blue-300 bg-blue-50/30";
          else if (m.status === "available") bc = "border-green-300 bg-green-50/30";

          return (
            <div key={m.id} className={`rounded-xl border-2 ${bc} p-4`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xl font-bold">{m.machine_code}</span>
                  <span className="text-gray-500">/</span>
                  <span className="text-gray-700">{m.machine_name}</span>
                </div>
                <Badge variant={m.status === "in_use" ? "blue" : m.status === "available" ? "green" : m.status === "repair" ? "orange" : "red"}>
                  {MACHINE_STATUS_LABELS[m.status]}
                </Badge>
              </div>

              {e.isRunning ? (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500 text-xs">打手:</span><span className="text-xs font-medium">{e.empName ? `${e.empCode} ${e.empName}` : "—"}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500 text-xs">订单:</span><span className="text-xs">{e.orderCode} | {e.orderSource}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500 text-xs">订单金额:</span><span className="text-xs">{orderAmt.toLocaleString()} 万</span></div>
                  <div className="flex justify-between"><span className="text-gray-500 text-xs">目标余额:</span><span className="text-xs font-mono font-bold">{((e.targetAmt || 0)).toLocaleString()} 万</span></div>
                  {(e.clientAmt || 0) !== 0 && (
                    <div className="flex justify-between"><span className="text-gray-500 text-xs">客户盈亏:</span><span className="text-xs">{(e.clientAmt || 0) > 0 ? `+${e.clientAmt}` : e.clientAmt} 万</span></div>
                  )}
                  <div className="flex justify-between"><span className="text-gray-500 text-xs">已完成:</span><span className="text-xs">{formatAmount(e.completedAmt || 0)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500 text-xs">仍需打:</span><span className={`text-xs font-bold ${remainAmt <= 0 ? "text-green-600" : "text-red-600"}`}>{formatAmount(remainAmt)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500 text-xs">开始余额:</span><span className="text-xs">{(e.startAmt || 0).toLocaleString()} 万</span></div>

                  {earned != null ? (
                    <div className="bg-white rounded-lg p-3 border-2 border-blue-300 mt-2">
                      <div className="flex justify-between"><span className="text-xs text-gray-500">当前余额</span><span className="text-xs text-gray-400">{e.checkpointAt ? formatDateTime(e.checkpointAt) : "—"}</span></div>
                      <div className="text-2xl font-mono font-bold text-blue-700 mt-1">{(e.curBalance || 0).toLocaleString()} 万</div>
                      <div className="flex justify-between mt-2 text-xs">
                        <span className="text-green-600 font-semibold">📈 已打 {earned.toLocaleString()} 万</span>
                        {eff != null && <span className="text-gray-500">⚡ {eff.toLocaleString()} 万/h</span>}
                      </div>
                    </div>
                  ) : (
                    <div className="bg-gray-100 rounded-lg p-3 text-xs text-gray-400 text-center">尚未更新进度</div>
                  )}

                  <div className="flex justify-between"><span className="text-gray-500 text-xs">开始时间:</span><span className="text-xs">{e.startTime ? formatDateTime(e.startTime) : "—"}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500 text-xs">已工作:</span><span className="text-xs">{formatHoursText(elapsed)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500 text-xs">要求完成:</span><span className="text-xs">{e.expectedAt ? formatDateTime(e.expectedAt) : "—"}</span></div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 text-xs">剩余时间:</span>
                    <span className={`text-xs ${overdue ? "text-red-600 font-bold" : remainHrs <= 2 && remainHrs > 0 ? "text-orange-600 font-bold" : ""}`}>
                      {remainHrs > 0 ? formatHoursText(remainHrs) : overdue ? "已超时" : "—"}
                    </span>
                  </div>

                  {/* Action buttons */}
                  {updateId === e.sessionId ? (
                    <div className="bg-white rounded-lg border border-blue-300 p-3 space-y-2">
                      <p className="text-xs font-medium">输入当前手机余额</p>
                      <div className="flex gap-2">
                        <input type="number" value={updateAmt} onChange={(ev) => setUpdateAmt(ev.target.value)} placeholder={`≥ ${e.startAmt || 0}`} className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm" autoFocus />
                        <Button size="sm" onClick={() => handleUpdate(e)} loading={updating}>确认</Button>
                        <Button size="sm" variant="ghost" onClick={() => { setUpdateId(null); setUpdateMsg(""); }}>取消</Button>
                      </div>
                      {updateMsg && <p className={`text-xs ${updateMsg.startsWith("✅") ? "text-green-600" : "text-red-600"}`}>{updateMsg}</p>}
                    </div>
                  ) : pauseId === e.sessionId ? (
                    <div className="bg-white rounded-lg border-2 border-orange-400 p-3 space-y-2">
                      <p className="text-sm font-semibold text-orange-800">⏸️ 暂停订单</p>
                      <p className="text-xs text-gray-600">输入当前余额，暂停后释放打手和设备</p>
                      <div className="flex gap-2">
                        <input type="number" value={pauseAmt} onChange={(ev) => setPauseAmt(ev.target.value)} placeholder={`≥ ${e.startAmt || 0}`} className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm" autoFocus />
                        <Button size="sm" onClick={() => handlePauseAction(e)} loading={pausing}>确认</Button>
                        <Button size="sm" variant="ghost" onClick={() => { setPauseId(null); setPauseMsg(""); }}>取消</Button>
                      </div>
                      {pauseMsg && <p className={`text-xs ${pauseMsg.startsWith("✅") ? "text-green-600" : "text-red-600"}`}>{pauseMsg}</p>}
                      <p className="text-xs text-orange-600">⚠️ 恢复时去「添加打手」</p>
                    </div>
                  ) : (
                    <div className="flex gap-2 mt-1">
                      <button onClick={() => { setUpdateId(e.sessionId); setPauseId(null); setUpdateAmt(e.curBalance != null ? String(e.curBalance) : ""); setUpdateMsg(""); }}
                        className="flex-1 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium flex items-center justify-center gap-1">
                        <TrendingUp size={16} />更新进度
                      </button>
                      <button onClick={() => { setPauseId(e.sessionId); setUpdateId(null); setPauseAmt(e.curBalance != null ? String(e.curBalance) : ""); setPauseMsg(""); }}
                        className="flex-1 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium flex items-center justify-center gap-1">
                        <Pause size={16} />暂停
                      </button>
                    </div>
                  )}

                  {overdue && <div className="mt-2 bg-red-100 text-red-700 rounded-lg px-3 py-1.5 text-xs font-bold text-center">⚠️ 已超时 / En retard</div>}
                  {!overdue && remainHrs > 0 && remainHrs <= 2 && <div className="mt-2 bg-orange-100 text-orange-700 rounded-lg px-3 py-1.5 text-xs font-bold text-center">⚡ 即将超时</div>}
                </div>
              ) : (
                <div className="text-center py-4 font-medium">
                  {m.status === "available" && "✅ 空闲 / Disponible"}
                  {m.status === "repair" && "🔧 维修中 / En réparation"}
                  {m.status === "disabled" && "🚫 已停用 / Désactivé"}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
