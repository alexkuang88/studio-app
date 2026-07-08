"use client";

import { useLocale } from "@/lib/i18n/LocaleContext";
import Link from "next/link";
import { ShoppingCart, PlaySquare, UserCheck, CheckCircle, MonitorCheck, DollarSign, Clock } from "lucide-react";

const entryActions = [
  {
    href: "/orders/new",
    label: "新建订单 / Nouvelle commande",
    desc: "创建新订单，填写来源、目标金额、要求完成时间",
    icon: ShoppingCart,
    color: "bg-blue-500 hover:bg-blue-600",
  },
  {
    href: "/entry/start-session",
    label: "添加打手 / Démarrer une session",
    desc: "选择订单、设备、打手，开始打单记录",
    icon: PlaySquare,
    color: "bg-green-500 hover:bg-green-600",
  },
  {
    href: "/entry/handover",
    label: "换人交接 / Relève",
    desc: "结束当前打手，自动结算成绩，选择接班打手",
    icon: UserCheck,
    color: "bg-orange-500 hover:bg-orange-600",
  },
  {
    href: "/entry/complete-order",
    label: "完成订单 / Terminer la commande",
    desc: "人工确认订单完成，系统判断按时/超时",
    icon: CheckCircle,
    color: "bg-purple-500 hover:bg-purple-600",
  },
  {
    href: "/machines/dashboard",
    label: "设备看板 / Tableau machines",
    desc: "查看每台设备是谁在打、对应哪个订单",
    icon: MonitorCheck,
    color: "bg-teal-500 hover:bg-teal-600",
  },
  {
    href: "/entry/checkpoint",
    label: "每日打卡 / Checkpoint",
    desc: "定时打卡，只分段不换人，填入当前余额即可",
    icon: Clock,
    color: "bg-cyan-500 hover:bg-cyan-600",
  },
  {
    href: "/salary",
    label: "工资统计 / Statistiques salaire",
    desc: "查看员工月成绩和工资统计",
    icon: DollarSign,
    color: "bg-indigo-500 hover:bg-indigo-600",
  },
];

export default function EntryPage() {
  const { t } = useLocale();
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          现场录入 / Saisie sur site
        </h1>
        <p className="text-gray-500 mt-1">
          选择要执行的操作 / Choisissez une action
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {entryActions.map((action) => {
          const Icon = action.icon;
          return (
            <Link key={action.href} href={action.href}>
              <button
                className={`
                  w-full flex items-start gap-4 p-6 rounded-xl text-white
                  transition-all duration-200 hover:scale-[1.02] hover:shadow-lg text-left
                  ${action.color}
                `}
              >
                <div className="mt-1">
                  <Icon size={36} />
                </div>
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
