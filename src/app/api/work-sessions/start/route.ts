// POST /api/work-sessions/start — 添加打手 / 开始打单
// 创建一条 status=running 的 work_session

import { createServerSupabase } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { order_id, employee_id, machine_id, start_time, start_amount, balance_gap, gap_reason } = body;

  if (!order_id || !employee_id || !machine_id || !start_time) {
    return NextResponse.json(
      { error: "缺少必填参数 / Paramètres obligatoires manquants" },
      { status: 400 }
    );
  }

  // ===== 防呆校验 =====

  // 1. 检查该订单是否有 running 记录
  const { data: existingOrderSession } = await supabase
    .from("work_sessions")
    .select("id")
    .eq("order_id", order_id)
    .eq("status", "running")
    .single();

  if (existingOrderSession) {
    return NextResponse.json(
      { error: "该订单已有进行中的打单记录 / Cette commande a déjà une session en cours" },
      { status: 409 }
    );
  }

  // 2. 检查该设备是否有 running 记录
  const { data: existingMachineSession } = await supabase
    .from("work_sessions")
    .select("id")
    .eq("machine_id", machine_id)
    .eq("status", "running")
    .single();

  if (existingMachineSession) {
    return NextResponse.json(
      { error: "该设备已有进行中的打单记录 / Cette machine a déjà une session en cours" },
      { status: 409 }
    );
  }

  // 3. 检查该打手是否有 running 记录
  const { data: existingEmployeeSession } = await supabase
    .from("work_sessions")
    .select("id")
    .eq("employee_id", employee_id)
    .eq("status", "running")
    .single();

  if (existingEmployeeSession) {
    return NextResponse.json(
      { error: "该员工已有进行中的打单记录 / Cet employé a déjà une session en cours" },
      { status: 409 }
    );
  }

  // 4. 检查设备状态
  const { data: machine } = await supabase
    .from("machines")
    .select("status, is_active")
    .eq("id", machine_id)
    .single();

  if (!machine) {
    return NextResponse.json({ error: "设备不存在 / Machine introuvable" }, { status: 404 });
  }
  if (machine.status === "repair" || machine.status === "disabled") {
    return NextResponse.json(
      { error: "设备维修或停用中，不可选择 / Machine en réparation ou désactivée" },
      { status: 409 }
    );
  }

  // 5. 检查订单状态
  const { data: order } = await supabase
    .from("orders")
    .select("status")
    .eq("id", order_id)
    .single();

  if (!order) {
    return NextResponse.json({ error: "订单不存在 / Commande introuvable" }, { status: 404 });
  }
  if (order.status === "completed" || order.status === "cancelled") {
    return NextResponse.json(
      { error: "订单已完成或已取消 / Commande terminée ou annulée" },
      { status: 409 }
    );
  }

  // ===== 创建记录（事务性操作）=====

  // 创建 work_session
  const { data: session, error: sessionError } = await supabase
    .from("work_sessions")
    .insert({
      order_id,
      employee_id,
      machine_id,
      start_time: new Date(start_time).toISOString(),
      start_amount,
      balance_gap: balance_gap || 0,
      gap_reason: gap_reason || null,
      note: gap_reason ? `余额变化 ${balance_gap > 0 ? "+" : ""}${balance_gap}万: ${gap_reason}` : null,
      status: "running",
      created_by: userData.user.id,
    })
    .select()
    .single();

  if (sessionError) {
    return NextResponse.json({ error: sessionError.message }, { status: 500 });
  }

  // 如果余额有变化（客户上号），调整订单目标
  if (balance_gap && balance_gap !== 0) {
    const { data: orderData } = await supabase
      .from("orders")
      .select("target_amount, initial_balance, completed_amount, order_amount, total_client_amount")
      .eq("id", order_id)
      .single();

    // 订单金额（纯币）= order_amount 或 target - initial
    const pureOrder = (orderData?.order_amount as number) ?? ((orderData?.target_amount || 0) - (orderData?.initial_balance || 0));
    const completed = (orderData?.completed_amount as number) || 0;

    // 新目标 = 当前余额 + 还需打的纯币
    const newTarget = (start_amount || 0) + pureOrder - completed;
    const newClientTotal = ((orderData?.total_client_amount as number) || 0) + balance_gap;

    await supabase
      .from("orders")
      .update({
        target_amount: newTarget,
        total_client_amount: newClientTotal,
        updated_at: new Date().toISOString(),
      })
      .eq("id", order_id);

    // 记录到 audit_log
    await supabase.from("audit_logs").insert({
      user_id: userData.user.id,
      action: "update",
      table_name: "orders",
      record_id: order_id,
      after_data: {
        type: "client_play",
        balance_gap,
        gap_reason: gap_reason || null,
        old_target: orderData?.target_amount,
        new_target: newTarget,
      } as any,
    });
  }

  // 如果订单是暂停状态，恢复时自动延长期限
  const { data: pausedOrder } = await supabase
    .from("orders")
    .select("paused_at, total_paused_seconds, expected_completion_at, status")
    .eq("id", order_id)
    .single();

  let newExpected = null;
  if (pausedOrder?.status === "paused") {
    const totalAccumulated = (pausedOrder.total_paused_seconds as number) || 0;
    const currentPauseDuration = pausedOrder.paused_at
      ? (Date.now() - new Date(pausedOrder.paused_at as string).getTime()) / 1000
      : 0;
    const totalPaused = totalAccumulated + currentPauseDuration;
    const oldExpected = new Date(pausedOrder.expected_completion_at as string);
    newExpected = new Date(oldExpected.getTime() + totalPaused * 1000);
  }

  // 恢复暂停 / 首次开始：更新订单状态
  // 只有 not_started 或 paused 才改，避免覆盖其他状态
  if ((pausedOrder?.status === "paused") || !pausedOrder || pausedOrder.status === "not_started") {
    await supabase
      .from("orders")
      .update({
        status: "in_progress",
        current_employee_id: employee_id,
        current_machine_id: machine_id,
        ...(newExpected ? { expected_completion_at: newExpected.toISOString() } : {}),
        paused_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", order_id);
  }

  // 更新设备状态
  await supabase
    .from("machines")
    .update({
      status: "in_use",
      updated_at: new Date().toISOString(),
    })
    .eq("id", machine_id);

  // 记录操作日志
  await supabase.from("audit_logs").insert({
    user_id: userData.user.id,
    action: "create",
    table_name: "work_sessions",
    record_id: session.id,
    after_data: session as unknown as Record<string, unknown>,
  });

  return NextResponse.json(session, { status: 201 });
}
