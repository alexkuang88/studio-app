"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/lib/hooks/useAuth";
import { useRouter } from "next/navigation";
import { Wrench, Search, Save } from "lucide-react";

export default function AdminToolsPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const [searchCode, setSearchCode] = useState("");
  const [order, setOrder] = useState<Record<string, any> | null>(null);
  const [editFields, setEditFields] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  // 一键修复们
  const [fixing, setFixing] = useState("");

  useEffect(() => {
    if (!authLoading && !isAdmin) router.push("/");
  }, [authLoading, isAdmin, router]);

  const searchOrder = async () => {
    if (!searchCode.trim()) return;
    setLoading(true);
    setOrder(null);
    setMsg("");
    const res = await fetch(`/api/admin/order-edit?code=${searchCode.trim()}`);
    const data = await res.json();
    if (res.ok && data.order) {
      setOrder(data.order);
      setEditFields({});
    } else {
      setMsg("❌ 订单不存在");
    }
    setLoading(false);
  };

  const handleSave = async () => {
    if (!order) return;
    setSaving(true);
    setMsg("");
    const updates: Record<string, any> = {};
    for (const [k, v] of Object.entries(editFields)) {
      if (v === "") continue;
      const num = parseFloat(v);
      updates[k] = isNaN(num) ? v : num;
    }
    if (Object.keys(updates).length === 0) {
      setMsg("⚠️ 没有修改");
      setSaving(false);
      return;
    }
    const res = await fetch("/api/admin/order-edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_id: order.id, updates }),
    });
    if (res.ok) {
      setMsg("✅ 保存成功");
      setEditFields({});
      searchOrder();
    } else {
      const d = await res.json();
      setMsg("❌ " + (d.error || "失败"));
    }
    setSaving(false);
  };

  const handleFix = async (action: string, label: string) => {
    setFixing(label);
    const res = await fetch("/api/admin/fix", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    setMsg(res.ok ? `✅ ${label}` : `❌ ${data.error}`);
    setFixing("");
  };

  const editableFields = [
    "order_amount", "target_amount", "completed_amount", "initial_balance",
    "unit_price", "order_revenue", "latest_balance", "total_client_amount",
  ];

  const fieldLabels: Record<string, string> = {
    order_amount: "订单金额(万)", target_amount: "目标余额(万)", completed_amount: "已完成(万)",
    initial_balance: "初始余额(万)", unit_price: "客单价", order_revenue: "收入",
    latest_balance: "最新余额(万)", total_client_amount: "客户盈亏(万)",
  };

  const tools = [
    { action: "fix-machines", label: "修复设备状态" },
    { action: "fix-stale-running", label: "关闭残留分段" },
    { action: "fix-orphan", label: "释放多余打手" },
    { action: "fix-completed", label: "修正完成金额" },
    { action: "fix-revenue", label: "重算全部收入" },
  ];

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">管理工具 / Admin Tools</h1>
        <p className="text-sm text-gray-500 mt-1">搜订单号直接改数据</p>
      </div>

      {msg && (
        <div className={`rounded-lg px-4 py-3 text-sm font-medium ${msg.startsWith("✅") ? "bg-green-50 text-green-700 border border-green-200" : msg.startsWith("⚠️") ? "bg-yellow-50 text-yellow-700 border border-yellow-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
          {msg}
        </div>
      )}

      {/* Search & Edit */}
      <div className="bg-white rounded-xl border border-blue-200 p-4">
        <h2 className="font-semibold text-gray-900 mb-3">订单数据编辑器</h2>
        <div className="flex gap-2 mb-4">
          <input
            value={searchCode}
            onChange={e => setSearchCode(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === "Enter" && searchOrder()}
            placeholder="输入订单号 如 P465"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono"
          />
          <Button variant="primary" size="sm" onClick={searchOrder} loading={loading}>
            <Search size={16} className="mr-1" />查找
          </Button>
        </div>

        {order && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-sm">
              <span className="font-mono font-bold text-lg">{order.order_code}</span>
              <span className="text-gray-400">|</span>
              <span className="text-gray-600">status: <strong>{order.status}</strong></span>
              <span className="text-gray-400">|</span>
              <span className="text-gray-600">来源: <strong>{order.order_source}</strong></span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {editableFields.map((f) => (
                <div key={f}>
                  <label className="block text-xs text-gray-500 mb-0.5">{fieldLabels[f] || f}</label>
                  <input
                    value={editFields[f] ?? String(order[f] ?? "")}
                    onChange={e => {
                      const next = { ...editFields };
                      next[f] = e.target.value;
                      setEditFields(next);
                    }}
                    className="w-full rounded border border-gray-300 px-2 py-1 text-xs font-mono"
                    placeholder={String(order[f] ?? "")}
                  />
                </div>
              ))}
            </div>

            <Button variant="primary" size="sm" onClick={handleSave} loading={saving}>
              <Save size={16} className="mr-1" />保存修改
            </Button>
          </div>
        )}
      </div>

      {/* 一键修复 */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="font-semibold text-gray-900 mb-3">批量修复</h2>
        <div className="flex flex-wrap gap-2">
          {tools.map(t => (
            <Button key={t.action} variant="outline" size="sm" onClick={() => handleFix(t.action, t.label)} loading={fixing === t.label}>
              {t.label}
            </Button>
          ))}
          <Button variant="primary" size="sm" onClick={() => handleFix("fix-all", "一键修全部")} loading={fixing === "一键修全部"}>
            <Wrench size={16} className="mr-1" />一键修全部
          </Button>
        </div>
      </div>
    </div>
  );
}
