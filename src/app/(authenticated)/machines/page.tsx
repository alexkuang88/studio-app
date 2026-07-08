"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { createClient } from "@/lib/supabase/client";
import { MACHINE_STATUS_LABELS, type Machine, type MachineStatus } from "@/lib/types/database";
import { Plus, Pencil, MonitorCheck, X } from "lucide-react";
import Link from "next/link";

export default function MachinesPage() {
  const { t } = useLocale();
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editMachine, setEditMachine] = useState<Partial<Machine>>({
    machine_code: "", machine_name: "", status: "available", note: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [runningInfo, setRunningInfo] = useState<Record<string, Record<string, unknown>>>({});

  const supabase = createClient();

  const fetchMachines = async () => {
    setLoading(true);
    const { data } = await supabase.from("machines").select("*").order("machine_code");
    const list = (data as Machine[]) || [];
    setMachines(list);
    const { data: rs } = await supabase.from("work_sessions").select("*, employees(chinese_name, employee_code), orders(order_code, order_source, target_amount, expected_completion_at)").eq("status", "running");
    const map: Record<string, Record<string, unknown>> = {};
    (rs || []).forEach((s: any) => { map[s.machine_id] = s; });
    setRunningInfo(map);
    setLoading(false);
  };

  useEffect(() => { fetchMachines(); }, []);

  const openEdit = (m: Machine) => {
    setEditMachine({ machine_code: m.machine_code, machine_name: m.machine_name, status: m.status, note: m.note || "" });
    setEditingId(m.id);
    setShowForm(false);
    setError("");
  };

  const handleSave = async () => {
    setError("");
    if (!editMachine.machine_code || !editMachine.machine_name) { setError("设备编号和名称不能为空"); return; }
    setSaving(true);

    if (editingId) {
      const res = await fetch(`/api/machines/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...editMachine, is_active: true }),
      });
      if (!res.ok) { const r = await res.json(); setError(r.error); setSaving(false); return; }
    } else {
      const res = await fetch("/api/machines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editMachine),
      });
      if (!res.ok) { const r = await res.json(); setError(r.error); setSaving(false); return; }
    }

    setEditingId(null);
    setEditMachine({ machine_code: "", machine_name: "", status: "available", note: "" });
    setSaving(false);
    fetchMachines();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">设备管理 / Machines</h1>
          <p className="text-gray-500 mt-1">共 {machines.length} 台设备</p>
        </div>
        <div className="flex gap-2">
          <Link href="/machines/dashboard">
            <Button variant="outline"><MonitorCheck size={18} className="mr-1" />现场看板</Button>
          </Link>
          <Button variant="primary" onClick={() => { setShowForm(true); setEditingId(null); setEditMachine({ machine_code: "", machine_name: "", status: "available", note: "" }); setError(""); }}>
            <Plus size={18} className="mr-1" />新增设备
          </Button>
        </div>
      </div>

      {/* Add/Edit form */}
      {(showForm || editingId) && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-lg">{editingId ? `编辑设备 / Modifier ${editMachine.machine_code}` : "新增设备 / Nouvelle machine"}</h3>
            <Button variant="ghost" size="sm" onClick={() => { setShowForm(false); setEditingId(null); }}><X size={16} /></Button>
          </div>
          {error && <div className="bg-red-50 text-red-700 px-4 py-2 rounded text-sm">{error}</div>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="设备编号 / Code machine *" value={editMachine.machine_code}
              onChange={(e) => setEditMachine({ ...editMachine, machine_code: e.target.value })}
              placeholder="M003" disabled={!!editingId} />
            <Input label="设备名称 / Nom *" value={editMachine.machine_name}
              onChange={(e) => setEditMachine({ ...editMachine, machine_name: e.target.value })}
              placeholder="3号机" />
            <Select label="状态 / Statut" value={editMachine.status}
              onChange={(e) => setEditMachine({ ...editMachine, status: e.target.value as MachineStatus })}
              options={Object.entries(MACHINE_STATUS_LABELS).map(([v, l]) => ({ value: v, label: l }))} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">备注 / Note</label>
            <textarea value={editMachine.note || ""} onChange={(e) => setEditMachine({ ...editMachine, note: e.target.value })}
              rows={2} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
          </div>
          <div className="flex gap-2">
            <Button variant="primary" onClick={handleSave} loading={saving}>
              {editingId ? "保存 / Enregistrer" : "创建 / Créer"}
            </Button>
            <Button variant="ghost" onClick={() => { setShowForm(false); setEditingId(null); }}>取消</Button>
          </div>
        </div>
      )}

      {/* Machines grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {machines.map((machine) => {
          const running = runningInfo[machine.id];
          return (
            <div key={machine.id} className={`bg-white rounded-xl border p-4 ${machine.status === "in_use" ? "border-blue-300 shadow-blue-50 shadow-sm" : machine.status === "available" ? "border-green-300" : "border-gray-200"}`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-lg">{machine.machine_code}</span>
                    <Badge variant={machine.status === "available" ? "green" : machine.status === "in_use" ? "blue" : machine.status === "repair" ? "orange" : "red"}>
                      {MACHINE_STATUS_LABELS[machine.status]}
                    </Badge>
                  </div>
                  <p className="text-gray-500 text-sm mt-0.5">{machine.machine_name}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => openEdit(machine)}>
                  <Pencil size={16} />
                </Button>
              </div>
              {machine.status === "in_use" && running && (
                <div className="bg-blue-50 rounded-lg p-3 space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">打手:</span>
                    <span className="font-medium">{running.employees ? `${(running.employees as Record<string, unknown>).employee_code} ${(running.employees as Record<string, unknown>).chinese_name}` : "—"}</span>
                  </div>
                  <div className="flex justify-between"><span className="text-gray-500">订单:</span>
                    <span className="font-mono font-medium">{running.orders ? (running.orders as Record<string, unknown>).order_code as string : "—"}</span>
                  </div>
                </div>
              )}
              {machine.note && <p className="mt-2 text-xs text-gray-400 truncate">{machine.note}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
