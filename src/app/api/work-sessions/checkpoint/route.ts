// POST /api/work-sessions/checkpoint — 更新打单进度 / 同打手恢复
import { createServerSupabase } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { session_id, current_balance, order_id, employee_id, balance_gap, gap_reason } = body;

  if (current_balance == null) {
    return NextResponse.json({ error: "缺少参数 / Paramètres manquants" }, { status: 400 });
  }

  // Resolve session: by session_id or by order_id+employee_id
  let session;
  if (session_id) {
    const { data } = await supabase.from("work_sessions").select("*").eq("id", session_id).eq("status", "running").single();
    session = data;
  } else if (order_id && employee_id) {
    const { data } = await supabase.from("work_sessions").select("*").eq("order_id", order_id).eq("employee_id", employee_id).eq("status", "running").single();
    session = data;
  }

  if (!session) {
    return NextResponse.json({ error: "未找到进行中的记录 / Session introuvable" }, { status: 404 });
  }

  const balance = parseFloat(String(current_balance));
  if (balance < (session.start_amount as number)) {
    return NextResponse.json({ error: "当前余额不能小于开始余额" }, { status: 400 });
  }

  const now = new Date();
  const hoursSinceStart = (now.getTime() - new Date(session.start_time).getTime()) / (1000 * 60 * 60);
  const earnedSoFar = balance - (session.start_amount as number);
  const currentEfficiency = hoursSinceStart > 0 ? Math.round((earnedSoFar / hoursSinceStart) * 100) / 100 : 0;

  // Handle balance gap (client play while disconnected)
  if (balance_gap && balance_gap !== 0) {
    const { data: ord } = await supabase.from("orders")
      .select("target_amount, initial_balance, completed_amount, order_amount, total_client_amount")
      .eq("id", session.order_id).single();
    if (ord) {
      const pureOrder = (ord.order_amount as number) ?? ((ord.target_amount as number) || 0) - ((ord.initial_balance as number) || 0);
      const newTarget = balance + pureOrder - ((ord.completed_amount as number) || 0);
      await supabase.from("orders").update({
        target_amount: newTarget,
        total_client_amount: ((ord.total_client_amount as number) || 0) + balance_gap,
        updated_at: now.toISOString(),
      }).eq("id", session.order_id);

      await supabase.from("audit_logs").insert({
        user_id: userData.user.id, action: "update", table_name: "orders", record_id: session.order_id,
        after_data: { type: "client_play", balance_gap, gap_reason: gap_reason || null, new_target: newTarget } as any,
      });
    }
  }

  const { data: updated, error } = await supabase.from("work_sessions")
    .update({ current_balance: balance, balance_gap: balance_gap || 0, gap_reason: gap_reason || null, last_checkpoint_at: now.toISOString(), updated_at: now.toISOString() })
    .eq("id", session.id).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ...updated, earned_so_far: earnedSoFar, hours_so_far: Math.round(hoursSinceStart * 10) / 10, current_efficiency: currentEfficiency });
}
