import { createServerSupabase } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// GET /api/employees — 员工列表
export async function GET(request: NextRequest) {
  const supabase = await createServerSupabase();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const activeOnly = searchParams.get("active") !== "false";

  let query = supabase.from("employees").select("*").order("employee_code");

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

// POST /api/employees — 新增员工
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check admin role (allow both admin and operator for MVP)
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .single();

  // For MVP, allow operator to create employees too (现场管理需要)
  // Remove this restriction to let operators create employees

  const body = await request.json();

  // 检查员工编号唯一性
  const { data: existing } = await supabase
    .from("employees")
    .select("id")
    .eq("employee_code", body.employee_code)
    .single();

  if (existing) {
    return NextResponse.json(
      { error: "员工编号已存在 / Code employé déjà existant" },
      { status: 409 }
    );
  }

  const { data, error } = await supabase
    .from("employees")
    .insert({
      employee_code: body.employee_code,
      chinese_name: body.chinese_name,
      local_name: body.local_name || null,
      phone: body.phone || null,
      facebook: body.facebook || null,
      status: body.status || "training",
      can_take_order: body.can_take_order ?? false,
      note: body.note || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 记录操作日志
  await supabase.from("audit_logs").insert({
    user_id: userData.user.id,
    action: "create",
    table_name: "employees",
    record_id: data.id,
    after_data: data as unknown as Record<string, unknown>,
    ip_address: request.headers.get("x-forwarded-for") || null,
    user_agent: request.headers.get("user-agent") || null,
  });

  return NextResponse.json(data, { status: 201 });
}
