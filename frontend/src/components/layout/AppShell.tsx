import { Outlet, Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { useUIStore } from "@/stores/ui-store";
import { useMe } from "@/hooks/use-auth";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";

export default function AppShell() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const { isLoading, isError } = useMe();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (isError) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div
        className={cn(
          "flex flex-1 flex-col transition-[margin-left] duration-200",
          sidebarOpen ? "ml-56" : "ml-14",
        )}
      >
        <TopBar />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
