"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { createClient } from "@/lib/supabase/client";
import { Save } from "lucide-react";

export default function SettingsPage() {
  const [settings, setSettings] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    supabase
      .from("settings")
      .select("*")
      .order("key")
      .then(({ data }) => {
        setSettings((data as Record<string, unknown>[]) || []);
        setLoading(false);
      });
  }, []);

  const handleSave = async (key: string, value: string) => {
    setSavingKey(key);
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
    setSavingKey(null);
  };

  const updateValue = (key: string, newValue: string) => {
    setSettings((prev) =>
      prev.map((s) => (s.key === key ? { ...s, value: newValue } : s))
    );
  };

  if (loading) {
    return <div className="text-center py-12 text-gray-500">加载中...</div>;
  }

  const settingDescriptions: Record<string, string> = {
    salary_rate: "工资单价 (Ar / 100万) [旧]",
    salary_rate_base: "基础工资单价（日产量<阈值）Ar/100万",
    salary_rate_premium: "高级工资单价（日产量>=阈值）Ar/100万",
    daily_threshold: "日产量阈值（万）",
    tiered_salary_start_date: "阶梯工资生效日期（YYYY-MM-DD）",
    minimum_efficiency: "最低达标效率 (万/小时)",
    advanced_efficiency: "高级效率 (万/小时)",
    warning_hours_before_overdue: "订单超时前提醒时间 (小时)",
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">系统设置 / Paramètres</h1>
        <p className="text-sm text-gray-500 mt-1">仅 Admin 可修改</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
        {settings.map((setting) => (
          <div key={setting.id as string} className="flex items-end gap-4">
            <div className="flex-1">
              <Input
                label={`${settingDescriptions[setting.key as string] || setting.key as string}`}
                value={setting.value as string}
                onChange={(e) => updateValue(setting.key as string, e.target.value)}
              />
              {(setting.description as string) && (
                <p className="text-xs text-gray-400 mt-1">{setting.description as string}</p>
              )}
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={() => handleSave(setting.key as string, setting.value as string)}
              loading={savingKey === setting.key}
            >
              <Save size={16} className="mr-1" />保存
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
