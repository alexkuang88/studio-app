// POST /api/work-sessions/handover — 换人交接
// 1. 结束旧 work_session (running → completed)
// 2. 更新订单 completed_amount
// 3. 创建新 work_session (running)，自动传递余额和时间

import { createServerSupabase } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const {
    running_session_id,
    end_time,
    end_amount,
    next_employee_id,
    next_machine_id, // 可选，默认原设备
  } = body;

  if (!running_session_id || !end_time || end_amount == null || !next_employee_id) {
    return NextResponse.json(
      { error: "缺少必填参数 / Paramètres obligatoires manquants" },
      { status: 400 }
    );
  }

  // ===== 获取当前 running session =====
  const { data: runningSession, error: sessionError } = await supabase
    .from("work_sessions")
    .select("*")
    .eq("id", running_session_id)
    .eq("status", "running")
    .single();

  if (sessionError || !runningSession) {
    return NextResponse.json(
      { error: "未找到进行中的记录 / Session en cours introuvable" },
      { status: 404 }
    );
  }

  // ===== 防呆校验 =====

  // 1. end_amount 不能小于 start_amount
  if (end_amount < runningSession.start_amount) {
    return NextResponse.json(
      { error: "结束余额不能小于开始余额 / Le solde final ne peut pas être inférieur au solde initial" },
      { status: 400 }
    );
  }

  // 2. end_time 必须晚于 start_time
  if (new Date(end_time) <= new Date(runningSession.start_time)) {
    return NextResponse.json(
      { error: "结束时间必须晚于开始时间 / L'heure de fin doit être postérieure à l'heure de début" },
      { status: 400 }
    );
  }

  // 3. 检查该月份工资是否已锁定（基于结束时间所在月份）
  const endMonth = new Date(end_time).toISOString().slice(0, 7);
  const startMonth = new Date(runningSession.start_time).toISOString().slice(0, 7);
  // 检查开始月份和结束月份
  for (const month of [...new Set([startMonth, endMonth])]) {
    const { data: lockData } = await supabase
      .from("salary_locks")
      .select("id")
      .eq("month", month)
      .single();

    if (lockData) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userData.user.id)
        .single();

      if (profile?.role !== "admin") {
        return NextResponse.json(
          { error: `该月份(${month})工资已锁定，无法修改 / Salaire verrouillé pour ce mois` },
          { status: 403 }
        );
      }
    }
  }

  // 4. 检查接班打手是否已有 running 记录
  const { data: nextEmployeeRunning } = await supabase
    .from("work_sessions")
    .select("id")
    .eq("employee_id", next_employee_id)
    .eq("status", "running")
    .single();

  if (nextEmployeeRunning) {
    return NextResponse.json(
      { error: "接班员工已有进行中的打单记录 / Cet employé a déjà une session en cours" },
      { status: 409 }
    );
  }

  // 计算接班设备
  const nextMachine = next_machine_id || runningSession.machine_id;

  // 检查接班设备是否可用
  if (nextMachine !== runningSession.machine_id) {
    const { data: nextMachineData } = await supabase
      .from("machines")
      .select("status")
      .eq("id", nextMachine)
      .single();

    if (!nextMachineData) {
      return NextResponse.json({ error: "设备不存在 / Machine introuvable" }, { status: 404 });
    }
    if (nextMachineData.status === "repair" || nextMachineData.status === "disabled") {
      return NextResponse.json(
        { error: "接班设备维修或停用中 / Machine en réparation ou désactivée" },
        { status: 409 }
      );
    }
    // 如果换设备，检查新设备是否已有 running
    if (nextMachine !== runningSession.machine_id) {
      const { data: newMachineRunning } = await supabase
        .from("work_sessions")
        .select("id")
        .eq("machine_id", nextMachine)
        .eq("status", "running")
        .single();

      if (newMachineRunning) {
        return NextResponse.json(
          { error: "接班设备已有进行中的记录 / Cette machine a déjà une session en cours" },
          { status: 409 }
        );
      }
    }
  }

  const endTime = new Date(end_time);
  const startTime = new Date(runningSession.start_time);
  const workHours =
    Math.round(
      ((endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60)) * 100
    ) / 100;
  const resultAmount = Math.max(0, end_amount - runningSession.start_amount);
  const efficiency = workHours > 0 ? Math.round((resultAmount / workHours) * 100) / 100 : 0;

  // ===== 1. 结束旧 work_session =====
  const { error: updateError } = await supabase
    .from("work_sessions")
    .update({
      end_time: endTime.toISOString(),
      end_amount,
      result_amount: resultAmount,
      work_hours: workHours,
      efficiency,
      status: "completed",
      updated_at: new Date().toISOString(),
    })
    .eq("id", running_session_id)
    .eq("status", "running");

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // ===== 2. 更新订单 completed_amount =====
  const { data: order } = await supabase
    .from("orders")
    .select("completed_amount, target_amount, initial_balance, order_amount, status")
    .eq("id", runningSession.order_id)
    .single();

  const newCompletedAmount =
    (order?.completed_amount || 0) + resultAmount;
  const orderAmount = (order?.order_amount as number) ?? ((order?.target_amount || 0) - (order?.initial_balance || 0));

  const newOrderStatus =
    newCompletedAmount >= orderAmount ? "ready_to_complete" : "in_progress";

  const { error: orderError } = await supabase
    .from("orders")
    .update({
      completed_amount: newCompletedAmount,
      status: newOrderStatus,
      latest_balance: end_amount,
      current_employee_id: next_employee_id,
      current_machine_id: nextMachine,
      updated_at: new Date().toISOString(),
    })
    .eq("id", runningSession.order_id);

  if (orderError) {
    return NextResponse.json({ error: orderError.message }, { status: 500 });
  }

  // ===== 3. 更新设备状态 =====
  // 如果换了设备，释放旧设备
  if (nextMachine !== runningSession.machine_id) {
    await supabase
      .from("machines")
      .update({ status: "available", updated_at: new Date().toISOString() })
      .eq("id", runningSession.machine_id);
  }

  // 设置新设备为使用中
  await supabase
    .from("machines")
    .update({ status: "in_use", updated_at: new Date().toISOString() })
    .eq("id", nextMachine);

  // ===== 4. 创建新 work_session（接班）=====
  const { data: newSession, error: newSessionError } = await supabase
    .from("work_sessions")
    .insert({
      order_id: runningSession.order_id,
      employee_id: next_employee_id,
      machine_id: nextMachine,
      start_time: endTime.toISOString(), // 自动传递：接班开始时间 = 上一位结束时间
      start_amount: end_amount, // 自动传递：接班开始余额 = 上一位结束余额
      status: "running",
      created_by: userData.user.id,
    })
    .select()
    .single();

  if (newSessionError) {
    return NextResponse.json({ error: newSessionError.message }, { status: 500 });
  }

  // ===== 5. 记录操作日志 =====
  await supabase.from("audit_logs").insert({
    user_id: userData.user.id,
    action: "handover",
    table_name: "work_sessions",
    record_id: running_session_id,
    before_data: runningSession as unknown as Record<string, unknown>,
    after_data: {
      completed: { result_amount: resultAmount, end_time: endTime.toISOString(), end_amount },
      new_session_id: newSession.id,
      next_employee_id,
      next_machine_id: nextMachine,
    } as unknown as Record<string, unknown>,
  });

  return NextResponse.json(
    {
      completed_session: {
        id: running_session_id,
        result_amount: resultAmount,
        work_hours: workHours,
        efficiency,
        status: "completed",
      },
      new_session: newSession,
      order: {
        completed_amount: newCompletedAmount,
        status: newOrderStatus,
        order_amount: orderAmount,
      },
    },
    { status: 200 }
  );
}
