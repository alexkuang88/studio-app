import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
          <div className="text-gray-500">加载中...</div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
