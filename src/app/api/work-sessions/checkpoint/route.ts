// POST /api/work-sessions/checkpoint — 每日打卡（同人交接，只分段不换人）
import { createServerSupabase } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { running_session_id, end_amount } = body;

  if (!running_session_id || end_amount == null) {
    return NextResponse.json({ error: "缺少参数" }, { status: 400 });
  }

  const { data: running, error: err } = await supabase
    .from("work_sessions").select("*")
    .eq("id", running_session_id).eq("status", "running").single();

  if (err || !running) {
    return NextResponse.json({ error: "未找到进行中的分段" }, { status: 404 });
  }

  if (end_amount < running.start_amount) {
    return NextResponse.json({ error: "结束余额不能小于开始余额" }, { status: 400 });
  }

  const endTime = new Date();
  const startTime = new Date(running.start_time);
  const workHours = Math.round(((endTime.getTime() - startTime.getTime()) / 3600000) * 100) / 100;
  const resultAmount = Math.max(0, end_amount - running.start_amount);
  const efficiency = workHours > 0 ? Math.round((resultAmount / workHours) * 100) / 100 : 0;

  const { error: closeErr } = await supabase.from("work_sessions").update({
    end_time: endTime.toISOString(), end_amount,
    result_amount: resultAmount, work_hours: workHours, efficiency,
    status: "completed", updated_at: new Date().toISOString(),
  }).eq("id", running_session_id).eq("status", "running");

  if (closeErr) return NextResponse.json({ error: closeErr.message }, { status: 500 });

  const { data: order } = await supabase.from("orders")
    .select("completed_amount, target_amount, initial_balance, order_amount")
    .eq("id", running.order_id).single();

  const newCompleted = (order?.completed_amount || 0) + resultAmount;
  const orderAmount = order?.order_amount ?? ((order?.target_amount || 0) - (order?.initial_balance || 0));
  const newStatus = newCompleted >= orderAmount ? "ready_to_complete" : "in_progress";

  await supabase.from("orders").update({
    completed_amount: newCompleted, status: newStatus,
    latest_balance: end_amount, updated_at: new Date().toISOString(),
  }).eq("id", running.order_id);

  const { data: newSession, error: newErr } = await supabase.from("work_sessions").insert({
    order_id: running.order_id, employee_id: running.employee_id,
    machine_id: running.machine_id, start_time: endTime.toISOString(),
    start_amount: end_amount, status: "running", created_by: userData.user.id,
  }).select("*, employees(employee_code, chinese_name), machines(machine_code)").single();

  if (newErr) return NextResponse.json({ error: newErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, closed: { id: running.id, result_amount: resultAmount, work_hours: workHours }, new_session: newSession });
}
