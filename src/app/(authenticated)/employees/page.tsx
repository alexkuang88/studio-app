"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  EMPLOYEE_STATUS_LABELS,
  type Employee,
  type EmployeeStatus,
} from "@/lib/types/database";
import { Plus, Pencil, Search } from "lucide-react";
import Link from "next/link";

export default function EmployeesPage() {
  const { isAdmin } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editEmployee, setEditEmployee] = useState<Employee | null>(null);

  const supabase = createClient();

  const fetchEmployees = async () => {
    setLoading(true);
    let query = supabase.from("employees").select("*").order("employee_code");

    if (statusFilter) {
      query = query.eq("status", statusFilter);
    }
    if (search) {
      query = query.or(
        `chinese_name.ilike.%${search}%,employee_code.ilike.%${search}%,local_name.ilike.%${search}%`
      );
    }

    const { data } = await query;
    setEmployees((data as Employee[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchEmployees();
  }, [statusFilter, search]);

  const statusBadgeVariant = (status: EmployeeStatus) => {
    switch (status) {
      case "official":
        return "green" as const;
      case "advanced":
        return "purple" as const;
      case "training":
        return "blue" as const;
      case "suspended":
        return "orange" as const;
      case "left":
        return "red" as const;
      default:
        return "gray" as const;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            员工管理 / Employés
          </h1>
          <p className="text-gray-500 mt-1">
            共 {employees.length} 名员工
          </p>
        </div>
        <Link href={`/employees/${"new"}`}>
          <Button variant="primary">
            <Plus size={18} className="mr-1" />
            新增员工 / Ajouter
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <Input
            placeholder="搜索姓名或编号 / Rechercher..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={[
            { value: "", label: "全部状态 / Tous" },
            ...Object.entries(EMPLOYEE_STATUS_LABELS).map(([v, l]) => ({
              value: v,
              label: l,
            })),
          ]}
          className="w-full sm:w-48"
        />
        <Button variant="outline" onClick={fetchEmployees}>
          <Search size={18} className="mr-1" />
          刷新
        </Button>
      </div>

      {/* Employee list */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">
                  编号 / Code
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">
                  姓名 / Nom
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 hidden sm:table-cell">
                  电话 / Téléphone
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">
                  状态 / Statut
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 hidden md:table-cell">
                  可接单
                </th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    加载中...
                  </td>
                </tr>
              ) : employees.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    暂无员工 / Aucun employé
                  </td>
                </tr>
              ) : (
                employees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono font-medium">
                      {emp.employee_code}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/employees/${emp.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        {emp.chinese_name}
                      </Link>
                      {emp.local_name && (
                        <span className="text-gray-400 text-xs ml-1">
                          ({emp.local_name})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell text-gray-500">
                      {emp.phone || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={statusBadgeVariant(emp.status)}>
                        {EMPLOYEE_STATUS_LABELS[emp.status]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {emp.can_take_order ? (
                        <span className="text-green-600 text-xs font-medium">
                          ✅ 可接单
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/employees/${emp.id}`}>
                        <Button variant="ghost" size="sm">
                          <Pencil size={16} />
                          <span className="hidden sm:inline ml-1">详情</span>
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
