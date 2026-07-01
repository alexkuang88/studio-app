// GET /api/reconciliation — 对账列表
// POST /api/reconciliation — 批量结算

import { createServerSupabase } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const source = searchParams.get("source");

  let query = supabase
    .from("orders")
    .select("*")
    .in("status", ["completed"])
    .order("order_code", { ascending: true })
    .limit(1000);

  if (source) query = query.eq("order_source", source);
  if (from) query = query.gte("actual_completed_at", `${from}T00:00:00+03:00`);
  if (to) query = query.lte("actual_completed_at", `${to}T23:59:59+03:00`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const orders = (data || []).map((o: any) => ({
    ...o,
    order_amount: o.order_amount ?? ((o.target_amount || 0) - (o.initial_balance || 0)),
    order_revenue: o.order_revenue || 0,
  })).filter((o: any) => (o.order_amount || 0) > 0);

  // 未结算的排前面，已结算的排后面
  orders.sort((a: any, b: any) => {
    if (a.is_settled !== b.is_settled) return a.is_settled ? 1 : -1;
    return (a.order_code || "").localeCompare(b.order_code || "");
  });

  const settled = orders.filter((o: any) => o.is_settled);
  const unsettled = orders.filter((o: any) => !o.is_settled);

  return NextResponse.json({
    orders,
    summary: {
      total: orders.length,
      settled_count: settled.length,
      unsettled_count: unsettled.length,
      settled_revenue: settled.reduce((s: number, o: any) => s + (o.settled_amount || o.order_revenue || 0), 0),
      unsettled_revenue: unsettled.reduce((s: number, o: any) => s + (o.order_revenue || 0), 0),
      system_total_revenue: orders.reduce((s: number, o: any) => s + (o.order_revenue || 0), 0),
    },
  });
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { order_ids, note, settled_amounts } = body; // order_ids: string[], settled_amounts?: Record<string,string>

  if (!order_ids || !Array.isArray(order_ids) || order_ids.length === 0) {
    return NextResponse.json({ error: "请选择至少一个订单" }, { status: 400 });
  }

  const settledAt = new Date().toISOString();
  const updates = order_ids.map((id: string) => {
    const amt = settled_amounts?.[id] ? parseFloat(settled_amounts[id]) : null;
    return supabase
      .from("orders")
      .update({
        is_settled: true,
        settled_amount: amt != null && !isNaN(amt) ? amt : null,
        settled_at: settledAt,
        settled_note: note || null,
      })
      .eq("id", id);
  });

  await Promise.all(updates);

  await supabase.from("audit_logs").insert({
    user_id: userData.user.id,
    action: "update",
    table_name: "orders",
    after_data: { type: "settlement", order_ids, note, settled_at: settledAt } as any,
  });

  return NextResponse.json({ settled: true, count: order_ids.length });
}
