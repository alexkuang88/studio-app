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
  ORDER_SOURCE_LABELS,
  type Employee,
  type EmployeeStatus,
  type OrderSource,
} from "@/lib/types/database";
import {
  formatDateTime,
  formatHours,
  formatAmount,
  getCurrentMonth,
  getRecentMonths,
  getMonthLabel,
} from "@/lib/utils/time-utils";
import { calcSalary, calcDailyTieredSalary, getMGDay } from "@/lib/utils/calculations";
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
  const [salaryRateBase, setSalaryRateBase] = useState(700);
  const [salaryRatePremium, setSalaryRatePremium] = useState(800);
  const [dailyThreshold, setDailyThreshold] = useState(2200);
  const [tieredStartDate, setTieredStartDate] = useState("2026-07-06");
  const [isTiered, setIsTiered] = useState(false);
  const [dailyBreakdown, setDailyBreakdown] = useState<Array<{day: string; total: number; rate: number; salary: number}>>([]);
  const [monthStats, setMonthStats] = useState({
    totalResult: 0,
    totalHours: 0,
    avgEfficiency: 0,
    salary: 0,
  });
  const [advances, setAdvances] = useState<Array<Record<string, any>>>([]);
  const [advTotal, setAdvTotal] = useState(0);
  const [advAmount, setAdvAmount] = useState("");
  const [advNote, setAdvNote] = useState("");
  const [advSaving, setAdvSaving] = useState(false);
  const [advMsg, setAdvMsg] = useState("");

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
      .select("key, value")
      .in("key", ["salary_rate", "salary_rate_base", "salary_rate_premium", "daily_threshold", "tiered_salary_start_date"])
      .then(({ data }) => {
        const map: Record<string, string> = {};
        for (const row of (data as Array<{ key: string; value: string }>) || []) {
          map[row.key] = row.value;
        }
        setSalaryRate(parseFloat(map["salary_rate"] || "700"));
        setSalaryRateBase(parseFloat(map["salary_rate_base"] || "700"));
        setSalaryRatePremium(parseFloat(map["salary_rate_premium"] || "800"));
        setDailyThreshold(parseFloat(map["daily_threshold"] || "2200"));
        setTieredStartDate(map["tiered_salary_start_date"] || "2026-07-06");
        const hasTiered = map["salary_rate_base"] !== undefined
          && map["salary_rate_premium"] !== undefined
          && map["daily_threshold"] !== undefined;
        setIsTiered(hasTiered);
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

        // Daily breakdown for tiered salary
        const dailyTotals: Record<string, number> = {};
        for (const ws of s) {
          const day = getMGDay(ws.end_time as string);
          dailyTotals[day] = (dailyTotals[day] || 0) + ((ws.result_amount as number) || 0);
        }
        const breakdown: Array<{day: string; total: number; rate: number; salary: number}> = [];
        for (const [day, dt] of Object.entries(dailyTotals).sort()) {
          const rate = day >= tieredStartDate
            ? (dt >= dailyThreshold ? salaryRatePremium : salaryRateBase)
            : salaryRate;
          breakdown.push({ day, total: dt, rate, salary: Math.round((dt / 100) * rate) });
        }
        setDailyBreakdown(breakdown);

        // Calculate salary
        let salary: number;
        if (isTiered) {
          const salaryMap = calcDailyTieredSalary(
            s.map(ws => ({
              employee_id: id,
              result_amount: ws.result_amount as number | null,
              end_time: ws.end_time as string | null,
            })),
            salaryRateBase, salaryRatePremium, dailyThreshold, tieredStartDate, salaryRate
          );
          salary = salaryMap.get(id) || 0;
        } else {
          salary = calcSalary(totalResult, salaryRate);
        }

        setMonthStats({
          totalResult,
          totalHours,
          avgEfficiency: totalHours > 0 ? Math.round((totalResult / totalHours) * 100) / 100 : 0,
          salary,
        });
      });

      fetch(`/api/employees/${id}/advances?month=${selectedMonth}`)
        .then(r => r.json())
        .then(d => {
          setAdvances(d.advances || []);
          setAdvTotal(d.total || 0);
        });
  }, [id, selectedMonth, isNew, salaryRate, salaryRateBase, salaryRatePremium, dailyThreshold, tieredStartDate, isTiered]);

  const handleSaveAdvance = async () => {
    if (!advAmount || parseFloat(advAmount) <= 0) return;
    setAdvSaving(true);
    setAdvMsg("");
    const res = await fetch(`/api/employees/${id}/advances`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: parseInt(advAmount), month: selectedMonth, note: advNote || null }),
    });
    if (res.ok) {
      setAdvAmount("");
      setAdvNote("");
      setAdvMsg(`✅ 已记录`);
      const advRes = await fetch(`/api/employees/${id}/advances?month=${selectedMonth}`);
      const d = await advRes.json();
      setAdvances(d.advances || []);
      setAdvTotal(d.total || 0);
    } else {
      const d = await res.json().catch(() => ({ error: "请求失败" }));
      setAdvMsg("❌ " + (d.error || "失败"));
    }
    setAdvSaving(false);
    setTimeout(() => setAdvMsg(""), 3000);
  };

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
            <StatBox label="工资单价 / Taux" value={isTiered ? `基础 ${salaryRateBase} / 高级 ${salaryRatePremium}` : `${salaryRate} Ar/100万`} />
            <StatBox label="应发工资 / Salaire" value={`${monthStats.salary.toLocaleString("zh-CN")} Ar`} highlight />
          </div>

          {/* 每日明细 / Détail quotidien */}
          {isTiered && dailyBreakdown.length > 0 && (
            <div className="bg-white rounded-xl border border-blue-200 overflow-hidden">
              <div className="px-6 py-4 border-b bg-blue-50">
                <h3 className="font-semibold text-blue-800">每日薪资明细 / Détail quotidien</h3>
                <p className="text-xs text-blue-600 mt-0.5">
                  阈值 {dailyThreshold}万 · 基础 {salaryRateBase} Ar · 高级 {salaryRatePremium} Ar · {tieredStartDate} 起
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-blue-50/50 border-b">
                    <tr>
                      <th className="px-4 py-2 text-left">日期</th>
                      <th className="px-4 py-2 text-right">日产量(万)</th>
                      <th className="px-4 py-2 text-center">单价(Ar/100万)</th>
                      <th className="px-4 py-2 text-right">当日工资(Ar)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {dailyBreakdown.map((d) => (
                      <tr key={d.day} className={d.rate > salaryRateBase ? "bg-green-50/50" : ""}>
                        <td className="px-4 py-2 font-mono text-xs">{d.day}</td>
                        <td className="px-4 py-2 text-right font-mono font-medium">
                          {d.day >= tieredStartDate && (
                            <span className={d.total >= dailyThreshold ? "text-green-600" : "text-gray-400"}>
                              {d.total >= dailyThreshold ? "✓ " : ""}
                            </span>
                          )}
                          {d.total.toLocaleString("zh-CN")}
                        </td>
                        <td className={`px-4 py-2 text-center font-bold ${d.rate > salaryRateBase ? "text-green-600" : "text-gray-500"}`}>
                          {d.rate}
                        </td>
                        <td className="px-4 py-2 text-right font-mono font-medium">
                          {d.salary.toLocaleString("zh-CN")}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-blue-50 font-bold">
                      <td className="px-4 py-2 text-xs">合计</td>
                      <td className="px-4 py-2 text-right font-mono">{dailyBreakdown.reduce((s,d) => s+d.total, 0).toLocaleString("zh-CN")}</td>
                      <td className="px-4 py-2 text-center">—</td>
                      <td className="px-4 py-2 text-right font-mono">{dailyBreakdown.reduce((s,d) => s+d.salary, 0).toLocaleString("zh-CN")}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

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
                          <td className="px-3 py-2 text-xs text-gray-500 hidden sm:table-cell">{orders?.order_source ? (ORDER_SOURCE_LABELS[orders.order_source as OrderSource] || orders.order_source as string) : "—"}</td>
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

          {/* 预支工资 */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mt-4">
            <div className="px-6 py-4 border-b bg-yellow-50">
              <h3 className="font-semibold text-yellow-800">预支工资 / Avance sur salaire</h3>
            </div>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="bg-green-50 rounded-lg p-3">
                  <div className="text-xs text-gray-500">应发工资</div>
                  <div className="text-xl font-bold text-green-700">{monthStats.salary.toLocaleString("zh-CN")} Ar</div>
                </div>
                <div className="bg-orange-50 rounded-lg p-3">
                  <div className="text-xs text-gray-500">已预支</div>
                  <div className="text-xl font-bold text-orange-700">{advTotal.toLocaleString("zh-CN")} Ar</div>
                </div>
                <div className={`rounded-lg p-3 ${advTotal >= monthStats.salary ? 'bg-red-50' : 'bg-blue-50'}`}>
                  <div className="text-xs text-gray-500">还需发</div>
                  <div className={`text-xl font-bold ${advTotal >= monthStats.salary ? 'text-red-700' : 'text-blue-700'}`}>
                    {Math.max(0, monthStats.salary - advTotal).toLocaleString("zh-CN")} Ar
                  </div>
                </div>
              </div>

              {advances.length > 0 && (
                <div className="max-h-40 overflow-y-auto text-xs">
                  <table className="w-full">
                    <thead><tr className="text-gray-500"><th className="text-left py-1">日期</th><th className="text-right py-1">金额 Ar</th><th className="text-left py-1">备注</th></tr></thead>
                    <tbody className="divide-y">
                      {advances.map((a: any) => (
                        <tr key={a.id}>
                          <td className="py-1">{new Date(a.created_at).toLocaleDateString("zh-CN")}</td>
                          <td className="text-right font-mono">{a.amount.toLocaleString("zh-CN")}</td>
                          <td>{a.note || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex items-end gap-2">
                <input type="number" value={advAmount} onChange={e => setAdvAmount(e.target.value)}
                  placeholder="预支金额 (Ar)"
                  className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm" />
                <input value={advNote} onChange={e => setAdvNote(e.target.value)}
                  placeholder="备注（可选）"
                  className="w-40 rounded border border-gray-300 px-2 py-2 text-sm" />
                <Button variant="primary" size="sm" onClick={handleSaveAdvance} loading={advSaving} disabled={!advAmount}>
                  记录预支
                </Button>
              </div>
              {advMsg && <p className={`text-xs ${advMsg.startsWith("✅") ? "text-green-600" : "text-red-600"}`}>{advMsg}</p>}
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
