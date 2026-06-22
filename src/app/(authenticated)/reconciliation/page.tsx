"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { ORDER_SOURCE_LABELS, type OrderSource } from "@/lib/types/database";
import { formatDateTime, getCurrentMonth } from "@/lib/utils/time-utils";
import { CheckSquare, Square, DollarSign, TrendingUp, ClipboardCheck } from "lucide-react";

interface ReconOrder {
  id: string;
  order_code: string;
  order_source: string;
  order_amount: number;
  order_revenue: number;
  is_settled: boolean;
  settled_amount: number | null;
  settled_at: string | null;
  settled_note: string | null;
  actual_completed_at: string | null;
}

interface Summary {
  total: number;
  settled_count: number;
  unsettled_count: number;
  settled_revenue: number;
  unsettled_revenue: number;
  system_total_revenue: number;
}

export default function ReconciliationPage() {
  const [orders, setOrders] = useState<ReconOrder[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [sourceFilter, setSourceFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [settleNote, setSettleNote] = useState("");
  const [settling, setSettling] = useState(false);
  const [msg, setMsg] = useState("");
  const [settledAmounts, setSettledAmounts] = useState<Record<string, string>>({});

  // 过去7天未结算统计（用MG时间 UTC+3）
  const weekStart = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  })();
  const thisWeekUnsettled = orders.filter(o => !o.is_settled && (o.actual_completed_at || "").slice(0, 10) >= weekStart);
  const thisWeekUnsettledAmt = thisWeekUnsettled.reduce((s, o) => s + (o.order_revenue || 0), 0);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (sourceFilter) params.set("source", sourceFilter);
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);
    const res = await fetch(`/api/reconciliation?${params.toString()}`);
    const result = await res.json();
    if (res.ok) {
      setOrders(result.orders || []);
      setSummary(result.summary);
    }
    setLoading(false);
  }, [sourceFilter, dateFrom, dateTo]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const toggleAll = () => {
    if (selected.size === orders.filter(o => !o.is_settled).length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(orders.filter(o => !o.is_settled).map(o => o.id)));
    }
  };

  const handleSettle = async () => {
    if (selected.size === 0) return;
    setSettling(true);
    const res = await fetch("/api/reconciliation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_ids: Array.from(selected), note: settleNote || null, settled_amounts: settledAmounts }),
    });
    if (res.ok) {
      setMsg(`✅ 已结算 ${selected.size} 个订单`);
      setSelected(new Set());
      setSettleNote("");
      setSettledAmounts({});
      fetchData();
    } else {
      const r = await res.json();
      setMsg("❌ " + (r.error || "失败"));
    }
    setSettling(false);
  };

  const quickSettle = async (orderId: string) => {
    const res = await fetch("/api/reconciliation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_ids: [orderId], note: "快速标记已收款" }),
    });
    if (res.ok) fetchData();
  };

  const sourceOptions = [
    { value: "", label: "全部来源" },
    ...Object.entries(ORDER_SOURCE_LABELS).map(([v, l]) => ({ value: v, label: l })),
  ];

  const unsettledOrders = orders.filter(o => !o.is_settled);
  const allSelected = unsettledOrders.length > 0 && selected.size === unsettledOrders.length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">对账核实 / Rapprochement</h1>
          <p className="text-sm text-gray-500 mt-1">
            已结算 {summary?.settled_count || 0} / {summary?.total || 0} 单
            {dateFrom && ` · ${dateFrom}`}{dateTo && ` — ${dateTo}`}
          </p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm bg-white w-[130px]" />
          <span className="text-gray-400 text-sm">—</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm bg-white w-[130px]" />
          <Select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} options={sourceOptions} />
          <Button variant="outline" size="sm" onClick={fetchData}>刷新</Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2"><DollarSign size={18} className="text-green-500" /><span className="text-xs text-gray-500">已结算</span></div>
          <div className="text-2xl font-bold text-green-600">{loading ? "—" : `¥ ${(summary?.settled_revenue || 0).toLocaleString("zh-CN")}`}</div>
          <div className="text-xs text-gray-400 mt-1">{summary?.settled_count || 0} 单</div>
        </div>
        <div className="bg-red-50 rounded-xl border border-red-200 p-4">
          <div className="flex items-center gap-2 mb-2"><TrendingUp size={18} className="text-red-500" /><span className="text-xs text-red-700 font-medium">未结算</span></div>
          <div className="text-2xl font-bold text-red-700">{loading ? "—" : `¥ ${(summary?.unsettled_revenue || 0).toLocaleString("zh-CN")}`}</div>
          <div className="text-xs text-red-500 mt-1">{summary?.unsettled_count || 0} 单</div>
        </div>
        <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
          <div className="flex items-center gap-2 mb-2"><ClipboardCheck size={18} className="text-blue-500" /><span className="text-xs text-blue-700 font-medium">系统总收入</span></div>
          <div className="text-2xl font-bold text-blue-700">{loading ? "—" : `¥ ${(summary?.system_total_revenue || 0).toLocaleString("zh-CN")}`}</div>
          <div className="text-xs text-blue-500 mt-1">{summary?.total || 0} 单</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2"><DollarSign size={18} className="text-orange-500" /><span className="text-xs text-gray-500">未结算应收</span></div>
          <div className="text-2xl font-bold text-orange-600">{loading ? "—" : `¥ ${(summary?.unsettled_revenue || 0).toLocaleString("zh-CN")}`}</div>
          <div className="text-xs text-gray-400 mt-1">待对账金额</div>
        </div>
      </div>

      {/* 本周提醒 */}
      {thisWeekUnsettled.length > 0 && (
        <div className="bg-yellow-50 border-2 border-yellow-400 rounded-xl p-4 flex items-center justify-between">
          <div>
            <span className="text-lg">⚠️</span>
            <span className="ml-2 font-semibold text-yellow-800">
              过去 7 天有 {thisWeekUnsettled.length} 单未结算 / {thisWeekUnsettled.length} non réglée(s) ces 7 jours
            </span>
            <span className="ml-3 text-xl font-bold text-red-600">¥ {thisWeekUnsettledAmt.toLocaleString("zh-CN")}</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => {
            setSelected(new Set(thisWeekUnsettled.map(o => o.id)));
            window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
          }}>
            一键选中近 7 天未结算
          </Button>
        </div>
      )}

      {/* Batch settle bar */}
      {selected.size > 0 && (
        <div className="bg-green-50 border border-green-300 rounded-xl p-4 flex items-end gap-3 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs text-gray-600 mb-1">已选 {selected.size} 单 · 结算备注</label>
            <input type="text" value={settleNote} onChange={e => setSettleNote(e.target.value)}
              placeholder="例如: 中介张三 6月第3周结算"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <Button variant="primary" onClick={handleSettle} loading={settling}>
            <CheckSquare size={18} className="mr-1" />批量标记已结算
          </Button>
          <Button variant="ghost" onClick={() => { setSelected(new Set()); setSettleNote(""); }}>取消</Button>
        </div>
      )}
      {msg && <p className={`text-sm ${msg.startsWith("✅") ? "text-green-600" : "text-red-600"} font-medium`}>{msg}</p>}

      {/* Orders table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b sticky top-0">
              <tr>
                <th className="px-3 py-3 w-10">
                  <button onClick={toggleAll} className="text-gray-400 hover:text-blue-600">
                    {allSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                  </button>
                </th>
                <th className="px-3 py-2 text-left">订单号</th>
                <th className="px-3 py-2 text-left hidden sm:table-cell">来源</th>
                <th className="px-3 py-2 text-right">金额(万)</th>
                <th className="px-3 py-2 text-right hidden md:table-cell">系统收入</th>
                <th className="px-3 py-2 text-right">实收金额</th>
                <th className="px-3 py-2 text-left hidden lg:table-cell">完成时间</th>
                <th className="px-3 py-2 text-center">结算状态</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">加载中... / Chargement...</td></tr>
              ) : orders.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">暂无数据 / Aucune donnée</td></tr>
              ) : (
                orders.map((o) => (
                  <tr key={o.id} className={`hover:bg-gray-50 ${o.is_settled ? "bg-gray-50/50" : "bg-red-50/30"}`}>
                    <td className="px-3 py-2">
                      <button onClick={() => !o.is_settled && toggleSelect(o.id)}
                        className={`${o.is_settled ? "text-gray-300 cursor-default" : "text-gray-400 hover:text-blue-600"}`}>
                        {o.is_settled ? <CheckSquare size={18} /> : selected.has(o.id) ? <CheckSquare size={18} className="text-blue-600" /> : <Square size={18} />}
                      </button>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs font-medium">{o.order_code}</td>
                    <td className="px-3 py-2 text-xs text-gray-500 hidden sm:table-cell">
                      {ORDER_SOURCE_LABELS[o.order_source as OrderSource] || o.order_source}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{(o.order_amount || 0).toLocaleString("zh-CN")}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-green-600 hidden md:table-cell">
                      ¥ {(o.order_revenue || 0).toLocaleString("zh-CN")}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {o.is_settled ? (
                        <span className="font-mono text-xs font-medium">
                          ¥ {(o.settled_amount || o.order_revenue || 0).toLocaleString("zh-CN")}
                        </span>
                      ) : (
                        <input type="number"
                          value={settledAmounts[o.id] || ""}
                          onChange={e => {
                            const next = { ...settledAmounts };
                            if (e.target.value) next[o.id] = e.target.value; else delete next[o.id];
                            setSettledAmounts(next);
                          }}
                          onClick={() => toggleSelect(o.id)}
                          placeholder={String(o.order_revenue || 0)}
                          className="w-[80px] rounded border border-gray-300 px-1 py-0.5 text-xs text-right font-mono" />
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500 hidden lg:table-cell">
                      {formatDateTime(o.actual_completed_at || "")}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {o.is_settled ? (
                        <Badge variant="green">已结算</Badge>
                      ) : (
                        <div className="flex items-center gap-1">
                          <Badge variant="red">未结算</Badge>
                          <button onClick={() => quickSettle(o.id)}
                            className="text-xs text-blue-500 hover:text-blue-700 underline whitespace-nowrap">已收款</button>
                        </div>
                      )}
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
