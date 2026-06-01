// POST /api/work-sessions/pause — 暂停订单
// 客户挤号 → 结束当前打单 → 释放打手和设备 → 保留余额

import { createServerSupabase } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { session_id, end_amount, reason } = body;

  if (!session_id || end_amount == null) {
    return NextResponse.json({ error: "缺少参数" }, { status: 400 });
  }

  const { data: session } = await supabase
    .from("work_sessions")
    .select("*")
    .eq("id", session_id)
    .eq("status", "running")
    .single();

  if (!session) {
    return NextResponse.json({ error: "未找到进行中的记录" }, { status: 404 });
  }

  const endAmt = parseFloat(String(end_amount));
  const startAmt = parseFloat(String(session.start_amount));
  if (endAmt < startAmt) {
    return NextResponse.json({ error: "结束余额不能小于开始余额" }, { status: 400 });
  }

  const endTime = new Date();
  const startTime = new Date(session.start_time);
  const wHours = Math.round(((endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60)) * 100) / 100;
  const resultAmt = endAmt - startAmt;
  const eff = wHours > 0 ? Math.round((resultAmt / wHours) * 100) / 100 : 0;

  // 1. Close the session
  await supabase
    .from("work_sessions")
    .update({
      end_time: endTime.toISOString(),
      end_amount: endAmt,
      result_amount: resultAmt,
      work_hours: wHours,
      efficiency: eff,
      status: "completed",
      note: reason ? `暂停: ${reason}` : "暂停 / Pause",
      updated_at: new Date().toISOString(),
    })
    .eq("id", session_id)
    .eq("status", "running");

  // 2. Update order completed_amount
  const { data: order } = await supabase
    .from("orders")
    .select("completed_amount, target_amount, initial_balance, order_amount")
    .eq("id", session.order_id)
    .single();

  const newCompleted = (order?.completed_amount || 0) + resultAmt;
  const orderAmount = (order?.order_amount as number) ?? ((order?.target_amount || 0) - (order?.initial_balance || 0));
  const newStatus = newCompleted >= orderAmount ? "ready_to_complete" : "in_progress";

  await supabase
    .from("orders")
    .update({
      completed_amount: newCompleted,
      status: "paused",
      paused_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", session.order_id);

  // 3. Free the machine
  await supabase
    .from("machines")
    .update({ status: "available", updated_at: new Date().toISOString() })
    .eq("id", session.machine_id);

  // 4. Audit log
  await supabase.from("audit_logs").insert({
    user_id: userData.user.id,
    action: "update",
    table_name: "work_sessions",
    record_id: session_id,
    after_data: { action: "pause", reason, result_amount: resultAmt, end_amount: endAmt } as any,
  });

  return NextResponse.json({
    paused: true,
    result_amount: resultAmt,
    end_amount: endAmt,
    order_completed: newCompleted,
    order_status: newStatus,
  });
}
