"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Select";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/utils/time-utils";
import { FileText, RefreshCw } from "lucide-react";

const ACTION_LABELS: Record<string, string> = {
  create: "创建 / Créer",
  update: "修改 / Modifier",
  void: "作废 / Annuler",
  lock_salary: "锁定工资 / Verrouiller salaire",
  unlock_salary: "解锁工资 / Déverrouiller salaire",
  complete_order: "完成订单 / Terminer commande",
  force_complete: "强制完成 / Forcer complétion",
  handover: "交接 / Relève",
};

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState("");

  const supabase = createClient();

  const fetchLogs = async () => {
    setLoading(true);
    let query = supabase
      .from("audit_logs")
      .select("*, profiles(name, email)")
      .order("created_at", { ascending: false })
      .limit(100);

    if (actionFilter) query = query.eq("action", actionFilter);

    const { data } = await query;
    setLogs((data as Record<string, unknown>[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchLogs(); }, [actionFilter]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            操作日志 / Journal d'audit
          </h1>
          <p className="text-sm text-gray-500 mt-1">所有操作记录，仅 Admin 可查看</p>
        </div>
        <button onClick={fetchLogs} className="p-2 hover:bg-gray-100 rounded-lg">
          <RefreshCw size={18} />
        </button>
      </div>

      <div className="flex gap-3">
        <Select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          options={[
            { value: "", label: "全部操作 / Tous" },
            ...Object.entries(ACTION_LABELS).map(([v, l]) => ({ value: v, label: l })),
          ]}
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-3 py-3 text-left">时间</th>
                <th className="px-3 py-3 text-left">用户</th>
                <th className="px-3 py-3 text-left">操作</th>
                <th className="px-3 py-3 text-left">表名</th>
                <th className="px-3 py-3 text-left hidden lg:table-cell">详情</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-500">加载中...</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-500">暂无日志</td></tr>
              ) : (
                logs.map((log) => {
                  const profile = log.profiles as Record<string, unknown> | null;
                  const action = log.action as string;
                  return (
                    <tr key={log.id as string} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-xs whitespace-nowrap">
                        {formatDateTime(log.created_at as string)}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {profile ? `${profile.name}` : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <Badge
                          variant={
                            action === "void" ? "red" :
                            action === "unlock_salary" ? "orange" :
                            action === "lock_salary" ? "purple" :
                            "blue"
                          }
                        >
                          {ACTION_LABELS[action] || action}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-500">
                        {log.table_name as string}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-500 hidden lg:table-cell max-w-xs truncate">
                        {log.after_data
                          ? JSON.stringify(log.after_data).slice(0, 100)
                          : "—"}
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
