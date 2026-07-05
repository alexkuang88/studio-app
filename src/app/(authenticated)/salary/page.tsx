"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  getCurrentMonth,
  getRecentMonths,
  getMonthLabel,
  formatHours as formatHoursText,
  formatAmount,
} from "@/lib/utils/time-utils";
import { formatSalary } from "@/lib/utils/calculations";
import { Lock, Unlock, FileDown } from "lucide-react";
import Link from "next/link";

export default function SalaryPage() {
  const { isAdmin } = useAuth();
  const supabase = createClient();
  const [month, setMonth] = useState(getCurrentMonth());
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [lockNote, setLockNote] = useState("");
  const [unlockNote, setUnlockNote] = useState("");
  const [showUnlock, setShowUnlock] = useState(false);
  const [acting, setActing] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const res = await fetch(`/api/salary?month=${month}`);
    const result = await res.json();
    setData(result as Record<string, unknown>);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [month]);

  const handleLock = async () => {
    setActing(true);
    const res = await fetch("/api/salary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month, action: "lock", note: lockNote || null }),
    });
    if (res.ok) fetchData();
    setActing(false);
    setLockNote("");
  };

  const handleUnlock = async () => {
    if (!unlockNote.trim()) return;
    setActing(true);
    const res = await fetch("/api/salary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month, action: "unlock", note: unlockNote }),
    });
    if (res.ok) { fetchData(); setShowUnlock(false); setUnlockNote(""); }
    setActing(false);
  };

  const employees = (data?.employees as Array<Record<string, unknown>>) || [];
  const isLocked = data?.is_locked as boolean;
  const salaryRate = data?.salary_rate as number || 700;
  const isTiered = data?.is_tiered as boolean || false;
  const baseRate = data?.salary_rate_base as number || 700;
  const premiumRate = data?.salary_rate_premium as number || 800;
  const dailyThreshold = data?.daily_threshold as number || 2200;
  const startDate = data?.tiered_salary_start_date as string || "2026-07-06";

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">工资统计 / Statistiques salaire</h1>
          <p className="text-sm text-gray-500 mt-1">
            {isTiered ? (
              <>基础 {baseRate} / 高级 {premiumRate} Ar/100万（日产量≥{dailyThreshold}万触发，{startDate}起）</>
            ) : (
              <>工资单价: {salaryRate} Ar/100万 / Taux </>
            )}
            {isLocked && <Badge variant="red">已锁定 / Verrouillé</Badge>}
          </p>
        </div>
        <div className="flex gap-2">
          <Select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            options={getRecentMonths(12).map((m) => ({ value: m, label: getMonthLabel(m) }))}
          />
          {isAdmin && !isLocked && (
            <Button variant="outline" onClick={() => { setLockNote(""); handleLock(); }} loading={acting}>
              <Lock size={16} /> 锁定 / Verrouiller
            </Button>
          )}
          {isAdmin && isLocked && (
            <Button variant="danger" onClick={() => setShowUnlock(true)}>
              <Unlock size={16} /> 解锁 / Déverrouiller
            </Button>
          )}
        </div>
      </div>

      {/* Lock note input */}
      {isAdmin && !isLocked && lockNote !== undefined && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex gap-3 items-end">
          <Input
	            label="锁定备注（可选） / Note (optionnel)"
            value={lockNote}
            onChange={(e) => setLockNote(e.target.value)}
            placeholder="备注... / Note..."
            className="flex-1"
          />
          <Button variant="primary" onClick={handleLock} loading={acting}>确认锁定 / Confirmer</Button>
          <Button variant="ghost" onClick={() => setLockNote(undefined as unknown as string)}>取消 / Annuler</Button>
        </div>
      )}

      {/* Unlock */}
      {showUnlock && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-3">
          <h4 className="font-semibold text-red-800">解锁工资 / Déverrouiller</h4>
          <Input
            label="解锁原因 / Raison *"
            value={unlockNote}
            onChange={(e) => setUnlockNote(e.target.value)}
            placeholder="必须填写解锁原因... / Raison obligatoire..."
          />
          <div className="flex gap-2">
            <Button variant="danger" onClick={handleUnlock} loading={acting} disabled={!unlockNote.trim()}>
              确认解锁 / Confirmer
            </Button>
            <Button variant="ghost" onClick={() => { setShowUnlock(false); setUnlockNote(""); }}>
              取消 / Annuler
            </Button>
          </div>
        </div>
      )}

      {/* Salary table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-3 py-3 text-left w-10">#</th>
                <th className="px-3 py-3 text-left">员工 / Employé</th>
                <th className="px-3 py-3 text-right">总成绩(万) / Total</th>
                <th className="px-3 py-3 text-right hidden sm:table-cell">总工时(h) / Heures</th>
                <th className="px-3 py-3 text-right hidden md:table-cell">平均效率 / Efficacité</th>
                <th className="px-3 py-3 text-right font-medium">应发工资 / Salaire</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-500">加载中... / Chargement...</td></tr>
              ) : employees.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-500">该月暂无数据 / Aucune donnée ce mois</td></tr>
              ) : (
                employees.map((row) => {
                  const emp = row.employee as Record<string, unknown>;
                  return (
                    <tr key={emp?.id as string} className="hover:bg-gray-50">
                      <td className="px-3 py-3 text-gray-400 font-mono">{row.rank as number}</td>
                      <td className="px-3 py-3">
                        <Link href={`/employees/${emp?.id}`} className="text-blue-600 hover:underline">
                          {emp?.employee_code as string} {emp?.chinese_name as string}
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-right font-mono font-medium">
                        {(row.total_result as number)?.toLocaleString("zh-CN") || "0"}
                      </td>
                      <td className="px-3 py-3 text-right text-gray-500 hidden sm:table-cell">
                        {(row.total_hours as number)?.toFixed(1) || "0"}h
                      </td>
                      <td className="px-3 py-3 text-right text-gray-500 hidden md:table-cell">
                        {row.avg_efficiency != null ? `${(row.avg_efficiency as number).toFixed(1)} 万/h` : "—"}
                      </td>
                      <td className="px-3 py-3 text-right font-mono font-bold text-green-700">
                        {formatSalary(row.salary as number)}
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
