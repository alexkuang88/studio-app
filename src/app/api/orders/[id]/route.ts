import { createServerSupabase } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// GET /api/orders/[id] — 订单详情（含 work_sessions 和关联数据）
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const supabase = await createServerSupabase();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 获取订单基本信息
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select(
      "*, employees!orders_current_employee_id_fkey(*), machines!orders_current_machine_id_fkey(*), profiles!orders_created_by_fkey(name)"
    )
    .eq("id", id)
    .single();

  if (orderError) {
    return NextResponse.json({ error: orderError.message }, { status: 404 });
  }

  // 获取所有 work_sessions
  const { data: sessions, error: sessionsError } = await supabase
    .from("work_sessions")
    .select("*, employees(*), machines(*)")
    .eq("order_id", id)
    .order("start_time", { ascending: true });

  if (sessionsError) {
    return NextResponse.json({ error: sessionsError.message }, { status: 500 });
  }

  return NextResponse.json({ ...order, work_sessions: sessions || [] });
}

// PUT /api/orders/[id] — 更新订单（Admin only）
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const supabase = await createServerSupabase();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .single();

  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();

  const { data: beforeData } = await supabase
    .from("orders")
    .select("*")
    .eq("id", id)
    .single();

  const { data, error } = await supabase
    .from("orders")
    .update({
      order_source: body.order_source,
      client_note: body.client_note,
      target_amount: body.target_amount,
      order_received_at: body.order_received_at,
      expected_completion_at: body.expected_completion_at,
      responsible_user: body.responsible_user,
      note: body.note,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase.from("audit_logs").insert({
    user_id: userData.user.id,
    action: "update",
    table_name: "orders",
    record_id: id,
    before_data: beforeData as unknown as Record<string, unknown>,
    after_data: data as unknown as Record<string, unknown>,
  });

  return NextResponse.json(data);
}
