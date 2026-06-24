// GET /api/admin/order-edit?code=P465 — 获取订单数据
// POST /api/admin/order-edit — 修改订单字段

import { createServerSupabase } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userData.user.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const code = new URL(request.url).searchParams.get("code");
  if (!code) return NextResponse.json({ error: "Missing code" }, { status: 400 });

  const { data, error } = await supabase.from("orders").select("*").ilike("order_code", code).single();
  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ order: data });
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userData.user.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const { order_id, updates } = body;
  if (!order_id || !updates || Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Missing order_id or updates" }, { status: 400 });
  }

  const allowedFields = ["order_amount", "target_amount", "completed_amount", "initial_balance", "unit_price", "order_revenue", "latest_balance", "total_client_amount", "status", "order_source"];

  const filtered: Record<string, any> = {};
  for (const [k, v] of Object.entries(updates)) {
    if (allowedFields.includes(k)) filtered[k] = v;
  }

  filtered.updated_at = new Date().toISOString();

  const { error } = await supabase.from("orders").update(filtered).eq("id", order_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("audit_logs").insert({
    user_id: userData.user.id,
    action: "update",
    table_name: "orders",
    record_id: order_id,
    after_data: { type: "admin_edit", updates: filtered } as any,
  });

  return NextResponse.json({ success: true });
}
