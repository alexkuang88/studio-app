// PATCH /api/work-sessions/[id] — 作废记录
// 必须填写原因，记录操作日志

import { createServerSupabase } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const supabase = await createServerSupabase();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { void_reason } = body;

  if (!void_reason || void_reason.trim().length === 0) {
    return NextResponse.json(
      { error: "作废原因不能为空 / La raison d'annulation est obligatoire" },
      { status: 400 }
    );
  }

  // 获取 session
  const { data: session, error: sessionError } = await supabase
    .from("work_sessions")
    .select("*")
    .eq("id", id)
    .single();

  if (sessionError || !session) {
    return NextResponse.json({ error: "记录不存在 / Session introuvable" }, { status: 404 });
  }

  if (session.status === "void") {
    return NextResponse.json({ error: "该记录已作废" }, { status: 409 });
  }

  if (session.status === "running") {
    return NextResponse.json(
      { error: "进行中的记录不能作废，请先完成交接 / Impossible d'annuler une session en cours" },
      { status: 409 }
    );
  }

  // 检查月份工资是否已锁定
  const endMonth = (session.end_time as string).slice(0, 7);
  const { data: lockData } = await supabase
    .from("salary_locks")
    .select("id")
    .eq("month", endMonth)
    .single();

  if (lockData) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .single();

    if (profile?.role !== "admin") {
      return NextResponse.json(
        { error: `该月份(${endMonth})工资已锁定，无法作废` },
        { status: 403 }
      );
    }
  }

  // 作废 session
  const { data: updated, error: updateError } = await supabase
    .from("work_sessions")
    .update({
      status: "void",
      void_reason,
      voided_by: userData.user.id,
      voided_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // 重新计算订单 completed_amount（该记录不再计入）
  const { data: remainingSessions } = await supabase
    .from("work_sessions")
    .select("result_amount")
    .eq("order_id", session.order_id)
    .eq("status", "completed");

  const newCompletedAmount =
    remainingSessions?.reduce(
      (sum: number, s: { result_amount: number | null }) =>
        sum + (s.result_amount || 0),
      0
    ) || 0;

  // 重算订单状态
  const { data: affectedOrder } = await supabase
    .from("orders")
    .select("order_amount, initial_balance, target_amount, status")
    .eq("id", session.order_id)
    .single();

  const orderAmount = (affectedOrder?.order_amount as number) ?? ((affectedOrder?.target_amount || 0) - (affectedOrder?.initial_balance || 0));
  const newStatus = affectedOrder?.status === "completed" ? "completed"
    : newCompletedAmount >= orderAmount ? "ready_to_complete"
    : newCompletedAmount > 0 ? "in_progress"
    : "not_started";

  await supabase
    .from("orders")
    .update({
      completed_amount: newCompletedAmount,
      status: newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", session.order_id);

  // 记录操作日志
  await supabase.from("audit_logs").insert({
    user_id: userData.user.id,
    action: "void",
    table_name: "work_sessions",
    record_id: id,
    before_data: session as unknown as Record<string, unknown>,
    after_data: updated as unknown as Record<string, unknown>,
  });

  return NextResponse.json({
    ...updated,
    new_order_completed_amount: newCompletedAmount,
  });
}
