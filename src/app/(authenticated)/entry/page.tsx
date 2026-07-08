"use client";

import { useLocale } from "@/lib/i18n/LocaleContext";
import { useAuth } from "@/lib/hooks/useAuth";
import Link from "next/link";
import { ShoppingCart, PlaySquare, UserCheck, CheckCircle, MonitorCheck, DollarSign, Clock } from "lucide-react";

export default function EntryPage() {
  const { t } = useLocale();
  const { profile } = useAuth();
  const role = profile?.role || "operator";
  const isRecorder = role === "recorder";

  const entryActions = [
    { href: "/orders/new", label: t("entry.new_order"), desc: t("entry.new_order_desc"), icon: ShoppingCart, color: "bg-blue-500 hover:bg-blue-600" },
    { href: "/entry/start-session", label: t("entry.start_session"), desc: t("entry.start_session_desc"), icon: PlaySquare, color: "bg-green-500 hover:bg-green-600" },
    { href: "/entry/handover", label: t("entry.handover"), desc: t("entry.handover_desc"), icon: UserCheck, color: "bg-orange-500 hover:bg-orange-600" },
    { href: "/entry/complete-order", label: t("entry.complete_order"), desc: t("entry.complete_order_desc"), icon: CheckCircle, color: "bg-purple-500 hover:bg-purple-600" },
    { href: "/machines/dashboard", label: t("entry.dashboard"), desc: t("entry.dashboard_desc"), icon: MonitorCheck, color: "bg-teal-500 hover:bg-teal-600" },
    { href: "/entry/checkpoint", label: t("entry.checkpoint"), desc: t("entry.checkpoint_desc"), icon: Clock, color: "bg-cyan-500 hover:bg-cyan-600" },
    ...(isRecorder ? [] : [{ href: "/salary", label: t("nav.salary"), desc: "查看员工月成绩和工资统计", icon: DollarSign, color: "bg-indigo-500 hover:bg-indigo-600" }]),
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t("entry.title")}</h1>
        <p className="text-gray-500 mt-1">{t("entry.desc")}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {entryActions.map((action) => {
          const Icon = action.icon;
          return (
            <Link key={action.href} href={action.href}>
              <button className={`w-full flex items-start gap-4 p-6 rounded-xl text-white transition-all duration-200 hover:scale-[1.02] hover:shadow-lg text-left ${action.color}`}>
                <div className="mt-1"><Icon size={36} /></div>
                <div>
                  <h3 className="text-lg font-bold">{action.label}</h3>
                  <p className="text-sm opacity-90 mt-1">{action.desc}</p>
                </div>
              </button>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
