"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  ShoppingCart,
  PlaySquare,
  UserCheck,
  CheckCircle,
  MonitorCheck,
  DollarSign,
  PauseCircle,
  AlertTriangle,
  Clock,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";

interface DashboardStats {
  todayNewOrders: number;
  todayCompletedOrders: number;
  inProgressOrders: number;
  inUseMachines: number;
  availableMachines: number;
  nearingDueOrders: number;
  overdueOrders: number;
  todayCompletedAmount: number;
  todayOrderAmount: number;
  pausedOrders: number;
  notStartedOrders: number;
}

export default function DashboardPage() {
  const { profile } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    todayNewOrders: 0,
    todayCompletedOrders: 0,
    inProgressOrders: 0,
    inUseMachines: 0,
    availableMachines: 0,
    nearingDueOrders: 0,
    overdueOrders: 0,
    todayCompletedAmount: 0,
    todayOrderAmount: 0,
    pausedOrders: 0,
    notStartedOrders: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      const supabase = createClient();
      // 马达加斯加今天 (UTC+3)，中国和马达加斯加打开都一样
      const mgToday = new Date(new Date().getTime() + 3 * 3600000).toISOString().slice(0, 10);
      const todayISO = `${mgToday}T00:00:00+03:00`;

      // 今日新增订单
      const { count: todayNew } = await supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .gte("created_at", todayISO);

      // 今日完成订单
      const { count: todayCompleted } = await supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .eq("status", "completed")
        .gte("actual_completed_at", todayISO);

      // 进行中订单
      const { count: inProgress } = await supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .eq("status", "in_progress");

      // 使用中设备
      const { count: inUse } = await supabase
        .from("machines")
        .select("*", { count: "exact", head: true })
        .eq("status", "in_use");

      // 空闲设备
      const { count: available } = await supabase
        .from("machines")
        .select("*", { count: "exact", head: true })
        .eq("status", "available");

      // 超时订单
      const now = new Date().toISOString();
      const { count: overdue } = await supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .in("status", ["in_progress", "ready_to_complete"])
        .lt("expected_completion_at", now);

      // 即将超时订单 (2小时内)
      const warningTime = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
      const { count: nearingDue } = await supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .in("status", ["in_progress", "ready_to_complete"])
        .gte("expected_completion_at", now)
        .lte("expected_completion_at", warningTime);

      // 今日完成金额
      const { data: todaySessions } = await supabase
        .from("work_sessions")
        .select("result_amount")
        .eq("status", "completed")
        .gte("end_time", todayISO);

      const todayAmount =
        todaySessions?.reduce((sum, s) => sum + (s.result_amount || 0), 0) || 0;

      // 今日订单总金额
      const { data: todayOrders } = await supabase
        .from("orders")
        .select("order_amount, target_amount, initial_balance")
        .gte("created_at", todayISO);

      const todayOrderAmount = (todayOrders || []).reduce(
        (sum, o) => sum + ((o.order_amount as number) || ((o.target_amount as number) || 0) - ((o.initial_balance as number) || 0)),
        0
      );

      // 暂停中订单
      const { count: pausedCount } = await supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .eq("status", "paused");

      // 未开始订单（not_started 或 ready_to_complete）
      const { count: notStartedCount } = await supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .in("status", ["not_started", "ready_to_complete"]);

      setStats({
        todayNewOrders: todayNew || 0,
        todayCompletedOrders: todayCompleted || 0,
        inProgressOrders: inProgress || 0,
        inUseMachines: inUse || 0,
        availableMachines: available || 0,
        nearingDueOrders: nearingDue || 0,
        overdueOrders: overdue || 0,
        todayCompletedAmount: todayAmount,
        todayOrderAmount,
        pausedOrders: pausedCount || 0,
        notStartedOrders: notStartedCount || 0,
      });
      setLoading(false);
    }

    fetchStats();
  }, []);

  const quickActions = [
    {
      href: "/orders/new",
      label: "新建订单 / Nouvelle commande",
      icon: ShoppingCart,
      color: "bg-blue-500 hover:bg-blue-600",
    },
    {
      href: "/entry/start-session",
      label: "添加打手 / Démarrer",
      icon: PlaySquare,
      color: "bg-green-500 hover:bg-green-600",
    },
    {
      href: "/entry/handover",
      label: "换人交接 / Relève",
      icon: UserCheck,
      color: "bg-orange-500 hover:bg-orange-600",
    },
    {
      href: "/entry/complete-order",
      label: "完成订单 / Terminer",
      icon: CheckCircle,
      color: "bg-purple-500 hover:bg-purple-600",
    },
    {
      href: "/machines/dashboard",
      label: "设备看板 / Machines",
      icon: MonitorCheck,
      color: "bg-teal-500 hover:bg-teal-600",
    },
    {
      href: "/salary",
      label: "工资统计 / Salaire",
      icon: DollarSign,
      color: "bg-indigo-500 hover:bg-indigo-600",
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page title */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          首页 / Accueil
        </h1>
        <p className="text-gray-500 mt-1">
          欢迎回来 / Bon retour, {profile?.name}
        </p>
      </div>

      {/* Quick actions - big buttons */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {quickActions.map((action) => {
          const Icon = action.icon;
          return (
            <Link key={action.href} href={action.href}>
              <button
                className={`
                  w-full flex flex-col items-center gap-2 p-4 rounded-xl text-white
                  transition-all duration-200 hover:scale-105 hover:shadow-lg
                  ${action.color}
                `}
              >
                <Icon size={28} />
                <span className="text-xs font-medium text-center leading-tight">
                  {action.label}
                </span>
              </button>
            </Link>
          );
        })}
      </div>

      {/* Statistics cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <StatCard
          title="今日新增订单"
          value={stats.todayNewOrders}
          unit="单"
          icon={ShoppingCart}
          loading={loading}
          href="/orders?today=1"
        />
        <StatCard
          title="进行中 / En cours"
          value={stats.inProgressOrders}
          unit="单"
          icon={TrendingUp}
          loading={loading}
          variant="blue"
          href="/orders?status=in_progress"
        />
        <StatCard
          title="暂停中 / En pause"
          value={stats.pausedOrders}
          unit="单"
          icon={PauseCircle}
          loading={loading}
          variant={"orange"}
          href="/orders?status=paused"
        />
        <StatCard
          title="已超时 / En retard"
          value={stats.overdueOrders}
          unit="单"
          icon={Clock}
          loading={loading}
          variant={stats.overdueOrders > 0 ? "red" : "gray"}
          href="/orders?overdue=1"
        />
        <StatCard
          title="今日完成金额"
          value={stats.todayCompletedAmount}
          unit="万"
          icon={CheckCircle}
          loading={loading}
          variant="green"
          href="/orders?status=completed&today=1"
        />
        <StatCard
          title="今日接单总额"
          value={stats.todayOrderAmount}
          unit="万"
          icon={DollarSign}
          loading={loading}
          variant="green"
          href="/orders?today=1"
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard
          title="今日完成订单"
          value={stats.todayCompletedOrders}
          unit="单"
          icon={CheckCircle}
          loading={loading}
          variant="green"
          href="/orders?status=completed&today=1"
        />
        <StatCard
          title="使用中设备 / En utilisation"
          value={stats.inUseMachines}
          unit="台"
          icon={MonitorCheck}
          loading={loading}
          variant="blue"
          href="/machines/dashboard?status=in_use"
        />
        <StatCard
          title="空闲设备 / Disponible"
          value={stats.availableMachines}
          unit="台"
          icon={MonitorCheck}
          loading={loading}
          variant="green"
          href="/machines/dashboard?status=available"
        />
        <StatCard
          title="即将超时 / Bientôt retard"
          value={stats.nearingDueOrders}
          unit="单"
          icon={AlertTriangle}
          loading={loading}
          variant={stats.nearingDueOrders > 0 ? "orange" : "gray"}
          href="/orders?nearing=1"
        />
        <StatCard
          title="未开始订单"
          value={stats.notStartedOrders}
          unit="单"
          icon={ShoppingCart}
          loading={loading}
          variant="gray"
          href="/orders?status=not_started"
        />
      </div>
    </div>
  );
}

// Stats card component
function StatCard({
  title,
  value,
  unit,
  icon: Icon,
  loading,
  variant = "gray",
  href,
}: {
  title: string;
  value: number;
  unit: string;
  icon: React.ElementType;
  loading: boolean;
  variant?: "gray" | "blue" | "green" | "red" | "orange";
  href?: string;
}) {
  const colorMap = {
    gray: "bg-white border-gray-200",
    blue: "bg-blue-50 border-blue-200",
    green: "bg-green-50 border-green-200",
    red: "bg-red-50 border-red-200",
    orange: "bg-orange-50 border-orange-200",
  };

  const textMap = {
    gray: "text-gray-900",
    blue: "text-blue-900",
    green: "text-green-900",
    red: "text-red-900",
    orange: "text-orange-900",
  };

  const subTextMap = {
    gray: "text-gray-500",
    blue: "text-blue-600",
    green: "text-green-600",
    red: "text-red-600",
    orange: "text-orange-600",
  };

  const cardContent = (
    <div className={`rounded-xl border p-4 ${colorMap[variant]} ${href ? "cursor-pointer hover:shadow-md transition-shadow" : ""}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon size={18} className={subTextMap[variant]} />
        <span className={`text-xs font-medium ${subTextMap[variant]}`}>
          {title}
        </span>
      </div>
      {loading ? (
        <div className="h-8 bg-gray-200 rounded animate-pulse w-16" />
      ) : (
        <div className={`text-2xl font-bold ${textMap[variant]}`}>
          {value.toLocaleString("zh-CN")}{" "}
          <span className="text-sm font-normal">{unit}</span>
        </div>
      )}
    </div>
  );

  if (href) {
    return <Link href={href}>{cardContent}</Link>;
  }
  return cardContent;
}
