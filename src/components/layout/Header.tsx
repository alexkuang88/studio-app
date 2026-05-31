"use client";

import { useAuth } from "@/lib/hooks/useAuth";
import { RefreshCw } from "lucide-react";
import { useState, useEffect } from "react";

export function Header() {
  const { profile } = useAuth();
  const [dateStr, setDateStr] = useState("");

  useEffect(() => {
    setDateStr(
      new Date().toLocaleDateString("zh-CN", {
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "long",
      })
    );
  }, []);

  return (
    <header className="sticky top-0 z-20 bg-white border-b border-gray-200 px-4 py-3 lg:px-6">
      <div className="flex items-center justify-between">
        <div className="ml-12 lg:ml-0 text-sm text-gray-500">
          {dateStr || "..."}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => window.location.reload()}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
            title="刷新 / Actualiser"
          >
            <RefreshCw size={18} />
          </button>
          <div className="flex items-center gap-2 text-sm">
            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold">
              {profile?.name?.charAt(0)?.toUpperCase() || "?"}
            </div>
            <div className="hidden sm:block">
              <p className="font-medium text-gray-900">{profile?.name}</p>
              <p className="text-xs text-gray-500">
                {profile?.role === "admin" ? "Admin" : "Operator"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
