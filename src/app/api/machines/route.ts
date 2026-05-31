import { createServerSupabase } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// GET /api/machines — 设备列表
export async function GET(request: NextRequest) {
  const supabase = await createServerSupabase();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const activeOnly = searchParams.get("active") !== "false";

  let query = supabase.from("machines").select("*").order("machine_code");

  if (status) {
    query = query.eq("status", status);
  }
  if (activeOnly) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// POST /api/machines — 新增设备
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Allow both admin and operator for MVP
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .single();

  const body = await request.json();

  // 检查设备编号唯一性
  const { data: existing } = await supabase
    .from("machines")
    .select("id")
    .eq("machine_code", body.machine_code)
    .single();

  if (existing) {
    return NextResponse.json(
      { error: "设备编号已存在 / Code machine déjà existant" },
      { status: 409 }
    );
  }

  const { data, error } = await supabase
    .from("machines")
    .insert({
      machine_code: body.machine_code,
      machine_name: body.machine_name,
      status: body.status || "available",
      note: body.note || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase.from("audit_logs").insert({
    user_id: userData.user.id,
    action: "create",
    table_name: "machines",
    record_id: data.id,
    after_data: data as unknown as Record<string, unknown>,
  });

  return NextResponse.json(data, { status: 201 });
}
