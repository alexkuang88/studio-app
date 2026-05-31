import { createServerSupabase } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// PUT /api/machines/[id] — 更新设备
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

  if (profile?.role !== "admin" && profile?.role !== "operator") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: beforeData } = await supabase
    .from("machines")
    .select("*")
    .eq("id", id)
    .single();

  const body = await request.json();

  const { data, error } = await supabase
    .from("machines")
    .update({
      machine_code: body.machine_code,
      machine_name: body.machine_name,
      status: body.status,
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

  await supabase.from("audit_logs").insert({
    user_id: userData.user.id,
    action: "update",
    table_name: "machines",
    record_id: id,
    before_data: beforeData as unknown as Record<string, unknown>,
    after_data: data as unknown as Record<string, unknown>,
  });

  return NextResponse.json(data);
}
