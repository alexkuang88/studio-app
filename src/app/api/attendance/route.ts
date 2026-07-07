// GET /api/attendance?date=YYYY-MM-DD — 每日考勤看板
import { createServerSupabase } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { getMGDay } from "@/lib/utils/calculations";

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date"); // YYYY-MM-DD (MG time)

  if (!date) return NextResponse.json({ error: "date required" }, { status: 400 });

  // Day boundaries in MG time (UTC+3)
  const dayStart = `${date}T00:00:00+03:00`;
  const dayEnd = `${date}T23:59:59+03:00`;

  // All active employees (not left)
  const { data: employees } = await supabase
    .from("employees")
    .select("*")
    .eq("is_active", true)
    .neq("status", "left")
    .order("employee_code");

  // Completed sessions ending today
  const { data: completed } = await supabase
    .from("work_sessions")
    .select("employee_id, result_amount, work_hours, efficiency, start_time, end_time")
    .eq("status", "completed")
    .gte("end_time", dayStart)
    .lte("end_time", dayEnd);

  // Running sessions (started today or before, still going)
  const { data: running } = await supabase
    .from("work_sessions")
    .select("employee_id, start_time, start_amount, order_id")
    .eq("status", "running");

  // Build employee stats
  const empMap: Record<string, any> = {};
  for (const e of employees || []) {
    empMap[e.id] = {
      employee: e,
      totalResult: 0,
      totalHours: 0,
      efficiencySum: 0,
      efficiencyCount: 0,
      isRunning: false,
      runningOrder: null,
      runningStartTime: null,
    };
  }

  for (const s of completed || []) {
    const eid = s.employee_id as string;
    if (!empMap[eid]) continue;
    empMap[eid].totalResult += (s.result_amount as number) || 0;
    empMap[eid].totalHours += (s.work_hours as number) || 0;
    if (s.efficiency != null) {
      empMap[eid].efficiencySum += s.efficiency as number;
      empMap[eid].efficiencyCount++;
    }
  }

  // Mark running employees
  for (const r of running || []) {
    const eid = r.employee_id as string;
    if (!empMap[eid]) continue;
    empMap[eid].isRunning = true;
    empMap[eid].runningStartTime = r.start_time;
    // Get order code
    const { data: ord } = await supabase
      .from("orders")
      .select("order_code")
      .eq("id", r.order_id as string)
      .single();
    empMap[eid].runningOrder = ord?.order_code || null;
  }

  // Split present vs absent
  const present: any[] = [];
  const absent: any[] = [];

  for (const e of employees || []) {
    const stats = empMap[e.id];
    if (!stats) continue;

    const hasActivity = stats.totalResult > 0 || stats.totalHours > 0 || stats.isRunning;

    if (hasActivity) {
      present.push({
        employee: stats.employee,
        total_result: stats.totalResult,
        total_hours: stats.totalHours,
        avg_efficiency:
          stats.efficiencyCount > 0
            ? Math.round((stats.efficiencySum / stats.efficiencyCount) * 100) / 100
            : 0,
        is_running: stats.isRunning,
        running_order: stats.runningOrder,
        running_start_time: stats.runningStartTime,
      });
    } else {
      absent.push({
        employee: stats.employee,
      });
    }
  }

  // Sort: running first, then by result desc
  present.sort((a, b) => {
    if (a.is_running !== b.is_running) return a.is_running ? -1 : 1;
    return b.total_result - a.total_result;
  });

  absent.sort((a, b) =>
    a.employee.employee_code.localeCompare(b.employee.employee_code)
  );

  const totalResult = present.reduce((s, p) => s + p.total_result, 0);
  const totalHours = present.reduce((s, p) => s + p.total_hours, 0);

  return NextResponse.json({
    date,
    present_count: present.length,
    absent_count: absent.length,
    total_result: totalResult,
    total_hours: totalHours,
    present,
    absent,
  });
}
