import { createServerSupabase } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// GET /api/orders — 订单列表
export async function GET(request: NextRequest) {
  const supabase = await createServerSupabase();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const source = searchParams.get("source");
  const search = searchParams.get("search");
  const limit = parseInt(searchParams.get("limit") || "50");

  let query = supabase
    .from("orders")
    .select(
      "*, employees!orders_current_employee_id_fkey(chinese_name, employee_code), machines!orders_current_machine_id_fkey(machine_code, machine_name)"
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status) {
    query = query.eq("status", status);
  }
  if (source) {
    query = query.eq("order_source", source);
  }
  if (search) {
    query = query.ilike("order_code", `%${search}%`);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// POST /api/orders — 新增订单
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  // 检查订单号唯一性
  const { data: existing } = await supabase
    .from("orders")
    .select("id")
    .eq("order_code", body.order_code)
    .single();

  if (existing) {
    return NextResponse.json(
      { error: "订单号已存在 / Le code de commande existe déjà" },
      { status: 409 }
    );
  }

  const { data, error } = await supabase
    .from("orders")
    .insert({
      order_code: body.order_code,
      order_source: body.order_source,
      client_note: body.client_note || null,
      target_amount: Math.round(body.target_amount),
      initial_balance: body.initial_balance || 0,
      order_amount: Math.max(0, body.target_amount - (body.initial_balance || 0)),
      unit_price: body.unit_price || 0,
      order_revenue: Math.round(Math.max(0, body.target_amount - (body.initial_balance || 0)) / 100 * (body.unit_price || 0)),
      order_received_at: body.order_received_at,
      expected_completion_at: body.expected_completion_at,
      responsible_user: body.responsible_user || null,
      note: body.note || null,
      created_by: userData.user.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase.from("audit_logs").insert({
    user_id: userData.user.id,
    action: "create",
    table_name: "orders",
    record_id: data.id,
    after_data: data as unknown as Record<string, unknown>,
  });

  return NextResponse.json(data, { status: 201 });
}
