"use client";

import { useLocale } from "@/lib/i18n/LocaleContext";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { createClient } from "@/lib/supabase/client";
import { Clock, CheckCircle, RefreshCw } from "lucide-react";
import Link from "next/link";

export default function CheckpointPage() {
  const { t } = useLocale();
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [msgMap, setMsgMap] = useState<Record<string, string>>({});

  const supabase = createClient();

  const fetchSessions = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("work_sessions")
      .select("*, employees(employee_code, chinese_name), machines(machine_code, machine_name), orders(order_code, target_amount, expected_completion_at)")
      .eq("status", "running")
      .order("start_time", { ascending: true });

    setSessions(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchSessions(); }, []);

  const doCheckpoint = async (sessionId: string) => {
    const amt = amounts[sessionId];
    if (!amt) return;
    setMsgMap(m => ({ ...m, [sessionId]: "..." }));

    const res = await fetch("/api/work-sessions/checkpoint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ running_session_id: sessionId, end_amount: parseFloat(amt) }),
    });

    if (res.ok) {
      setMsgMap(m => ({ ...m, [sessionId]: "✅ " + t("cp.done") }));
      setAmounts(a => { const n = { ...a }; delete n[sessionId]; return n; });
      fetchSessions();
    } else {
      const r = await res.json();
      setMsgMap(m => ({ ...m, [sessionId]: "❌ " + (r.error || "失败") }));
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("cp.title")}</h1>
          <p className="text-sm text-gray-500 mt-1">{t("cp.desc")}</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchSessions}><RefreshCw size={16} className="mr-1" />{t("refresh")}</Button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">{t("loading")}</div>
      ) : sessions.length === 0 ? (
        <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center text-green-700 text-lg font-medium">
          ✅ {t("cp.all_done")}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-3 py-3 text-left">{t("cp.col_operator")}</th>
                  <th className="px-3 py-3 text-left">{t("cp.col_device")}</th>
                  <th className="px-3 py-3 text-left">{t("cp.col_order")}</th>
                  <th className="px-3 py-3 text-right">{t("cp.col_start_amt")}</th>
                  <th className="px-3 py-3 text-right">{t("cp.col_current_amt")}</th>
                  <th className="px-3 py-3 text-center">{t("cp.col_elapsed")}</th>
                  <th className="px-3 py-3 text-center">{t("cp.col_action")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sessions.map((s) => {
                  const emp = s.employees;
                  const mac = s.machines;
                  const ord = s.orders;
                  const elapsed = Math.floor((Date.now() - new Date(s.start_time).getTime()) / 3600000);
                  const msg = msgMap[s.id];

                  return (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium">
                        {emp?.employee_code} {emp?.chinese_name}
                      </td>
                      <td className="px-3 py-2 text-gray-500">{mac?.machine_code} {mac?.machine_name}</td>
                      <td className="px-3 py-2 font-mono text-xs">
                        <Link href={`/orders/${s.order_id}`} className="text-blue-600 hover:underline">
                          {ord?.order_code}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{(s.start_amount ?? 0).toLocaleString("zh-CN")}</td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          value={amounts[s.id] || ""}
                          onChange={e => setAmounts(a => ({ ...a, [s.id]: e.target.value }))}
                          placeholder={String(s.start_amount ?? "")}
                          className="w-[100px] rounded border border-blue-300 px-2 py-1 text-xs text-right font-mono bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Badge variant={elapsed >= 12 ? "red" : elapsed >= 6 ? "orange" : "blue"}>
                          {elapsed}h
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-center">
                        {msg?.startsWith("✅") ? (
                          <span className="text-green-600 text-xs font-medium"><CheckCircle size={14} className="inline mr-1" />{t("cp.done")}</span>
                        ) : (
                          <Button size="sm" variant="primary"
                            onClick={() => doCheckpoint(s.id)}
                            disabled={!amounts[s.id]}>
                            <Clock size={14} className="mr-1" />打卡
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
