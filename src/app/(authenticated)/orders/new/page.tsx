"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { createClient } from "@/lib/supabase/client";
import {
  ORDER_SOURCE_LABELS,
  type OrderSource,
} from "@/lib/types/database";
import { nowDatetimeLocal, mgDatetimeToUTC } from "@/lib/utils/time-utils";
import { ArrowLeft, Save } from "lucide-react";
import Link from "next/link";

function generateNextCode(latest: string | null): string {
  if (!latest) return "P001";
  const match = latest.match(/P(\d+)/i);
  if (!match) return "P001";
  const num = parseInt(match[1]) + 1;
  return "P" + String(num).padStart(3, "0");
}

function defaultExpectedTime(): string {
  return calcExpectedTime(0);
}

function calcExpectedTime(orderAmount: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const mg = new Date(Date.now() + 3 * 3600000);
  const hours = orderAmount > 0 ? Math.ceil(orderAmount / 100) : 24;
  mg.setUTCHours(mg.getUTCHours() + hours);
  return `${mg.getUTCFullYear()}-${pad(mg.getUTCMonth()+1)}-${pad(mg.getUTCDate())}T${pad(mg.getUTCHours())}:${pad(mg.getUTCMinutes())}`;
}

export default function NewOrderPage() {
  const router = useRouter();
  const supabase = createClient();
  const [autoCode, setAutoCode] = useState("P001");
  const [order, setOrder] = useState({
    order_code: "",
    order_source: "" as OrderSource | "",
    client_note: "",
    initial_balance: "",
    target_amount: "",
    unit_price: "",
    order_received_at: nowDatetimeLocal(),
    expected_completion_at: defaultExpectedTime(),
    responsible_user: "",
    note: "",
  });
  const [saving, setSaving] = useState(false);
  const [manualTime, setManualTime] = useState(false);

  // 自动计算结单时间（100万/小时），用户手动修改后不再自动覆盖
  const expectedTime = useMemo(() => {
    if (manualTime) return order.expected_completion_at;
    const amt = parseFloat(order.target_amount) || 0;
    return amt > 0 ? calcExpectedTime(amt) : order.expected_completion_at;
  }, [order.target_amount, manualTime]);
  const [error, setError] = useState("");

  // 自动获取最新订单号并生成下一个
  useEffect(() => {
    supabase
      .from("orders")
      .select("order_code")
      .order("created_at", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        const latest = (data && data.length > 0)
          ? (data[0] as { order_code: string }).order_code
          : null;
        const next = generateNextCode(latest);
        setAutoCode(next);
        setOrder((prev) => ({ ...prev, order_code: next }));
      });
  }, []);

  // 自动计算完成余额 = 当前余额 + 目标金额
  const finalBalance = useMemo(() => {
    const bal = parseFloat(order.initial_balance) || 0;
    const target = parseFloat(order.target_amount) || 0;
    return bal + target;
  }, [order.initial_balance, order.target_amount]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const initBal = parseFloat(order.initial_balance) || 0;

    // 防呆：余额超过 2000 万弹确认
    if (initBal > 2000) {
      if (!confirm(`⚠️ 手机当前余额 ${initBal.toLocaleString("zh-CN")} 万，确认正确吗？\n\n请核实手机实际余额！`)) {
        return;
      }
    }

    if (!order.order_source || !order.target_amount) {
      setError("请填写必填项：来源、客户要打金额");
      return;
    }
    if (!order.expected_completion_at) {
      setError("请选择要求完成时间");
      return;
    }

    setSaving(true);
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        order_code: order.order_code.trim(),
        order_source: order.order_source,
        client_note: order.client_note || null,
        initial_balance: parseFloat(order.initial_balance) || 0,
        target_amount: finalBalance,
        unit_price: parseFloat(order.unit_price) || 0,
        order_received_at: mgDatetimeToUTC(order.order_received_at),
        expected_completion_at: mgDatetimeToUTC(expectedTime),
        responsible_user: order.responsible_user || null,
        note: order.note || null,
      }),
    });

    if (!res.ok) {
      const result = await res.json();
      setError(result.error || "创建失败");
      setSaving(false);
      return;
    }

    const data = await res.json();
    router.push(`/orders/${data.id}`);
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div className="flex items-center gap-4">
        <Link href="/orders">
          <Button variant="ghost" size="sm">
            <ArrowLeft size={18} />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            新建订单 / Nouvelle commande
          </h1>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

        <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 flex items-center gap-3">
          <span className="text-sm text-gray-500">订单号:</span>
          <span className="text-xl font-mono font-bold text-gray-900">{autoCode}</span>
          <span className="text-xs text-gray-400 ml-auto">自动生成 / Auto-généré</span>
        </div>

        <Select
          label="订单来源 / Source *"
          value={order.order_source}
          onChange={(e) => setOrder({ ...order, order_source: e.target.value as OrderSource })}
          options={Object.entries(ORDER_SOURCE_LABELS).map(([v, l]) => ({
            value: v,
            label: l,
          }))}
          placeholder="请选择来源..."
          required
        />

        <Input
          label="客户备注 / Note client"
          value={order.client_note}
          onChange={(e) => setOrder({ ...order, client_note: e.target.value })}
          placeholder="客户名称或其他信息"
        />

        {/* 金额计算区域 */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-4">
          <h3 className="font-semibold text-blue-900 text-sm">
            金额设置 / Paramètres de montant
          </h3>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="手机当前余额 / Solde actuel"
              type="number"
              value={order.initial_balance}
              onChange={(e) => setOrder({ ...order, initial_balance: e.target.value })}
              placeholder="0"
            />
            <Input
              label="客户要打金额 / Montant à produire *"
              type="number"
              value={order.target_amount}
              onChange={(e) => setOrder({ ...order, target_amount: e.target.value })}
              placeholder="5000"
              required
            />
          </div>

          {/* 自动计算结果 */}
          <div className="bg-white rounded-lg p-4 border border-blue-200">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-gray-500">当前余额</div>
                <div className="text-lg font-mono font-bold">
                  {(parseFloat(order.initial_balance) || 0).toLocaleString("zh-CN")} 万
                </div>
              </div>
              <div className="text-2xl text-gray-400">+</div>
              <div>
                <div className="text-xs text-gray-500">客户要打</div>
                <div className="text-lg font-mono font-bold text-blue-600">
                  {(parseFloat(order.target_amount) || 0).toLocaleString("zh-CN")} 万
                </div>
              </div>
              <div className="text-2xl text-gray-400">=</div>
              <div>
                <div className="text-xs text-green-600 font-semibold">完成余额 / Solde final</div>
                <div className="text-2xl font-mono font-bold text-green-600">
                  {finalBalance.toLocaleString("zh-CN")} 万
                </div>
              </div>
            </div>
            <p className="text-xs text-blue-600 mt-2">
              💡 订单完成后，手机余额应达到 <strong>{finalBalance.toLocaleString("zh-CN")} 万</strong>
            </p>
          </div>

          {/* 订单收入 */}
          <div className="border-t pt-3">
            <h3 className="font-semibold text-gray-800 mb-2">订单收入</h3>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">客单价（元/100万）</label>
                <input
                  type="number"
                  value={order.unit_price}
                  onChange={(e) => setOrder({ ...order, unit_price: e.target.value })}
                  placeholder="例如: 20"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="text-lg text-gray-400 pb-2">×</div>
              <div className="flex-1 text-center">
                <div className="text-xs text-gray-500 mb-1">订单金额</div>
                <div className="text-lg font-mono font-bold">
                  {(parseFloat(order.target_amount) || 0).toLocaleString("zh-CN")} 万
                </div>
              </div>
              <div className="text-lg text-gray-400 pb-2">=</div>
              <div className="flex-1 text-center">
                <div className="text-xs text-green-600 font-semibold mb-1">预计收入</div>
                <div className="text-2xl font-mono font-bold text-green-600">
                  ¥ {order.unit_price
                    ? ((parseFloat(order.target_amount) || 0) / 100 * parseFloat(order.unit_price)).toLocaleString("zh-CN", {minimumFractionDigits: 0, maximumFractionDigits: 0})
                    : "—"}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="下单时间 / Heure de commande"
            type="datetime-local"
            value={order.order_received_at}
            onChange={(e) =>
              setOrder({ ...order, order_received_at: e.target.value })
            }
          />
          <Input
            label={`要求完成时间 / Heure limite * (≈${Math.ceil((parseFloat(order.target_amount) || 0) / 100)}小时)`}
            type="datetime-local"
            value={expectedTime}
            onChange={(e) => {
              setManualTime(true);
              setOrder({ ...order, expected_completion_at: e.target.value });
            }}
            required
          />
        </div>

        <Input
          label="负责人 / Responsable"
          value={order.responsible_user}
          onChange={(e) =>
            setOrder({ ...order, responsible_user: e.target.value })
          }
          placeholder="负责人姓名"
        />

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            备注 / Note
          </label>
          <textarea
            value={order.note}
            onChange={(e) => setOrder({ ...order, note: e.target.value })}
            rows={3}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="订单备注信息..."
          />
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="submit" variant="primary" size="lg" loading={saving}>
            <Save size={18} className="mr-1" />
            创建订单 / Créer
          </Button>
          <Link href="/orders">
            <Button type="button" variant="ghost" size="lg">
              取消 / Annuler
            </Button>
          </Link>
        </div>
      </form>
    </div>
  );
}
