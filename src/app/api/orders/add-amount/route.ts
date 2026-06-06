// POST /api/orders/add-amount — 客户临时加单
import { createServerSupabase } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { order_id, extra_amount, new_expected_at } = body;

  if (!order_id || !extra_amount || extra_amount <= 0) {
    return NextResponse.json({ error: "请输入加单金额" }, { status: 400 });
  }

  const { data: order } = await supabase
    .from("orders").select("*").eq("id", order_id).single();

  if (!order) return NextResponse.json({ error: "订单不存在" }, { status: 404 });
  if (order.status === "completed" || order.status === "cancelled") {
    return NextResponse.json({ error: "订单已完成或已取消，不能加单" }, { status: 409 });
  }

  const extra = parseFloat(String(extra_amount));
  const newOrderAmount = ((order.order_amount as number) || ((order.target_amount as number) || 0) - ((order.initial_balance as number) || 0)) + extra;
  const newTarget = (order.target_amount || 0) + extra;
  const newRevenue = Math.round(newOrderAmount / 100 * ((order.unit_price as number) || 0));

  const updates: Record<string, unknown> = {
    order_amount: newOrderAmount,
    target_amount: newTarget,
    order_revenue: newRevenue,
    updated_at: new Date().toISOString(),
  };
  if (new_expected_at) {
    updates.expected_completion_at = new Date(new_expected_at + "+03:00").toISOString();
  } else {
    // 没填新时间：按金额比例自动延长
    const originalAmount = (order.order_amount as number) || ((order.target_amount as number) || 0) - ((order.initial_balance as number) || 0);
    if (originalAmount > 0 && order.order_received_at && order.expected_completion_at) {
      const ratio = extra / originalAmount;
      const originalDuration = new Date(order.expected_completion_at as string).getTime() - new Date(order.order_received_at as string).getTime();
      const extension = Math.round(originalDuration * ratio);
      const expectedAt = new Date(order.expected_completion_at as string);
      updates.expected_completion_at = new Date(expectedAt.getTime() + extension).toISOString();
    }
  }

  const { data: updated, error } = await supabase
    .from("orders").update(updates).eq("id", order_id).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("audit_logs").insert({
    user_id: userData.user.id, action: "update", table_name: "orders", record_id: order_id,
    before_data: { order_amount: order.order_amount, target_amount: order.target_amount } as any,
    after_data: { type: "add_amount", extra_amount: extra, new_order_amount: newOrderAmount, new_target: newTarget } as any,
  });

  return NextResponse.json({ order: updated, extra_amount: extra, new_order_amount: newOrderAmount });
}
