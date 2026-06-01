// POST /api/work-sessions/complete-order/[orderId] — 完成订单
// 人工点击完成订单，判断按时/超时

import { createServerSupabase } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await context.params;
  const supabase = await createServerSupabase();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { note, force_complete_reason, end_amount } = body || {};

  // 获取订单
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: "订单不存在" }, { status: 404 });
  }

  if (order.status === "completed") {
    return NextResponse.json({ error: "订单已完成" }, { status: 409 });
  }

  if (order.status === "cancelled") {
    return NextResponse.json({ error: "订单已取消" }, { status: 409 });
  }

  // 检查是否有 running work_session
  const { data: runningSession } = await supabase
    .from("work_sessions")
    .select("*")
    .eq("order_id", orderId)
    .eq("status", "running")
    .single();

  const isForceComplete = !!force_complete_reason;
  let completedAmount = order.completed_amount || 0;
  const targetAmount = order.target_amount || 0;
  const initialBalance = order.initial_balance || 0;
  const orderAmount = (order.order_amount as number) ?? (targetAmount - initialBalance);

  // 如果有 running session 且提供了 end_amount，先结算这一棒
  if (runningSession && end_amount != null) {
    const endAmt = parseFloat(String(end_amount));
    const startAmt = parseFloat(String(runningSession.start_amount));

    if (endAmt < startAmt) {
      return NextResponse.json(
        { error: "结束余额不能小于开始余额" },
        { status: 400 }
      );
    }

    const endTime = new Date();
    const startTime = new Date(runningSession.start_time);
    const wHours = Math.round(((endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60)) * 100) / 100;
    const resultAmt = endAmt - startAmt;
    const eff = wHours > 0 ? Math.round((resultAmt / wHours) * 100) / 100 : 0;

    await supabase
      .from("work_sessions")
      .update({
        end_time: endTime.toISOString(),
        end_amount: endAmt,
        result_amount: resultAmt,
        work_hours: wHours,
        efficiency: eff,
        status: "completed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", runningSession.id);

    completedAmount += resultAmt;
  }

  // 如果没有达到订单金额，且不是强制完成
  if (completedAmount < orderAmount && !isForceComplete) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .single();

    if (profile?.role !== "admin" && profile?.role !== "operator") {
      return NextResponse.json(
        {
          error: `还需打${orderAmount - completedAmount}万, 不能强制完成`,
          completed_amount: completedAmount,
          order_amount: orderAmount,
          remaining: orderAmount - completedAmount,
        },
        { status: 400 }
      );
    }
  }

  if (isForceComplete) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .single();

    // Allow both admin and operator to force complete
    if (profile?.role !== "admin" && profile?.role !== "operator") {
      return NextResponse.json(
        { error: "没有权限强制完成订单" },
        { status: 403 }
      );
    }
  }

  const actualCompletedAt = new Date().toISOString();

  // 如果还有未结束的 running session（且未在前一步处理），关闭它
  if (runningSession && end_amount == null) {
    await supabase
      .from("work_sessions")
      .update({
        end_time: actualCompletedAt,
        status: "completed",
        note: "订单完成时自动关闭（未填结束余额）",
        updated_at: new Date().toISOString(),
      })
      .eq("id", runningSession.id);
  }

  // 判断是否客户取消：强制完成且原因含"取消"
  const isCancelled = isForceComplete && (force_complete_reason || "").includes("取消");
  const finalStatus = isCancelled ? "cancelled" : "completed";

  // 完成订单
  const { data: updatedOrder, error: updateError } = await supabase
    .from("orders")
    .update({
      status: finalStatus,
      is_void: isCancelled ? true : false,
      void_reason: isCancelled ? force_complete_reason : null,
      completed_amount: completedAmount,
      actual_completed_at: actualCompletedAt,
      completion_note: note || null,
      force_complete_reason: force_complete_reason || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // 释放设备
  if (order.current_machine_id) {
    await supabase
      .from("machines")
      .update({ status: "available", updated_at: new Date().toISOString() })
      .eq("id", order.current_machine_id);
  }

  // 判断是否按时完成
  const isOnTime =
    new Date(actualCompletedAt) <= new Date(order.expected_completion_at);

  // 记录操作日志
  const action = isForceComplete ? "force_complete" : "complete_order";
  await supabase.from("audit_logs").insert({
    user_id: userData.user.id,
    action,
    table_name: "orders",
    record_id: orderId,
    before_data: order as unknown as Record<string, unknown>,
    after_data: {
      ...updatedOrder,
      is_on_time: isOnTime,
      running_session_closed: !!runningSession,
    } as unknown as Record<string, unknown>,
  });

  return NextResponse.json({
    order: updatedOrder,
    is_on_time: isOnTime,
    completed_amount: completedAmount,
    target_amount: targetAmount,
  });
}
