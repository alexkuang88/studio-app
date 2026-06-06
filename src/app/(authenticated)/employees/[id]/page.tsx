"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  EMPLOYEE_STATUS_LABELS,
  type Employee,
  type EmployeeStatus,
} from "@/lib/types/database";
import {
  formatDateTime,
  formatHours,
  formatAmount,
  getCurrentMonth,
  getRecentMonths,
  getMonthLabel,
} from "@/lib/utils/time-utils";
import { calcSalary } from "@/lib/utils/calculations";
import { ArrowLeft, Save } from "lucide-react";
import Link from "next/link";

export default function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { isAdmin } = useAuth();
  const router = useRouter();
  const isNew = id === "new";

  const [employee, setEmployee] = useState<Partial<Employee>>({
    employee_code: "",
    chinese_name: "",
    local_name: "",
    phone: "",
    facebook: "",
    status: "training",
    can_take_order: false,
    note: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [sessions, setSessions] = useState<Array<Record<string, unknown>>>([]);
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());
  const [salaryRate, setSalaryRate] = useState(700);
  const [monthStats, setMonthStats] = useState({
    totalResult: 0,
    totalHours: 0,
    avgEfficiency: 0,
    salary: 0,
  });

  const supabase = createClient();

  useEffect(() => {
    if (isNew) return;
    supabase
      .from("employees")
      .select("*")
      .eq("id", id)
      .single()
      .then(({ data }) => {
        if (data) setEmployee(data as Employee);
      });
    supabase
      .from("settings")
      .select("*")
      .eq("key", "salary_rate")
      .single()
      .then(({ data }) => {
        if (data) setSalaryRate(parseFloat(data.value));
      });
  }, [id, isNew]);

  useEffect(() => {
    if (isNew) return;
    const [year, monthNum] = selectedMonth.split("-");
    // 马达加斯加时区 (UTC+3)
    const monthStart = `${year}-${monthNum}-01T00:00:00+03:00`;
    const nextNum = monthNum === "12" ? 1 : Number(monthNum) + 1;
    const nextYear = monthNum === "12" ? String(parseInt(year) + 1) : year;
    const monthEnd = `${nextYear}-${String(nextNum).padStart(2, "0")}-01T00:00:00+03:00`;

    supabase
      .from("work_sessions")
      .select("*, orders(order_code, order_source), machines(machine_code, machine_name)")
      .eq("employee_id", id)
      .eq("status", "completed")
      .gte("end_time", monthStart)
      .lt("end_time", monthEnd)
      .order("start_time", { ascending: true })
      .then(({ data }) => {
        const s = (data as Record<string, unknown>[]) || [];
        setSessions(s);
        const totalResult = s.reduce(
          (sum, ws) => sum + ((ws.result_amount as number) || 0), 0
        );
        const totalHours = s.reduce(
          (sum, ws) => sum + ((ws.work_hours as number) || 0), 0
        );
        setMonthStats({
          totalResult,
          totalHours,
          avgEfficiency: totalHours > 0 ? Math.round((totalResult / totalHours) * 100) / 100 : 0,
          salary: calcSalary(totalResult, salaryRate),
        });
      });
  }, [id, selectedMonth, isNew, salaryRate]);

  const handleSave = async () => {
    setError("");
    setSaving(true);
    if (!employee.employee_code || !employee.chinese_name) {
      setError("员工编号和姓名不能为空");
      setSaving(false);
      return;
    }
    if (isNew) {
      const res = await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(employee),
      });
      const result = await res.json();
      if (!res.ok) { setError(result.error); setSaving(false); return; }
      router.push(`/employees/${result.id}`);
    } else {
      const res = await fetch(`/api/employees/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(employee),
      });
      if (!res.ok) { const result = await res.json(); setError(result.error); setSaving(false); return; }
    }
    setSaving(false);
    router.refresh();
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      <div className="flex items-center gap-4">
        <Link href="/employees"><Button variant="ghost" size="sm"><ArrowLeft size={18} /></Button></Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isNew ? "新增员工 / Nouvel employé" : employee.chinese_name || "员工详情"}
          </h1>
        </div>
      </div>

      {/* Employee Form */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="员工编号 / Code employé *" value={employee.employee_code}
            onChange={(e) => setEmployee({ ...employee, employee_code: e.target.value })}
            placeholder="N001" disabled={!isNew} />
          <Input label="中文姓名 / Nom chinois *" value={employee.chinese_name}
            onChange={(e) => setEmployee({ ...employee, chinese_name: e.target.value })}
            placeholder="姓名" />
          <Input label="法语/马语名 / Nom local" value={employee.local_name || ""}
            onChange={(e) => setEmployee({ ...employee, local_name: e.target.value })}
            placeholder="Local name" />
          <Input label="电话 / Téléphone" value={employee.phone || ""}
            onChange={(e) => setEmployee({ ...employee, phone: e.target.value })}
            placeholder="Phone" />
          <Input label="Facebook" value={employee.facebook || ""}
            onChange={(e) => setEmployee({ ...employee, facebook: e.target.value })}
            placeholder="Facebook profile" />
          <Select label="状态 / Statut" value={employee.status}
            onChange={(e) => setEmployee({ ...employee, status: e.target.value as EmployeeStatus })}
            options={Object.entries(EMPLOYEE_STATUS_LABELS).map(([v, l]) => ({ value: v, label: l }))} />
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={employee.can_take_order}
              onChange={(e) => setEmployee({ ...employee, can_take_order: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            <span className="text-sm text-gray-700">可接单 / Peut prendre des commandes</span>
          </label>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">备注 / Note</label>
          <textarea value={employee.note || ""}
            onChange={(e) => setEmployee({ ...employee, note: e.target.value })}
            rows={2}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        <Button variant="primary" onClick={handleSave} loading={saving}>
          <Save size={18} className="mr-1" />
          {isNew ? "创建 / Créer" : "保存 / Enregistrer"}
        </Button>
      </div>

      {/* Monthly statistics (only for existing employees) */}
      {!isNew && (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">月成绩 / Résultat mensuel</h2>
            <Select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}
              options={getRecentMonths(12).map((m) => ({ value: m, label: getMonthLabel(m) }))}
              className="w-48" />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <StatBox label="总成绩 / Total" value={formatAmount(monthStats.totalResult)} />
            <StatBox label="总工时 / Heures" value={formatHours(monthStats.totalHours)} />
            <StatBox label="平均效率 / Efficacité" value={`${monthStats.avgEfficiency.toLocaleString("zh-CN")} 万/h`} />
            <StatBox label="工资单价 / Taux" value={`${salaryRate} Ar/100万`} />
            <StatBox label="应发工资 / Salaire" value={`${monthStats.salary.toLocaleString("zh-CN")} Ar`} highlight />
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-3 py-2 text-left">日期 / Date</th>
                    <th className="px-3 py-2 text-left">订单号 / N°</th>
                    <th className="px-3 py-2 text-left hidden sm:table-cell">来源</th>
                    <th className="px-3 py-2 text-left hidden md:table-cell">设备 / Machine</th>
                    <th className="px-3 py-2 text-left">开始时间 / Début</th>
                    <th className="px-3 py-2 text-left">结束时间 / Fin</th>
                    <th className="px-3 py-2 text-right">成绩(万) / Résultat</th>
                    <th className="px-3 py-2 text-right hidden sm:table-cell">工时 / Heures</th>
                    <th className="px-3 py-2 text-right hidden sm:table-cell">游戏币/每小时 / Pièces/h</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {sessions.length === 0 ? (
                    <tr><td colSpan={9} className="px-4 py-6 text-center text-gray-500">该月份暂无记录 / Aucune session ce mois</td></tr>
                  ) : (
                    sessions.map((ws) => {
                      const orders = ws.orders as Record<string, unknown> | undefined;
                      const machines = ws.machines as Record<string, unknown> | undefined;
                      return (
                        <tr key={ws.id as string} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-xs">{formatDateTime(ws.end_time as string).split(" ")[0]}</td>
                          <td className="px-3 py-2 font-mono text-xs">{orders?.order_code as string || "—"}</td>
                          <td className="px-3 py-2 text-xs text-gray-500 hidden sm:table-cell">{orders?.order_source as string || "—"}</td>
                          <td className="px-3 py-2 text-xs hidden md:table-cell">{machines?.machine_code as string || "—"}</td>
                          <td className="px-3 py-2 text-xs">{formatDateTime(ws.start_time as string).split(" ")[1] || formatDateTime(ws.start_time as string)}</td>
                          <td className="px-3 py-2 text-xs">{formatDateTime(ws.end_time as string).split(" ")[1] || formatDateTime(ws.end_time as string)}</td>
                          <td className="px-3 py-2 text-right font-mono font-medium">{(ws.result_amount as number)?.toLocaleString("zh-CN") || "—"}</td>
                          <td className="px-3 py-2 text-right text-xs text-gray-500 hidden sm:table-cell">{ws.work_hours != null ? `${ws.work_hours as number}h` : "—"}</td>
                          <td className="px-3 py-2 text-right text-xs text-gray-500 hidden sm:table-cell">{ws.efficiency != null ? `${ws.efficiency as number}` : "—"}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatBox({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${highlight ? "bg-green-50 border-green-200" : "bg-white border-gray-200"}`}>
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-lg font-bold ${highlight ? "text-green-700" : "text-gray-900"}`}>{value}</div>
    </div>
  );
}
