"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/hooks/useAuth";
import { useRouter } from "next/navigation";
import { Wrench, Search, Save, Eye } from "lucide-react";

export default function AdminToolsPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!authLoading && !isAdmin) router.push("/");
  }, [authLoading, isAdmin, router]);

  // ===== 订单编辑器 =====
  const [searchCode, setSearchCode] = useState("");
  const [order, setOrder] = useState<Record<string, any> | null>(null);
  const [editFields, setEditFields] = useState<Record<string, string>>({});
  const [oLoading, setOLoading] = useState(false);
  const [oSaving, setOSaving] = useState(false);

  const searchOrder = async () => {
    if (!searchCode.trim()) return;
    setOLoading(true); setOrder(null); setMsg("");
    const res = await fetch(`/api/admin/order-edit?code=${searchCode.trim()}`);
    const data = await res.json();
    if (res.ok && data.order) { setOrder(data.order); setEditFields({}); }
    else { setMsg("❌ 订单不存在"); }
    setOLoading(false);
  };

  const handleSave = async () => {
    if (!order) return;
    setOSaving(true); setMsg("");
    const updates: Record<string, any> = {};
    for (const [k, v] of Object.entries(editFields)) {
      if (v === "") continue;
      const num = parseFloat(v);
      updates[k] = isNaN(num) ? v : num;
    }
    if (Object.keys(updates).length === 0) { setMsg("⚠️ 没有修改"); setOSaving(false); return; }
    const res = await fetch("/api/admin/order-edit", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_id: order.id, updates }),
    });
    setMsg(res.ok ? "✅ 保存成功" : "❌ " + ((await res.json()).error || "失败"));
    setOSaving(false);
    if (res.ok) { setEditFields({}); searchOrder(); }
  };

  const editableFields = [
    "order_amount", "target_amount", "completed_amount", "initial_balance",
    "unit_price", "order_revenue", "latest_balance", "total_client_amount",
  ];
  const fieldLabels: Record<string, string> = {
    order_amount: "订单金额", target_amount: "目标余额", completed_amount: "已完成",
    initial_balance: "初始余额", unit_price: "客单价", order_revenue: "收入",
    latest_balance: "最新余额", total_client_amount: "客户盈亏",
  };

  // ===== 批量修复（带预览） =====
  const [preview, setPreview] = useState<{ action: string; label: string; items: string[] } | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const tools = [
    { action: "fix-machines", label: "修复设备状态", desc: "设备状态跟实际打单不一致时自动纠正" },
    { action: "fix-stale-running", label: "关闭残留分段", desc: "已完成的订单还留着进行中记录 → 关掉" },
    { action: "fix-orphan", label: "释放多余打手", desc: "已完成/暂停订单还在占打手设备 → 释放" },
  ];

  const handlePreview = async (action: string, label: string) => {
    setPreviewing(true); setPreview(null); setMsg("");
    const res = await fetch(`/api/admin/check`);
    const data = await res.json();
    if (!res.ok) { setMsg("❌ 检测失败"); setPreviewing(false); return; }

    const issues = data.issues || {};
    let items: string[] = [];

    if (action === "fix-machines" || action === "fix-all") {
      for (const i of (issues.machine_mismatch || [])) {
        items.push(`设备 ${i.machine}: ${i.status} → ${i.running ? "in_use" : "available"}`);
      }
    }
    if (action === "fix-stale-running" || action === "fix-all") {
      for (const i of (issues.stale_running || [])) {
        items.push(`${i.order} (${i.status}) 有 ${i.running_count} 条残留running分段`);
      }
    }
    if (action === "fix-orphan" || action === "fix-all") {
      for (const i of (issues.orphan_employee || [])) {
        items.push(`${i.order} (${i.status}) 绑着打手设备 → 将释放`);
      }
    }
    if (action === "fix-all") {
      for (const i of (issues.completed_amount_wrong || [])) {
        items.push(`${i.order}: completed从${i.db} → ${i.calc}`);
      }
      for (const i of (issues.revenue_mismatch || [])) {
        items.push(`${i.order}: 收入从${i.db_revenue} → ${i.expected} (${i.amount}万×${i.unit_price})`);
      }
    }

    setPreview({ action, label, items });
    setPreviewing(false);
  };

  const handleConfirm = async () => {
    if (!preview) return;
    const allItems = preview.items;
    setMsg("");
    const res = await fetch("/api/admin/fix", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: preview.action }),
    });
    const data = await res.json();
    if (res.ok) {
      setMsg(`✅ 已修复，共 ${allItems.length} 处改动`);
      setPreview(null);
    } else {
      setMsg("❌ " + (data.error || "失败"));
    }
  };

  const handleCancel = () => {
    setMsg(`❌ 已取消，数据未改动`);
    setPreview(null);
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">管理工具 / Admin Tools</h1>
        <p className="text-sm text-gray-500 mt-1">搜订单改数据 · 批量修复先预览再确认</p>
      </div>

      {msg && (
        <div className={`rounded-lg px-4 py-3 text-sm font-medium ${msg.startsWith("✅") ? "bg-green-50 text-green-700 border border-green-200" : msg.startsWith("❌") ? "bg-yellow-50 text-yellow-700 border border-yellow-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
          {msg}
        </div>
      )}

      {/* 订单编辑器 */}
      <div className="bg-white rounded-xl border border-blue-200 p-4">
        <h2 className="font-semibold text-gray-900 mb-3">订单数据编辑器</h2>
        <div className="flex gap-2 mb-4">
          <input value={searchCode} onChange={e => setSearchCode(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === "Enter" && searchOrder()}
            placeholder="输入订单号 如 P465"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono" />
          <Button variant="primary" size="sm" onClick={searchOrder} loading={oLoading}>
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
                  <input value={editFields[f] ?? String(order[f] ?? "")}
                    onChange={e => { const next = { ...editFields }; next[f] = e.target.value; setEditFields(next); }}
                    className="w-full rounded border border-gray-300 px-2 py-1 text-xs font-mono"
                    placeholder={String(order[f] ?? "")} />
                </div>
              ))}
            </div>
            <Button variant="primary" size="sm" onClick={handleSave} loading={oSaving}>
              <Save size={16} className="mr-1" />保存修改
            </Button>
          </div>
        )}
      </div>

      {/* 批量修复 — 预览模式 */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="font-semibold text-gray-900 mb-1">批量修复</h2>
        <p className="text-xs text-gray-400 mb-3">先看有哪些问题再决定修不修</p>

        {preview ? (
          <div className="space-y-3">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <p className="text-sm font-semibold text-yellow-800">
                确认执行 <strong>{preview.label}</strong>？
              </p>
              <p className="text-xs text-yellow-600 mt-1">
                将修改 {preview.items.length} 处数据。以下是要改的内容：
              </p>
              <div className="mt-2 max-h-48 overflow-y-auto text-xs space-y-0.5">
                {preview.items.map((item, i) => (
                  <div key={i} className="text-yellow-700">{item}</div>
                ))}
                {preview.items.length === 0 && (
                  <div className="text-green-600 font-medium">✅ 没有需要修复的</div>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              {preview.items.length > 0 && (
                <Button variant="primary" size="sm" onClick={handleConfirm}>
                  <Wrench size={16} className="mr-1" />确认修复
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={handleCancel}>取消</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {tools.map(t => (
              <Button key={t.action} variant="outline" size="sm"
                onClick={() => handlePreview(t.action, t.label)} loading={previewing}>
                <Eye size={16} className="mr-1" />{t.label}
              </Button>
            ))}
            <Button variant="primary" size="sm"
              onClick={() => handlePreview("fix-all", "一键修复全部")} loading={previewing}>
              <Wrench size={16} className="mr-1" />一键修复全部
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
