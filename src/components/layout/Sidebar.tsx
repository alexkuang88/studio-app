"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/hooks/useAuth";
import { useLocale } from "@/lib/i18n/LocaleContext";
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

// 菜单项定义 - label is a translation key resolved at render time
const menuItems = [
  { href: "/", label: "nav.home", icon: LayoutDashboard, roles: ["admin", "operator", "recorder"] },
  { href: "/employees", label: "nav.employees", icon: Users, roles: ["admin", "operator", "recorder"] },
  { href: "/machines", label: "nav.machines", icon: Monitor, roles: ["admin", "operator", "recorder"] },
  { href: "/machines/dashboard", label: "nav.dashboard", icon: MonitorCheck, roles: ["admin", "operator", "recorder"] },
  { href: "/attendance", label: "nav.attendance", icon: Clock, roles: ["admin", "operator", "recorder"] },
  { href: "/orders", label: "nav.orders", icon: ShoppingCart, roles: ["admin", "operator", "recorder"] },
  { href: "/entry", label: "nav.entry", icon: ClipboardList, roles: ["admin", "operator", "recorder"],
    subItems: [
      { href: "/entry/start-session", label: "nav.start_session", icon: PlaySquare },
      { href: "/entry/handover", label: "nav.handover", icon: UserCheck },
      { href: "/entry/complete-order", label: "nav.complete_order", icon: CheckCircle },
      { href: "/entry/checkpoint", label: "nav.checkpoint", icon: Clock },
    ],
  },
  { href: "/salary", label: "nav.salary", icon: DollarSign, roles: ["admin", "operator"] },
  { href: "/revenue", label: "nav.revenue", icon: BarChart3, roles: ["admin", "operator"] },
  { href: "/reconciliation", label: "nav.reconciliation", icon: ClipboardCheck, roles: ["admin", "operator"] },
  { href: "/audit-logs", label: "操作日志 / Journal", icon: FileText, roles: ["admin"] },
  { href: "/settings", label: "系统设置 / Paramètres", icon: Settings, roles: ["admin"] },
];

export function Sidebar() {
  const pathname = usePathname();
  const { profile, signOut } = useAuth();
  const { t } = useLocale();
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
                  <span className="text-sm font-medium">{t(item.label)}</span>
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
                          {t(sub.label)}
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
            <span className="text-sm font-medium">{t("nav.logout")}</span>
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
