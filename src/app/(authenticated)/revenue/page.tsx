"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { RefreshCw, DollarSign, ShoppingCart, BarChart3, Clock } from "lucide-react";

export default function RevenuePage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [groupBy, setGroupBy] = useState<"month" | "day">("day");

  const fetchData = async () => {
    setLoading(true);
    const res = await fetch(`/api/revenue?group=${groupBy}`);
    const result = await res.json();
    setData(result);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [groupBy]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">订单收入</h1>
          <p className="text-sm text-gray-500 mt-1">
            {groupBy === "month" ? "按月" : "按日"} | 共 {data?.total_orders || 0} 单（{data?.completed_count || 0} 已完成 + {data?.pending_count || 0} 进行中）
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant={groupBy === "day" ? "primary" : "outline"} size="sm" onClick={() => setGroupBy("day")}>按日</Button>
          <Button variant={groupBy === "month" ? "primary" : "outline"} size="sm" onClick={() => setGroupBy("month")}>按月</Button>
          <Button variant="outline" size="sm" onClick={fetchData}><RefreshCw size={16} /></Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <ShoppingCart size={18} className="text-purple-500" />
            <span className="text-xs text-gray-500">订单总数</span>
          </div>
          <div className="text-2xl font-bold text-purple-600">{loading ? "—" : (data?.total_orders || 0)}</div>
          <div className="text-xs text-gray-400 mt-1">{data?.completed_count || 0} 已完成 · {data?.pending_count || 0} 进行中</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 size={18} className="text-blue-500" />
            <span className="text-xs text-gray-500">订单金额</span>
          </div>
          <div className="text-2xl font-bold text-blue-600">
            {loading ? "—" : `${((data?.total_amount || 0) + (data?.pending_amount || 0)).toLocaleString("zh-CN")} 万`}
          </div>
          <div className="text-xs text-gray-400 mt-1">已完成 {(data?.total_amount || 0).toLocaleString("zh-CN")} 万</div>
        </div>
        <div className="bg-green-50 rounded-xl border border-green-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign size={18} className="text-green-500" />
            <span className="text-xs text-green-700 font-medium">已确认收入</span>
          </div>
          <div className="text-2xl font-bold text-green-700">
            {loading ? "—" : `¥ ${(data?.total_revenue || 0).toLocaleString("zh-CN")}`}
          </div>
          <div className="text-xs text-green-500 mt-1">{data?.completed_count || 0} 单已完成</div>
        </div>
        <div className="bg-yellow-50 rounded-xl border border-yellow-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock size={18} className="text-yellow-500" />
            <span className="text-xs text-yellow-700 font-medium">待完成收入</span>
          </div>
          <div className="text-2xl font-bold text-yellow-700">
            {loading ? "—" : `¥ ${(data?.pending_revenue || 0).toLocaleString("zh-CN")}`}
          </div>
          <div className="text-xs text-yellow-500 mt-1">{data?.pending_count || 0} 单进行中</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">💰</span>
            <span className="text-xs text-gray-500">潜在收入</span>
          </div>
          <div className="text-2xl font-bold text-gray-800">
            {loading ? "—" : `¥ ${((data?.total_revenue || 0) + (data?.pending_revenue || 0)).toLocaleString("zh-CN")}`}
          </div>
          <div className="text-xs text-gray-400 mt-1">已完成 + 进行中</div>
        </div>
      </div>

      {/* Revenue table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left">{groupBy === "month" ? "月份" : "日期"}</th>
                <th className="px-4 py-3 text-center">总单数</th>
                <th className="px-4 py-3 text-center">已完成</th>
                <th className="px-4 py-3 text-center">进行中</th>
                <th className="px-4 py-3 text-right">订单金额(万)</th>
                <th className="px-4 py-3 text-right">已确认收入</th>
                <th className="px-4 py-3 text-right">待完成收入</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">加载中...</td></tr>
              ) : (data?.periods || []).length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">暂无数据</td></tr>
              ) : (
                (data?.periods || []).map((row: any) => (
                  <tr key={row.period} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">
                      {groupBy === "month"
                        ? `${row.period.slice(0, 4)}年${Number(row.period.slice(5, 7))}月`
                        : `${Number(row.period.slice(5, 7))}月${row.period.slice(8, 10)}日`}
                    </td>
                    <td className="px-4 py-3 text-center font-medium">{row.count}</td>
                    <td className="px-4 py-3 text-center text-green-600">{row.completed_count}</td>
                    <td className="px-4 py-3 text-center text-yellow-600">{row.pending_count}</td>
                    <td className="px-4 py-3 text-right font-mono">{row.total_amount?.toLocaleString("zh-CN")}</td>
                    <td className="px-4 py-3 text-right font-mono text-green-600 font-medium">
                      ¥ {row.total_revenue?.toLocaleString("zh-CN")}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-yellow-600">
                      ¥ {row.pending_revenue?.toLocaleString("zh-CN")}
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
