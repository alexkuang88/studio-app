"use client";

import { useLocale } from "@/lib/i18n/LocaleContext";
import { useEffect, useState, useCallback } from "react";
import { Badge } from "@/components/ui/Badge";
import { formatHours } from "@/lib/utils/time-utils";
import { ChevronLeft, ChevronRight, Users, UserX, TrendingUp, Clock } from "lucide-react";

interface EmpRow {
  employee: { id: string; employee_code: string; chinese_name: string };
  total_result: number;
  total_hours: number;
  avg_efficiency: number;
  is_running: boolean;
  running_order: string | null;
  running_start_time: string | null;
}

export default function AttendancePage() {
  const { t } = useLocale();
  const [date, setDate] = useState("");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Initialize date to MG today
  useEffect(() => {
    if (!date) {
      const now = new Date();
      const mg = new Date(now.getTime() + 3 * 3600000);
      setDate(mg.toISOString().slice(0, 10));
    }
  }, []);

  const fetchData = useCallback(async () => {
    if (!date) return;
    setLoading(true);
    const res = await fetch(`/api/attendance?date=${date}`);
    const result = await res.json();
    setData(result);
    setLoading(false);
  }, [date]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const prevDay = () => {
    const d = new Date(date + "T00:00:00+03:00");
    d.setDate(d.getDate() - 1);
    setDate(d.toISOString().slice(0, 10));
  };

  const nextDay = () => {
    const d = new Date(date + "T00:00:00+03:00");
    d.setDate(d.getDate() + 1);
    setDate(d.toISOString().slice(0, 10));
  };

  const present: EmpRow[] = data?.present || [];
  const absent: EmpRow[] = data?.absent || [];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">每日考勤 / Présence</h1>
          <p className="text-sm text-gray-500 mt-1">
            {date} · {data?.present_count || 0} 人到岗 / {data?.absent_count || 0} 人缺勤
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={prevDay} className="p-2 rounded-lg border hover:bg-gray-100">
            <ChevronLeft size={18} />
          </button>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white w-[150px]"
          />
          <button onClick={nextDay} className="p-2 rounded-lg border hover:bg-gray-100">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-green-50 rounded-xl border border-green-200 p-4">
          <div className="flex items-center gap-2 mb-2"><Users size={18} className="text-green-500" /><span className="text-xs text-green-700 font-medium">到岗 / Présents</span></div>
          <div className="text-2xl font-bold text-green-700">{loading ? "—" : data?.present_count || 0}</div>
          <div className="text-xs text-green-500 mt-1">人 / personnes</div>
        </div>
        <div className="bg-red-50 rounded-xl border border-red-200 p-4">
          <div className="flex items-center gap-2 mb-2"><UserX size={18} className="text-red-500" /><span className="text-xs text-red-700 font-medium">缺勤 / Absents</span></div>
          <div className="text-2xl font-bold text-red-700">{loading ? "—" : data?.absent_count || 0}</div>
          <div className="text-xs text-red-500 mt-1">人 / personnes</div>
        </div>
        <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
          <div className="flex items-center gap-2 mb-2"><TrendingUp size={18} className="text-blue-500" /><span className="text-xs text-blue-700 font-medium">总产量 / Total</span></div>
          <div className="text-2xl font-bold text-blue-700">{loading ? "—" : `${(data?.total_result || 0).toLocaleString("zh-CN")} 万`}</div>
          <div className="text-xs text-blue-500 mt-1">tokens</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2"><Clock size={18} className="text-gray-500" /><span className="text-xs text-gray-500">总工时 / Heures</span></div>
          <div className="text-2xl font-bold text-gray-800">{loading ? "—" : `${(data?.total_hours || 0).toFixed(1)}h`}</div>
          <div className="text-xs text-gray-400 mt-1">heures</div>
        </div>
      </div>

      {/* Present table */}
      <div className="bg-white rounded-xl border border-green-200 overflow-hidden">
        <div className="px-6 py-4 border-b bg-green-50">
          <h3 className="font-semibold text-green-800">
            到岗员工 / Employés présents ({present.length})
          </h3>
        </div>
        <div className="overflow-x-auto max-h-[50vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b sticky top-0">
              <tr>
                <th className="px-3 py-3 text-left w-10">#</th>
                <th className="px-3 py-3 text-left">员工 / Employé</th>
                <th className="px-3 py-3 text-right">产量(万) / Résultat</th>
                <th className="px-3 py-3 text-right hidden sm:table-cell">工时 / Heures</th>
                <th className="px-3 py-3 text-right hidden md:table-cell">效率 / Efficacité</th>
                <th className="px-3 py-3 text-center">状态 / Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">加载中...</td></tr>
              ) : present.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">今日暂无出勤 / Aucune présence</td></tr>
              ) : (
                present.map((row, i) => (
                  <tr key={row.employee.id} className={`hover:bg-gray-50 ${row.is_running ? "bg-blue-50/50" : ""}`}>
                    <td className="px-3 py-2 text-gray-400 text-xs">{i + 1}</td>
                    <td className="px-3 py-2">
                      <span className="font-medium text-gray-900">
                        {row.employee.employee_code} {row.employee.chinese_name}
                      </span>
                      {row.is_running && row.running_order && (
                        <span className="ml-2 text-xs text-blue-600">{row.running_order}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-medium">
                      {row.total_result > 0 ? row.total_result.toLocaleString("zh-CN") : "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-500 hidden sm:table-cell">
                      {row.total_hours > 0 ? `${row.total_hours.toFixed(1)}h` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-500 hidden md:table-cell">
                      {row.avg_efficiency > 0 ? `${row.avg_efficiency.toFixed(1)} 万/h` : "—"}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {row.is_running ? (
                        <Badge variant="blue">正在打 / En cours</Badge>
                      ) : (
                        <Badge variant="green">已完成 / Terminé</Badge>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Absent table */}
      <div className="bg-white rounded-xl border border-red-200 overflow-hidden">
        <div className="px-6 py-4 border-b bg-red-50">
          <h3 className="font-semibold text-red-800">
            缺勤员工 / Employés absents ({absent.length})
          </h3>
        </div>
        <div className="overflow-x-auto max-h-[30vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b sticky top-0">
              <tr>
                <th className="px-3 py-3 text-left w-10">#</th>
                <th className="px-3 py-3 text-left">员工 / Employé</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr><td colSpan={2} className="px-4 py-8 text-center text-gray-500">加载中...</td></tr>
              ) : absent.length === 0 ? (
                <tr><td colSpan={2} className="px-4 py-8 text-center text-green-600 font-medium">全员到岗！/ Tout le monde est présent !</td></tr>
              ) : (
                absent.map((row, i) => (
                  <tr key={row.employee.id} className="hover:bg-gray-50 opacity-50">
                    <td className="px-3 py-2 text-gray-400 text-xs">{i + 1}</td>
                    <td className="px-3 py-2">
                      <span className="text-gray-500">
                        {row.employee.employee_code} {row.employee.chinese_name}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
