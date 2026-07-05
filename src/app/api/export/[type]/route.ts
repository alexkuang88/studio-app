// GET /api/export/[type] — Excel 导出

import { createServerSupabase } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { calcDailyTieredSalary } from "@/lib/utils/calculations";

const EXPORT_TYPES = [
  "orders",
  "salary",
  "voided",
  "overdue",
  "machines",
] as const;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ type: string }> }
) {
  const { type } = await context.params;
  const supabase = await createServerSupabase();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month");
  const orderId = searchParams.get("order_id");
  const employeeId = searchParams.get("employee_id");

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Studio Manager";
  workbook.created = new Date();

  let filename = "export.xlsx";

  try {
    switch (type) {
      case "orders": {
        filename = "订单列表.xlsx";
        const { data: orders } = await supabase
          .from("orders")
          .select("*, employees(chinese_name, employee_code)")
          .order("created_at", { ascending: false });

        const ws = workbook.addWorksheet("订单列表");
        ws.columns = [
          { header: "订单号", key: "order_code", width: 12 },
          { header: "来源", key: "order_source", width: 15 },
          { header: "目标金额(万)", key: "target_amount", width: 15 },
          { header: "已完成(万)", key: "completed_amount", width: 15 },
          { header: "状态", key: "status", width: 15 },
          { header: "打手", key: "employee", width: 20 },
          { header: "下单时间", key: "order_received_at", width: 20 },
          { header: "要求完成", key: "expected_completion_at", width: 20 },
          { header: "实际完成", key: "actual_completed_at", width: 20 },
        ];
        (orders || []).forEach((order) => {
          const emp = order.employees as Record<string, unknown> | null;
          ws.addRow({
            order_code: order.order_code,
            order_source: order.order_source,
            target_amount: order.target_amount,
            completed_amount: order.completed_amount,
            status: order.status,
            employee: emp ? `${emp.employee_code} ${emp.chinese_name}` : "",
            order_received_at: order.order_received_at,
            expected_completion_at: order.expected_completion_at,
            actual_completed_at: order.actual_completed_at,
          });
        });
        break;
      }

      case "salary": {
        filename = `工资统计${month ? `_${month}` : ""}.xlsx`;
        if (!month) {
          return NextResponse.json(
            { error: "month parameter required for salary export" },
            { status: 400 }
          );
        }

        const [year, monthNum] = month.split("-");
        const monthStart = `${year}-${monthNum}-01T00:00:00+03:00`;
        const nextMonthNum = monthNum === "12" ? 1 : Number(monthNum) + 1;
        const nextYear = monthNum === "12" ? String(parseInt(year) + 1) : year;
        const nextMonth = `${nextYear}-${String(nextMonthNum).padStart(2, "0")}-01T00:00:00+03:00`;

        const { data: employees } = await supabase
          .from("employees")
          .select("*")
          .eq("is_active", true);

        // Fetch all salary settings
        const { data: settingsRows } = await supabase
          .from("settings")
          .select("key, value")
          .in("key", ["salary_rate", "salary_rate_base", "salary_rate_premium", "daily_threshold", "tiered_salary_start_date"]);

        const settingsMap: Record<string, string> = {};
        for (const row of settingsRows || []) {
          settingsMap[row.key as string] = row.value as string;
        }

        const salaryRate = settingsMap["salary_rate"] ? parseFloat(settingsMap["salary_rate"]) : 700;
        const baseRate = settingsMap["salary_rate_base"] ? parseFloat(settingsMap["salary_rate_base"]) : 700;
        const premiumRate = settingsMap["salary_rate_premium"] ? parseFloat(settingsMap["salary_rate_premium"]) : 800;
        const dailyThreshold = settingsMap["daily_threshold"] ? parseFloat(settingsMap["daily_threshold"]) : 2200;
        const startDate = settingsMap["tiered_salary_start_date"] || "2026-07-06";
        const isTiered = settingsMap["salary_rate_base"] !== undefined
          && settingsMap["salary_rate_premium"] !== undefined
          && settingsMap["daily_threshold"] !== undefined;

        const { data: sessions } = await supabase
          .from("work_sessions")
          .select("employee_id, result_amount, work_hours, efficiency, end_time")
          .eq("status", "completed")
          .gte("end_time", monthStart)
          .lt("end_time", nextMonth);

        const stats: Record<string, { totalResult: number; totalHours: number }> = {};
        for (const s of sessions || []) {
          const eid = s.employee_id as string;
          if (!stats[eid]) stats[eid] = { totalResult: 0, totalHours: 0 };
          stats[eid].totalResult += (s.result_amount as number) || 0;
          stats[eid].totalHours += (s.work_hours as number) || 0;
        }

        // Tiered salary
        let tieredSalaryMap: Map<string, number> = new Map();
        if (isTiered && (sessions || []).length > 0) {
          tieredSalaryMap = calcDailyTieredSalary(
            sessions as Array<{ employee_id: string; result_amount: number | null; end_time: string | null }>,
            baseRate,
            premiumRate,
            dailyThreshold,
            startDate,
            salaryRate
          );
        }

        const ws = workbook.addWorksheet("工资统计");
        ws.columns = [
          { header: "排名", key: "rank", width: 8 },
          { header: "员工编号", key: "code", width: 12 },
          { header: "姓名", key: "name", width: 15 },
          { header: "总成绩(万)", key: "total", width: 15 },
          { header: "总工时(h)", key: "hours", width: 12 },
          { header: "工资(Ar)", key: "salary", width: 15 },
        ];

        const rows = (employees || [])
          .map((emp) => {
            const s = stats[emp.id];
            const total = s?.totalResult || 0;
            const hours = s?.totalHours || 0;
            const salary = isTiered
              ? (tieredSalaryMap.get(emp.id) || 0)
              : Math.round((total / 100) * salaryRate);
            return {
              code: emp.employee_code,
              name: emp.chinese_name,
              total,
              hours,
              salary,
            };
          })
          .sort((a, b) => b.total - a.total);

        rows.forEach((row, i) => {
          ws.addRow({ ...row, rank: i + 1 });
        });
        break;
      }

      case "voided": {
        filename = "作废记录.xlsx";
        const { data: voided } = await supabase
          .from("work_sessions")
          .select("*, employees(*), orders(order_code)")
          .eq("status", "void")
          .order("voided_at", { ascending: false });

        const ws = workbook.addWorksheet("作废记录");
        ws.columns = [
          { header: "订单号", key: "order_code", width: 12 },
          { header: "员工", key: "employee", width: 20 },
          { header: "开始时间", key: "start_time", width: 20 },
          { header: "成绩(万)", key: "result_amount", width: 12 },
          { header: "作废原因", key: "void_reason", width: 30 },
          { header: "作废时间", key: "voided_at", width: 20 },
        ];
        (voided || []).forEach((v) => {
          const emp = v.employees as Record<string, unknown> | null;
          const ord = v.orders as Record<string, unknown> | null;
          ws.addRow({
            order_code: ord?.order_code || "",
            employee: emp ? `${emp.employee_code} ${emp.chinese_name}` : "",
            start_time: v.start_time,
            result_amount: v.result_amount,
            void_reason: v.void_reason,
            voided_at: v.voided_at,
          });
        });
        break;
      }

      case "overdue": {
        filename = "超时订单.xlsx";
        const now = new Date().toISOString();
        const { data: overdueOrders } = await supabase
          .from("orders")
          .select("*, employees(chinese_name, employee_code)")
          .in("status", ["in_progress","not_started","ready_to_complete"])
          .lt("expected_completion_at", now)
          .order("expected_completion_at");

        const ws = workbook.addWorksheet("超时订单");
        ws.columns = [
          { header: "订单号", key: "order_code", width: 12 },
          { header: "来源", key: "order_source", width: 15 },
          { header: "目标(万)", key: "target_amount", width: 12 },
          { header: "已完成(万)", key: "completed_amount", width: 12 },
          { header: "要求完成", key: "expected_completion_at", width: 20 },
          { header: "打手", key: "employee", width: 20 },
        ];
        (overdueOrders || []).forEach((o) => {
          const emp = o.employees as Record<string, unknown> | null;
          ws.addRow({
            order_code: o.order_code,
            order_source: o.order_source,
            target_amount: o.target_amount,
            completed_amount: o.completed_amount,
            expected_completion_at: o.expected_completion_at,
            employee: emp ? `${emp.employee_code} ${emp.chinese_name}` : "",
          });
        });
        break;
      }

      case "machines": {
        filename = "设备使用记录.xlsx";
        const { data: machineSessions } = await supabase
          .from("work_sessions")
          .select("*, employees(*), machines(*), orders(order_code)")
          .eq("status", "completed")
          .order("start_time", { ascending: false })
          .limit(500);

        const ws = workbook.addWorksheet("设备使用记录");
        ws.columns = [
          { header: "设备", key: "machine", width: 15 },
          { header: "订单号", key: "order_code", width: 12 },
          { header: "员工", key: "employee", width: 20 },
          { header: "开始时间", key: "start_time", width: 20 },
          { header: "结束时间", key: "end_time", width: 20 },
          { header: "成绩(万)", key: "result", width: 12 },
          { header: "工时(h)", key: "hours", width: 10 },
        ];
        (machineSessions || []).forEach((s) => {
          const m = s.machines as Record<string, unknown> | null;
          const e = s.employees as Record<string, unknown> | null;
          const o = s.orders as Record<string, unknown> | null;
          ws.addRow({
            machine: m ? `${m.machine_code} ${m.machine_name}` : "",
            order_code: o?.order_code || "",
            employee: e ? `${e.employee_code} ${e.chinese_name}` : "",
            start_time: s.start_time,
            end_time: s.end_time,
            result: s.result_amount,
            hours: s.work_hours,
          });
        });
        break;
      }

      default:
        return NextResponse.json(
          { error: `Unknown export type: ${type}. Available: ${EXPORT_TYPES.join(", ")}` },
          { status: 400 }
        );
    }

    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch (error) {
    console.error("Export error:", error);
    return NextResponse.json(
      { error: "Export failed / Échec de l'exportation" },
      { status: 500 }
    );
  }
}
