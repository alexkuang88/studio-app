"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { createClient } from "@/lib/supabase/client";
import { nowDatetimeLocal, formatDateTime } from "@/lib/utils/time-utils";
import { calcWorkHours, calcEfficiency, calcResultAmount } from "@/lib/utils/calculations";
import { ArrowLeft, ArrowRightLeft } from "lucide-react";
import Link from "next/link";

export default function HandoverPage() {
  const router = useRouter();
  const supabase = createClient();

  const [runningSessions, setRunningSessions] = useState<Array<Record<string, unknown>>>([]);
  const [employees, setEmployees] = useState<Array<{ id: string; employee_code: string; chinese_name: string; status: string; isBusy: boolean }>>([]);
  const [machines, setMachines] = useState<Array<{ id: string; machine_code: string; machine_name: string; status: string; isBusy: boolean; isDisabled: boolean }>>([]);
  const [busyEmployeeIds, setBusyEmployeeIds] = useState<Set<string>>(new Set());

  const [selectedSession, setSelectedSession] = useState("");
  const [endTime, setEndTime] = useState(nowDatetimeLocal());
  const [endAmount, setEndAmount] = useState("");
  const [nextEmployee, setNextEmployee] = useState("");
  const [nextMachine, setNextMachine] = useState("__same__");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Computed preview
  const [preview, setPreview] = useState<{
    startAmount: number;
    resultAmount: number;
    workHours: number;
    efficiency: number;
  } | null>(null);

  useEffect(() => {
    async function load() {
      const [sessRes, empRes, mcRes] = await Promise.all([
        supabase.from("work_sessions")
          .select("*, employees!inner(*), machines!inner(*), orders!inner(*)")
          .eq("status", "running")
          .order("start_time", { ascending: false }),
        supabase.from("employees").select("id, employee_code, chinese_name, status")
          .eq("is_active", true).order("employee_code"),
        supabase.from("machines").select("id, machine_code, machine_name, status")
          .eq("is_active", true).order("machine_code"),
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sessions = (sessRes.data || []) as any[];
      setRunningSessions(sessions);

      // Track who's busy
      const busyIds = new Set<string>();
      const busyMcIds = new Set<string>();
      sessions.forEach((s: any) => {
        busyIds.add(s.employee_id as string);
        busyMcIds.add(s.machine_id as string);
      });
      setBusyEmployeeIds(busyIds);

      // Employees with status
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawEmps = (empRes.data || []) as any[];
      const emps = rawEmps.map((e: any) => ({
        id: e.id as string,
        employee_code: e.employee_code as string,
        chinese_name: e.chinese_name as string,
        status: e.status as string,
        isBusy: busyIds.has(e.id as string),
      }));
      setEmployees(emps);

      // Machines with status
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawMcs = (mcRes.data || []) as any[];
      const mcs = rawMcs.map((m: any) => ({
        id: m.id as string,
        machine_code: m.machine_code as string,
        machine_name: m.machine_name as string,
        status: m.status as string,
        isBusy: busyMcIds.has(m.id as string) || m.status === "in_use",
        isDisabled: m.status === "repair" || m.status === "disabled",
      }));
      setMachines(mcs);
    }
    load();
  }, []);

  // Update preview when endAmount or endTime changes
  useEffect(() => {
    const session = runningSessions.find((s) => s.id === selectedSession);
    if (!session || !endAmount || !endTime) {
      setPreview(null);
      return;
    }
    const startAmount = session.start_amount as number;
    const endAmt = parseFloat(endAmount);
    if (isNaN(endAmt)) { setPreview(null); return; }
    const resultAmt = calcResultAmount(startAmount, endAmt);
    const wHours = calcWorkHours(session.start_time as string, endTime);
    const eff = calcEfficiency(resultAmt, wHours);
    setPreview({ startAmount, resultAmount: resultAmt, workHours: wHours, efficiency: eff });
  }, [selectedSession, endAmount, endTime, runningSessions]);

  // When selecting a session, auto-fill next machine to same
  useEffect(() => {
    const session = runningSessions.find((s) => s.id === selectedSession);
    if (session) {
      setNextMachine("__same__");
    }
  }, [selectedSession, runningSessions]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!selectedSession || !endAmount || !nextEmployee) {
      setError("请填写所有必填项");
      return;
    }

    const endAmt = parseFloat(endAmount);
    const session = runningSessions.find((s) => s.id === selectedSession);
    if (!session) return;

    if (endAmt < (session.start_amount as number)) {
      setError("结束余额不能小于开始余额");
      return;
    }

    const actualNextMachine = nextMachine === "__same__" ? session.machine_id : nextMachine;

    setLoading(true);
    const res = await fetch("/api/work-sessions/handover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        running_session_id: selectedSession,
        end_time: new Date(endTime).toISOString(),
        end_amount: endAmt,
        next_employee_id: nextEmployee,
        next_machine_id: actualNextMachine,
      }),
    });

    const result = await res.json();

    if (!res.ok) {
      setError(result.error || "操作失败");
      setLoading(false);
      return;
    }

    setSuccess(
      `✅ 交接完成！上一位成绩: ${result.completed_session.result_amount}万, 工时: ${result.completed_session.work_hours}h`
    );
    setLoading(false);

    setTimeout(() => router.push("/machines/dashboard"), 1500);
  };

  const currentSession = runningSessions.find((s) => s.id === selectedSession);
  const currentEmp = currentSession?.employees as Record<string, unknown> | null;
  const currentMachine = currentSession?.machines as Record<string, unknown> | null;
  const currentOrder = currentSession?.orders as Record<string, unknown> | null;

  return (
    <div className="space-y-6 animate-fade-in max-w-xl">
      <div className="flex items-center gap-4">
        <Link href="/entry"><Button variant="ghost" size="sm"><ArrowLeft size={18} /></Button></Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">换人交接 / Relève</h1>
          <p className="text-sm text-gray-500 mt-1">步骤: 选择当前进行中的设备 → 填写结束余额 → 选择接班打手</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        {error && <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}
        {success && <div className="bg-green-50 text-green-700 px-4 py-3 rounded-lg text-sm font-medium">{success}</div>}

        {/* Step 1: Select running session */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            选择进行中的设备 / Choisir machine en cours *
          </label>
          <div className="grid gap-2 max-h-56 overflow-y-auto">
            {runningSessions.length === 0 && (
              <p className="text-sm text-gray-400 py-2">暂无进行中的打单 / Aucune session en cours</p>
            )}
            {runningSessions.map((s) => {
              const emp = s.employees as Record<string, unknown>;
              const m = s.machines as Record<string, unknown>;
              const o = s.orders as Record<string, unknown>;
              return (
                <button type="button" key={s.id as string}
                  onClick={() => setSelectedSession(s.id as string)}
                  className={`text-left px-4 py-3 rounded-lg border-2 transition-all ${
                    selectedSession === s.id
                      ? "border-blue-500 bg-blue-50 ring-2 ring-blue-200"
                      : "border-gray-200 hover:border-blue-300"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-mono font-bold">{m?.machine_code as string}</span>
                      <span className="text-gray-700 ml-2">{emp?.employee_code as string} {emp?.chinese_name as string}</span>
                    </div>
                    <span className="text-xs text-gray-500">订单 {o?.order_code as string}</span>
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    开始余额: {(s.start_amount as number)?.toLocaleString("zh-CN")} 万
                    &nbsp;|&nbsp; {formatDateTime(s.start_time as string)}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Current info */}
        {currentSession && (
          <div className="bg-blue-50 rounded-lg p-4 space-y-2 text-sm">
            <InfoLine label="当前打手" value={currentEmp ? `${currentEmp.employee_code as string} ${currentEmp.chinese_name as string}` : "—"} />
            <InfoLine label="当前设备" value={currentMachine ? `${currentMachine.machine_code as string} ${currentMachine.machine_name as string}` : "—"} />
            <InfoLine label="当前订单" value={currentOrder ? (currentOrder.order_code as string) : "—"} mono />
            <InfoLine label="开始时间" value={formatDateTime(currentSession.start_time as string)} />
            <InfoLine label="开始余额" value={`${(currentSession.start_amount as number)?.toLocaleString("zh-CN")} 万`} />
          </div>
        )}

        {/* Step 2: End time & end amount */}
        <div className="border-t pt-5">
          <h3 className="font-semibold text-gray-800 mb-3">结束本班 / Fin de session</h3>
          <div className="space-y-4">
            <Input
              label="结束时间 / Heure de fin *"
              type="datetime-local"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
            <Input
              label={`结束余额 / Solde final * (≥ ${(currentSession?.start_amount as number)?.toLocaleString("zh-CN") || 0}万)`}
              type="number"
              value={endAmount}
              onChange={(e) => setEndAmount(e.target.value)}
              placeholder=">= 开始余额"
            />
          </div>
        </div>

        {/* Preview */}
        {preview && (
          <div className="bg-green-50 rounded-lg p-4 space-y-2 text-sm">
            <h4 className="font-semibold text-green-800">自动计算结果 / Calcul automatique</h4>
            <InfoLine label="本次成绩 / Résultat" value={`${preview.resultAmount.toLocaleString("zh-CN")} 万`} highlight />
            <InfoLine label="工作时长 / Heures" value={`${preview.workHours.toFixed(1)} h`} />
            <InfoLine label="效率 / Efficacité" value={`${preview.efficiency.toLocaleString("zh-CN")} 万/h`} />
          </div>
        )}

        {/* Step 3: Next employee - card selection */}
        <div className="border-t pt-5">
          <h3 className="font-semibold text-gray-800 mb-3">接班打手 / Employé suivant *</h3>
          <div className="grid gap-2 max-h-64 overflow-y-auto">
            {employees
              .filter((e) => e.id !== currentEmp?.id)
              .map((e) => (
                <button type="button" key={e.id}
                  onClick={() => setNextEmployee(e.id)}
                  className={`flex items-center justify-between px-4 py-3 rounded-lg border-2 transition-all cursor-pointer ${
                    nextEmployee === e.id
                      ? "border-blue-500 bg-blue-50 ring-2 ring-blue-200"
                      : "border-gray-200 hover:border-blue-300 hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${e.isBusy ? "bg-red-400" : "bg-green-400"}`} />
                    <span className="font-medium text-gray-900">
                      {e.employee_code} {e.chinese_name}
                    </span>
                    <span className="text-xs text-gray-400">[{e.status}]</span>
                  </div>
                  <div>
                    {e.isBusy ? (
                      <Badge variant="red">🔴 打单中</Badge>
                    ) : (
                      <Badge variant="green">🟢 空闲</Badge>
                    )}
                  </div>
                </button>
              ))}
          </div>

          {/* Machine selection */}
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">选择接班设备 / Choisir machine *</label>
            <div className="grid grid-cols-2 gap-2">
              {/* Same machine option */}
              {currentSession && (
                <button type="button"
                  onClick={() => setNextMachine("__same__")}
                  className={`px-3 py-2 rounded-lg border-2 text-sm transition-all ${
                    nextMachine === "__same__"
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  📱 原设备: {currentMachine?.machine_code as string}
                </button>
              )}
              {machines
                .filter((m) => m.id !== currentSession?.machine_id && !m.isDisabled)
                .map((m) => (
                  <button type="button" key={m.id}
                    onClick={() => setNextMachine(m.id)}
                    className={`px-3 py-2 rounded-lg border-2 text-sm transition-all cursor-pointer ${
                      nextMachine === m.id
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    {m.machine_code} {m.machine_name}
                    {m.isBusy ? " 🔴" : " 🟢"}
                  </button>
                ))}
            </div>
          </div>

          <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
            接班开始余额将自动设为上一位结束余额：<strong>{endAmount ? `${parseFloat(endAmount).toLocaleString("zh-CN")} 万` : "（请先填写结束余额）"}</strong><br />
            接班开始时间将自动设为上一位结束时间。
          </div>
        </div>

        <Button type="submit" variant="primary" size="lg" block loading={loading}>
          <ArrowRightLeft size={20} className="mr-2" />
          确认交接 / Confirmer la relève
        </Button>
      </form>
    </div>
  );
}

function InfoLine({ label, value, mono = false, highlight = false }: { label: string; value: string; mono?: boolean; highlight?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}:</span>
      <span className={`font-medium ${highlight ? "text-green-700 font-bold" : "text-gray-900"} ${mono ? "font-mono" : ""}`}>
        {value}
      </span>
    </div>
  );
}
