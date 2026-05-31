import { createServerSupabase } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// GET /api/employees/[id] — 员工详情
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

  const { data, error } = await supabase
    .from("employees")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  return NextResponse.json(data);
}

// PUT /api/employees/[id] — 更新员工
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

  // Check admin role
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .single();

  if (profile?.role !== "admin" && profile?.role !== "operator") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Get before data for audit log
  const { data: beforeData } = await supabase
    .from("employees")
    .select("*")
    .eq("id", id)
    .single();

  const body = await request.json();

  const { data, error } = await supabase
    .from("employees")
    .update({
      employee_code: body.employee_code,
      chinese_name: body.chinese_name,
      local_name: body.local_name,
      phone: body.phone,
      facebook: body.facebook,
      status: body.status,
      can_take_order: body.can_take_order,
      note: body.note,
      is_active: body.is_active,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 记录操作日志
  await supabase.from("audit_logs").insert({
    user_id: userData.user.id,
    action: "update",
    table_name: "employees",
    record_id: id,
    before_data: beforeData as unknown as Record<string, unknown>,
    after_data: data as unknown as Record<string, unknown>,
    ip_address: request.headers.get("x-forwarded-for") || null,
    user_agent: request.headers.get("user-agent") || null,
  });

  return NextResponse.json(data);
}
