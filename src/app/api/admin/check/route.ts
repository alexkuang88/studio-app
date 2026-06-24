// GET /api/admin/check — 数据一致性检测（只读）
import { createServerSupabase } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userData.user.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const issues: Record<string, any[]> = {
    machine_mismatch: [],
    stale_running: [],
    orphan_employee: [],
    completed_amount_wrong: [],
    revenue_mismatch: [],
  };

  // 1. 设备状态 vs running 分段
  const { data: machines } = await supabase.from("machines").select("*");
  const { data: running } = await supabase.from("work_sessions").select("*, orders(order_code)").eq("status", "running");
  const runningById: Record<string, any> = {};
  for (const s of running || []) runningById[s.machine_id] = s;

  for (const m of machines || []) {
    if (m.status === "in_use" && !runningById[m.id]) {
      issues.machine_mismatch.push({ machine: `${m.machine_code} ${m.machine_name}`, status: "in_use", running: false, fix: "SET status='available'" });
    }
    if (m.status !== "in_use" && runningById[m.id]) {
      issues.machine_mismatch.push({ machine: `${m.machine_code} ${m.machine_name}`, status: m.status, running: true, fix: "SET status='in_use'" });
    }
  }

  // 2. 已完成/暂停订单有 running 分段
  const { data: badOrders } = await supabase.from("orders").select("id, order_code, status").in("status", ["completed", "paused", "cancelled"]);
  if (badOrders) {
    for (const o of badOrders) {
      const { count } = await supabase.from("work_sessions").select("id", { count: "exact", head: true }).eq("order_id", o.id).eq("status", "running");
      if ((count || 0) > 0) {
        issues.stale_running.push({ order: o.order_code, status: o.status, running_count: count, fix: "UPDATE work_sessions SET status='void'" });
      }
    }
  }

  // 3. 已完成/暂停订单还绑着打手
  const { data: boundOrders } = await supabase.from("orders").select("order_code, status, current_employee_id").in("status", ["completed", "paused", "cancelled"]).not("current_employee_id", "is", null);
  for (const o of boundOrders || []) {
    issues.orphan_employee.push({ order: o.order_code, status: o.status, fix: "SET current_employee_id=NULL" });
  }

  // 4. completed_amount 不匹配
  const { data: compOrders } = await supabase.from("orders").select("id, order_code, status, completed_amount").eq("status", "completed");
  if (compOrders) {
    for (const o of compOrders) {
      const { data: sessions } = await supabase.from("work_sessions").select("result_amount").eq("order_id", o.id).in("status", ["completed", "void"]);
      const total = (sessions || []).reduce((s: number, ws: any) => s + (ws.result_amount || 0), 0);
      if (Math.abs(total - (o.completed_amount || 0)) > 2) {
        issues.completed_amount_wrong.push({ order: o.order_code, db: o.completed_amount, calc: total, fix: `SET completed_amount=${total}` });
      }
    }
  }

  // 5. 收入不匹配
  const { data: revOrders } = await supabase.from("orders").select("order_code, order_amount, unit_price, order_revenue").not("unit_price", "is", null).gt("unit_price", 0);
  for (const o of revOrders || []) {
    const expected = Math.round(((o.order_amount as number) || 0) / 100 * (o.unit_price as number));
    if (Math.abs(expected - ((o.order_revenue as number) || 0)) > 1) {
      issues.revenue_mismatch.push({ order: o.order_code, amount: o.order_amount, unit_price: o.unit_price, db_revenue: o.order_revenue, expected, fix: `SET order_revenue=${expected}` });
    }
  }

  const total = Object.values(issues).reduce((s, arr) => s + arr.length, 0);

  return NextResponse.json({ total_issues: total, issues });
}
