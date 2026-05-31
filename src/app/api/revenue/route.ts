// GET /api/revenue — 订单收入统计（按日/月，支持日期范围）
import { createServerSupabase } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const groupBy = searchParams.get("group") || "day";
  const dateFrom = searchParams.get("from");
  const dateTo = searchParams.get("to");

  const { data: all } = await supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false });

  const list = (all || []).map((o: any) => ({
    ...o,
    order_amount: o.order_amount ?? ((o.target_amount || 0) - (o.initial_balance || 0)),
    order_revenue: o.order_revenue || 0,
    unit_price: o.unit_price || 0,
  })).filter((o: any) => o.status !== "cancelled" && (o.order_amount || 0) > 0);

  // 日期范围筛选
  const filtered = dateFrom || dateTo ? list.filter((o: any) => {
    const d = new Date(o.created_at).toISOString().slice(0, 10);
    if (dateFrom && d < dateFrom) return false;
    if (dateTo && d > dateTo) return false;
    return true;
  }) : list;

  // Group
  const groups: Record<string, any> = {};
  for (const o of filtered) {
    const d = new Date(o.created_at);
    const key = groupBy === "day" ? d.toISOString().slice(0, 10) : d.toISOString().slice(0, 7);
    if (!groups[key]) groups[key] = { count: 0, completed_count: 0, pending_count: 0, total_revenue: 0, pending_revenue: 0, total_amount: 0 };
    groups[key].count++;
    groups[key].total_amount += o.order_amount || 0;
    if (o.status === "completed") {
      groups[key].completed_count++;
      groups[key].total_revenue += o.order_revenue || 0;
    } else {
      groups[key].pending_count++;
      groups[key].pending_revenue += o.order_revenue || 0;
    }
  }

  const completed = filtered.filter((o: any) => o.status === "completed");
  const pending = filtered.filter((o: any) => o.status !== "completed");
  const totalRevenue = completed.reduce((s: number, o: any) => s + (o.order_revenue || 0), 0);
  const pendingRevenue = pending.reduce((s: number, o: any) => s + (o.order_revenue || 0), 0);
  const totalAmount = completed.reduce((s: number, o: any) => s + (o.order_amount || 0), 0);
  const pendingAmount = pending.reduce((s: number, o: any) => s + (o.order_amount || 0), 0);

  return NextResponse.json({
    group_by: groupBy,
    total_revenue: totalRevenue, pending_revenue: pendingRevenue,
    total_amount: totalAmount, pending_amount: pendingAmount,
    completed_count: completed.length, pending_count: pending.length,
    total_orders: filtered.length,
    periods: Object.entries(groups)
      .map(([key, g]) => ({ period: key, ...g }))
      .sort((a, b) => b.period.localeCompare(a.period)),
  });
}
