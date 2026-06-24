// POST /api/admin/fix — 一键修复数据问题
import { createServerSupabase } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userData.user.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const { action } = body; // "fix-machines" | "fix-stale-running" | "fix-orphan" | "fix-completed" | "fix-revenue" | "fix-all"

  const results: string[] = [];

  async function fixMachines() {
    // 有 running 但 status 不是 in_use
    const { data: running } = await supabase.from("work_sessions").select("machine_id").eq("status", "running");
    const runningIds = [...new Set((running || []).map(s => s.machine_id))];
    if (runningIds.length > 0) {
      await supabase.from("machines").update({ status: "in_use" }).in("id", runningIds).neq("status", "in_use");
    }
    // in_use 但无 running
    const { data: machinesInUse } = await supabase.from("machines").select("id").eq("status", "in_use");
    for (const m of machinesInUse || []) {
      if (!runningIds.includes(m.id)) {
        await supabase.from("machines").update({ status: "available" }).eq("id", m.id);
      }
    }
    results.push("设备状态已修复");
  }

  async function fixStaleRunning() {
    const { data: badOrders } = await supabase.from("orders").select("id").in("status", ["completed", "paused", "cancelled"]);
    if (badOrders && badOrders.length > 0) {
      const ids = badOrders.map(o => o.id);
      await supabase.from("work_sessions").update({ status: "void", void_reason: "管理工具一键修复" }).in("order_id", ids).eq("status", "running");
    }
    results.push("残留running分段已关闭");
  }

  async function fixOrphan() {
    await supabase.from("orders").update({ current_employee_id: null, current_machine_id: null }).in("status", ["completed", "paused", "cancelled"]).or("current_employee_id.not.is.null,current_machine_id.not.is.null");
    results.push("已完成/暂停订单的打手设备已释放");
  }

  async function fixCompleted() {
    const { data: orders } = await supabase.from("orders").select("id").eq("status", "completed");
    for (const o of orders || []) {
      const { data: sessions } = await supabase.from("work_sessions").select("result_amount").eq("order_id", o.id).in("status", ["completed", "void"]);
      const total = (sessions || []).reduce((s: number, ws: any) => s + (ws.result_amount || 0), 0);
      await supabase.from("orders").update({ completed_amount: total }).eq("id", o.id);
    }
    results.push("completed_amount 已修正");
  }

  async function fixRevenue() {
    const { data: orders } = await supabase.from("orders").select("id, order_amount, target_amount, initial_balance, unit_price").not("unit_price", "is", null).gt("unit_price", 0);
    for (const o of orders || []) {
      const amt = (o.order_amount as number) ?? ((o.target_amount || 0) - (o.initial_balance || 0));
      const expected = Math.round(amt / 100 * (o.unit_price as number));
      await supabase.from("orders").update({ order_revenue: expected }).eq("id", o.id);
    }
    results.push("收入已重算");
  }

  switch (action) {
    case "fix-machines": await fixMachines(); break;
    case "fix-stale-running": await fixStaleRunning(); break;
    case "fix-orphan": await fixOrphan(); break;
    case "fix-completed": await fixCompleted(); break;
    case "fix-revenue": await fixRevenue(); break;
    case "fix-all":
      await fixMachines();
      await fixStaleRunning();
      await fixOrphan();
      await fixCompleted();
      await fixRevenue();
      break;
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  await supabase.from("audit_logs").insert({
    user_id: userData.user.id,
    action: "update",
    table_name: "admin_tools",
    after_data: { action, results } as any,
  });

  return NextResponse.json({ success: true, results });
}
