// GET /api/employees/[id]/advances — 预支列表
// POST /api/employees/[id]/advances — 新增预支

import { createServerSupabase } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const supabase = await createServerSupabase();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const month = new URL(request.url).searchParams.get("month") || "";

  let query = supabase.from("salary_advances").select("*").eq("employee_id", id).order("created_at", { ascending: false }).limit(50);
  if (month) query = query.eq("month", month);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const total = (data || []).reduce((s: number, a: any) => s + (a.amount || 0), 0);
  return NextResponse.json({ advances: data || [], total });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const supabase = await createServerSupabase();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { amount, month, note } = body;

  if (!amount || amount <= 0 || !month) {
    return NextResponse.json({ error: "请填写金额和月份" }, { status: 400 });
  }

  const { data, error } = await supabase.from("salary_advances").insert({
    employee_id: id,
    amount: Math.round(amount),
    month,
    note: note || null,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
