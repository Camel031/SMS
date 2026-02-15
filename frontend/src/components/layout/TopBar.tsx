import { useNavigate } from "react-router-dom";
import { LogOut, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuthStore } from "@/stores/auth-store";
import { useUIStore } from "@/stores/ui-store";
import { useLogout } from "@/hooks/use-auth";
import NotificationBell from "./NotificationBell";

export default function TopBar() {
  const user = useAuthStore((s) => s.user);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const navigate = useNavigate();
  const logout = useLogout();

  const displayName =
    user?.first_name && user?.last_name
      ? `${user.first_name} ${user.last_name}`
      : user?.username ?? "";

  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSettled: () => navigate("/login", { replace: true }),
    });
  };

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-card/60 px-4 backdrop-blur-sm">
      {/* Mobile menu toggle */}
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={toggleSidebar}
      >
        <Menu className="h-5 w-5" />
      </Button>

      <div className="flex-1" />

      {/* User area */}
      <div className="flex items-center gap-3">
        <NotificationBell />
        <div className="hidden text-right text-sm sm:block">
          <p className="font-medium leading-none text-foreground">
            {displayName}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {user?.username}
          </p>
        </div>

        <Avatar>
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>

        <Button
          variant="ghost"
          size="icon"
          onClick={handleLogout}
          disabled={logout.isPending}
          title="Sign out"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
