// GET /api/salary — 工资统计
// POST /api/salary — 锁定/解锁工资

import { createServerSupabase } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabase();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month"); // YYYY-MM

  if (!month) {
    return NextResponse.json({ error: "month parameter required" }, { status: 400 });
  }

  const [year, monthNum] = month.split("-");
  const monthStart = `${year}-${monthNum}-01`;
  const nextMonth = monthNum === "12"
    ? `${parseInt(year) + 1}-01-01`
    : `${year}-${String(Number(monthNum) + 1).padStart(2, "0")}-01`;

  // Get all employees
  const { data: employees } = await supabase
    .from("employees")
    .select("*")
    .eq("is_active", true)
    .order("employee_code");

  // Get salary rate
  const { data: rateData } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "salary_rate")
    .single();
  const salaryRate = rateData ? parseFloat(rateData.value as string) : 700;

  // Get lock status
  const { data: lockData } = await supabase
    .from("salary_locks")
    .select("*")
    .eq("month", month)
    .single();

  // Get work_sessions for each employee in the month
  const { data: sessions } = await supabase
    .from("work_sessions")
    .select("employee_id, result_amount, work_hours, efficiency")
    .eq("status", "completed")
    .gte("end_time", monthStart)
    .lt("end_time", nextMonth);

  // Group by employee
  const employeeStats: Record<string, { totalResult: number; totalHours: number; efficiencies: number[] }> = {};
  for (const s of sessions || []) {
    const eid = s.employee_id as string;
    if (!employeeStats[eid]) {
      employeeStats[eid] = { totalResult: 0, totalHours: 0, efficiencies: [] };
    }
    employeeStats[eid].totalResult += (s.result_amount as number) || 0;
    employeeStats[eid].totalHours += (s.work_hours as number) || 0;
    if (s.efficiency != null) {
      employeeStats[eid].efficiencies.push(s.efficiency as number);
    }
  }

  // Build stats with salary
  const stats = (employees || []).map((emp) => {
    const s = employeeStats[emp.id];
    const totalResult = s?.totalResult || 0;
    const totalHours = s?.totalHours || 0;
    const avgEfficiency = s?.efficiencies && s.efficiencies.length > 0
      ? Math.round((s.efficiencies.reduce((a, b) => a + b, 0) / s.efficiencies.length) * 100) / 100
      : 0;
    const salary = Math.round((totalResult / 100) * salaryRate);

    return {
      employee: emp,
      total_result: totalResult,
      total_hours: totalHours,
      avg_efficiency: avgEfficiency,
      salary,
      salary_rate: salaryRate,
    };
  });

  // Sort by total_result descending
  stats.sort((a, b) => b.total_result - a.total_result);

  // Assign ranks
  const ranked = stats.map((s, i) => ({ ...s, rank: i + 1 }));

  return NextResponse.json({
    month,
    salary_rate: salaryRate,
    is_locked: !!lockData,
    lock_info: lockData || null,
    employees: ranked,
  });
}

// POST /api/salary — Admin lock/unlock
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .single();

  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { month, action, note } = body; // action: "lock" | "unlock"

  if (!month || !action) {
    return NextResponse.json({ error: "month and action required" }, { status: 400 });
  }

  if (action === "lock") {
    const { data, error } = await supabase
      .from("salary_locks")
      .insert({
        month,
        locked_by: userData.user.id,
        note: note || null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    await supabase.from("audit_logs").insert({
      user_id: userData.user.id,
      action: "lock_salary",
      table_name: "salary_locks",
      record_id: data.id,
      after_data: data as unknown as Record<string, unknown>,
    });

    return NextResponse.json({ locked: true, data });
  }

  if (action === "unlock") {
    if (!note) {
      return NextResponse.json(
        { error: "解锁必须填写原因 / La raison de déverrouillage est obligatoire" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("salary_locks")
      .delete()
      .eq("month", month);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await supabase.from("audit_logs").insert({
      user_id: userData.user.id,
      action: "unlock_salary",
      table_name: "salary_locks",
      record_id: null,
      after_data: { month, note } as unknown as Record<string, unknown>,
    });

    return NextResponse.json({ unlocked: true, month });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
