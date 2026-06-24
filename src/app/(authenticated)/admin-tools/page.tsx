"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useAuth } from "@/lib/hooks/useAuth";
import { useRouter } from "next/navigation";
import { Wrench, RefreshCw, CheckCircle, Zap, ShieldAlert } from "lucide-react";

export default function AdminToolsPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const [issues, setIssues] = useState<Record<string, any[]>>({});
  const [total, setTotal] = useState(0);
  const [checking, setChecking] = useState(false);
  const [fixing, setFixing] = useState("");
  const [fixMsg, setFixMsg] = useState("");

  useEffect(() => {
    if (!authLoading && !isAdmin) router.push("/");
  }, [authLoading, isAdmin, router]);

  const runCheck = useCallback(async () => {
    setChecking(true);
    const res = await fetch("/api/admin/check");
    const data = await res.json();
    if (res.ok) {
      setIssues(data.issues || {});
      setTotal(data.total_issues || 0);
    }
    setChecking(false);
  }, []);

  useEffect(() => { if (isAdmin) runCheck(); }, [isAdmin, runCheck]);

  const handleFix = async (action: string) => {
    setFixing(action);
    const res = await fetch("/api/admin/fix", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    if (res.ok) {
      setFixMsg(`✅ ${data.results.join(", ")}`);
      runCheck();
    } else {
      setFixMsg(`❌ ${data.error}`);
    }
    setFixing("");
  };

  if (authLoading) return <div className="text-center py-12 text-gray-500">加载中...</div>;

  const categoryLabels: Record<string, { title: string; icon: React.ReactNode; fixAction: string }> = {
    machine_mismatch: { title: "设备状态不一致", icon: <Zap size={18} />, fixAction: "fix-machines" },
    stale_running: { title: "残留 running 分段", icon: <ShieldAlert size={18} />, fixAction: "fix-stale-running" },
    orphan_employee: { title: "已完成/暂停仍绑定打手设备", icon: <ShieldAlert size={18} />, fixAction: "fix-orphan" },
    completed_amount_wrong: { title: "completed_amount 不匹配", icon: <RefreshCw size={18} />, fixAction: "fix-completed" },
    revenue_mismatch: { title: "收入计算不匹配", icon: <RefreshCw size={18} />, fixAction: "fix-revenue" },
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">管理工具 / Admin Tools</h1>
          <p className="text-sm text-gray-500 mt-1">
            {total === 0 ? "✅ 数据一致性正常" : `⚠️ 发现 ${total} 个问题`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={runCheck} loading={checking}>
            <RefreshCw size={18} className="mr-1" />重新检测
          </Button>
          {total > 0 && (
            <Button variant="primary" onClick={() => handleFix("fix-all")} loading={fixing === "fix-all"}>
              <Wrench size={18} className="mr-1" />一键修复全部
            </Button>
          )}
        </div>
      </div>

      {fixMsg && (
        <div className={`rounded-lg px-4 py-3 text-sm font-medium ${fixMsg.startsWith("✅") ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
          {fixMsg}
        </div>
      )}

      {total === 0 && !checking ? (
        <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
          <CheckCircle size={48} className="mx-auto text-green-500 mb-3" />
          <p className="text-lg font-semibold text-green-700">数据一致性正常，无需修复</p>
          <p className="text-sm text-green-600 mt-1">设备、订单、分段数据全部一致</p>
        </div>
      ) : (
        Object.entries(categoryLabels).map(([key, cat]) => {
          const list = issues[key] || [];
          if (list.length === 0) return null;
          return (
            <div key={key} className="bg-white rounded-xl border border-red-200 overflow-hidden">
              <div className="px-6 py-4 border-b bg-red-50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-red-600">{cat.icon}</span>
                  <h3 className="font-semibold text-red-800">{cat.title}</h3>
                  <Badge variant="red">{list.length}</Badge>
                </div>
                <Button size="sm" variant="danger" onClick={() => handleFix(cat.fixAction)} loading={fixing === cat.fixAction}>
                  修复此项
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <tbody className="divide-y">
                    {list.slice(0, 20).map((item: any, i: number) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-xs">
                          {item.order || item.machine || JSON.stringify(item).slice(0, 80)}
                        </td>
                        <td className="px-4 py-2 text-xs text-gray-400 text-right">{item.fix}</td>
                      </tr>
                    ))}
                    {list.length > 20 && (
                      <tr><td colSpan={2} className="px-4 py-2 text-xs text-gray-400 text-center">...另有 {list.length - 20} 项</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
