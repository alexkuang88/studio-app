"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/hooks/useAuth";
import { useRouter } from "next/navigation";
import { Wrench } from "lucide-react";

export default function AdminToolsPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const [fixing, setFixing] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!authLoading && !isAdmin) router.push("/");
  }, [authLoading, isAdmin, router]);

  const handleFix = async (action: string, label: string) => {
    setFixing(label);
    setMsg("");
    const res = await fetch("/api/admin/fix", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    if (res.ok) {
      setMsg(`✅ ${label} — 完成！`);
    } else {
      setMsg(`❌ ${data.error || "失败"}`);
    }
    setFixing("");
  };

  const tools = [
    { action: "fix-machines", label: "修复设备状态", desc: "设备in_use但无人打单 → 释放；设备available但有人打单 → 改为in_use" },
    { action: "fix-stale-running", label: "关闭残留分段", desc: "已完成/暂停的订单如果还显示进行中，关掉多余的分段记录" },
    { action: "fix-orphan", label: "释放多余打手", desc: "已完成/暂停的订单还绑着打手和设备 → 全部释放" },
    { action: "fix-completed", label: "修正完成金额", desc: "重新用分段成绩计算每个已完成订单的completed_amount" },
    { action: "fix-revenue", label: "重算全部收入", desc: "所有订单收入 = 金额/100×单价，修正客单价改过的订单" },
  ];

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">管理工具 / Admin Tools</h1>
        <p className="text-sm text-gray-500 mt-1">数据修复工具，点按钮直接修复，不需要等</p>
      </div>

      {msg && (
        <div className={`rounded-lg px-4 py-3 text-sm font-medium ${msg.startsWith("✅") ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
          {msg}
        </div>
      )}

      <div className="space-y-4">
        {tools.map((tool) => (
          <div key={tool.action} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
            <div className="flex-1 mr-4">
              <h3 className="font-semibold text-gray-900">{tool.label}</h3>
              <p className="text-xs text-gray-500 mt-0.5">{tool.desc}</p>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={() => handleFix(tool.action, tool.label)}
              loading={fixing === tool.label}
            >
              执行
            </Button>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-blue-200 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-blue-900">一键修复全部</h3>
            <p className="text-xs text-blue-600 mt-0.5">依次执行上面 5 个操作</p>
          </div>
          <Button
            variant="primary"
            onClick={() => handleFix("fix-all", "一键修复全部")}
            loading={fixing === "一键修复全部"}
          >
            <Wrench size={18} className="mr-1" />一键修
          </Button>
        </div>
      </div>
    </div>
  );
}
