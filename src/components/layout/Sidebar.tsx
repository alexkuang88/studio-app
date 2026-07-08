"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  LayoutDashboard,
  Users,
  Monitor,
  MonitorCheck,
  ShoppingCart,
  ClipboardList,
  DollarSign,
  FileText,
  Settings,
  LogOut,
  Menu,
  X,
  PlaySquare,
  UserCheck,
  CheckCircle,
  BarChart3,
  ClipboardCheck,
  Clock,
} from "lucide-react";
import { useState } from "react";

// 菜单项定义
const menuItems = [
  {
    href: "/",
    label: "首页 / Accueil",
    icon: LayoutDashboard,
    roles: ["admin", "operator", "recorder"],
  },
  {
    href: "/employees",
    label: "员工管理 / Employés",
    icon: Users,
    roles: ["admin", "operator", "recorder"],
  },
  {
    href: "/machines",
    label: "设备管理 / Machines",
    icon: Monitor,
    roles: ["admin", "operator", "recorder"],
  },
  {
    href: "/machines/dashboard",
    label: "设备现场看板 / Tableau machines",
    icon: MonitorCheck,
    roles: ["admin", "operator", "recorder"],
  },
  {
    href: "/attendance",
    label: "每日考勤 / Présence",
    icon: Clock,
    roles: ["admin", "operator", "recorder"],
  },
  {
    href: "/orders",
    label: "订单管理 / Commandes",
    icon: ShoppingCart,
    roles: ["admin", "operator", "recorder"],
  },
  {
    href: "/entry",
    label: "现场录入 / Saisie",
    icon: ClipboardList,
    roles: ["admin", "operator", "recorder"],
    subItems: [
      {
        href: "/entry/start-session",
        label: "开始打单 / Démarrer",
        icon: PlaySquare,
      },
      {
        href: "/entry/handover",
        label: "换人交接 / Relève",
        icon: UserCheck,
      },
      {
        href: "/entry/complete-order",
        label: "完成订单 / Terminer",
        icon: CheckCircle,
      },
      {
        href: "/entry/checkpoint",
        label: "每日打卡 / Checkpoint",
        icon: Clock,
      },
    ],
  },
  {
    href: "/salary",
    label: "工资统计 / Salaire",
    icon: DollarSign,
    roles: ["admin", "operator"],
  },
  {
    href: "/revenue",
    label: "订单收入",
    icon: BarChart3,
    roles: ["admin", "operator"],
  },
  {
    href: "/reconciliation",
    label: "对账核实 / Rapprochement",
    icon: ClipboardCheck,
    roles: ["admin", "operator"],
  },
  {
    href: "/audit-logs",
    label: "操作日志 / Journal",
    icon: FileText,
    roles: ["admin"],
  },
  {
    href: "/settings",
    label: "系统设置 / Paramètres",
    icon: Settings,
    roles: ["admin"],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { profile, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const role = profile?.role || "operator";

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="fixed top-3 left-3 z-50 lg:hidden bg-white rounded-lg shadow p-2"
      >
        {mobileOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 z-40 h-full w-64 bg-gray-900 text-white
          transform transition-transform duration-200 ease-in-out
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
          lg:translate-x-0 lg:static lg:z-auto
        `}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-700">
          <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center font-bold text-white">
            S
          </div>
          <div>
            <h1 className="text-lg font-bold">Studio Manager</h1>
            <p className="text-xs text-gray-400">
              {profile?.name} — {role === "admin" ? "Admin" : "Operator"}
            </p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex flex-col flex-1 px-3 py-4 overflow-y-auto">
          {menuItems.map((item) => {
            // 检查角色权限
            if (!item.roles.includes(role)) return null;

            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;

            return (
              <div key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`
                    flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1
                    transition-colors duration-150
                    ${isActive ? "bg-blue-600 text-white" : "text-gray-300 hover:bg-gray-800 hover:text-white"}
                  `}
                >
                  <Icon size={20} />
                  <span className="text-sm font-medium">{item.label}</span>
                </Link>

                {/* Sub-items (for Entry menu) */}
                {item.subItems && isActive && (
                  <div className="ml-6 mb-1 border-l-2 border-gray-700 pl-3">
                    {item.subItems.map((sub) => {
                      const SubIcon = sub.icon;
                      const isSubActive = pathname === sub.href;
                      return (
                        <Link
                          key={sub.href}
                          href={sub.href}
                          onClick={() => setMobileOpen(false)}
                          className={`
                            flex items-center gap-2 px-3 py-2 rounded-lg text-sm
                            transition-colors duration-150
                            ${isSubActive ? "text-blue-400 font-medium" : "text-gray-400 hover:text-white"}
                          `}
                        >
                          <SubIcon size={16} />
                          {sub.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* Sign out */}
          <button
            onClick={() => signOut()}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg mt-auto text-gray-400 hover:bg-red-900/50 hover:text-red-400 transition-colors duration-150"
          >
            <LogOut size={20} />
            <span className="text-sm font-medium">退出 / Déconnexion</span>
          </button>
        </nav>
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
    </>
  );
}
