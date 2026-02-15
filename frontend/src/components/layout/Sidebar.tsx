import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Package,
  CalendarRange,
  Warehouse as WarehouseIcon,
  Bell,
  Users,
  ScrollText,
  ChevronLeft,
  BarChart3,
  Settings2,
  FileText,
  ArrowLeftRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePermission } from "@/hooks/use-auth";
import { useUIStore } from "@/stores/ui-store";
import { Separator } from "@/components/ui/separator";

interface NavItem {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: boolean;
}

export default function Sidebar() {
  const perms = usePermission();
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);

  const mainNav: NavItem[] = [
    { label: "Dashboard", to: "/", icon: LayoutDashboard },
    { label: "Equipment", to: "/equipment", icon: Package },
    { label: "Inventory", to: "/inventory", icon: BarChart3 },
    { label: "Schedules", to: "/schedules", icon: CalendarRange },
    { label: "Rentals", to: "/rentals", icon: FileText },
    { label: "Warehouse", to: "/warehouse", icon: WarehouseIcon },
    { label: "Transfers", to: "/transfers", icon: ArrowLeftRight },
    { label: "Notifications", to: "/notifications", icon: Bell },
  ];

  const adminNav: NavItem[] = [
    {
      label: "Custom Fields",
      to: "/equipment/custom-fields",
      icon: Settings2,
      permission: perms.canManageEquipment,
    },
    {
      label: "Users",
      to: "/admin/users",
      icon: Users,
      permission: perms.canManageUsers,
    },
    {
      label: "Audit Logs",
      to: "/admin/audit-logs",
      icon: ScrollText,
      permission: perms.canViewReports,
    },
  ];

  const visibleAdmin = adminNav.filter(
    (item) => item.permission === undefined || item.permission,
  );

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-30 flex flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200",
        sidebarOpen ? "w-56" : "w-14",
      )}
    >
      {/* Header */}
      <div className="flex h-14 items-center justify-between px-3">
        {sidebarOpen && (
          <span className="text-sm font-semibold tracking-wide text-sidebar-accent">
            SMS
          </span>
        )}
        <button
          onClick={toggleSidebar}
          className="flex h-8 w-8 items-center justify-center rounded-md text-sidebar-foreground hover:bg-secondary hover:text-foreground"
        >
          <ChevronLeft
            className={cn(
              "h-4 w-4 transition-transform duration-200",
              !sidebarOpen && "rotate-180",
            )}
          />
        </button>
      </div>

      <Separator className="bg-sidebar-border" />

      {/* Main navigation */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
        {mainNav.map((item) => (
          <SidebarLink key={item.to} item={item} collapsed={!sidebarOpen} />
        ))}

        {visibleAdmin.length > 0 && (
          <>
            <Separator className="my-3 bg-sidebar-border" />
            {sidebarOpen && (
              <span className="mb-1 block px-2 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">
                Admin
              </span>
            )}
            {visibleAdmin.map((item) => (
              <SidebarLink
                key={item.to}
                item={item}
                collapsed={!sidebarOpen}
              />
            ))}
          </>
        )}
      </nav>
    </aside>
  );
}

function SidebarLink({
  item,
  collapsed,
}: {
  item: NavItem;
  collapsed: boolean;
}) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.to === "/"}
      className={({ isActive }) =>
        cn(
          "group flex items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors",
          collapsed && "justify-center px-0",
          isActive
            ? "bg-sidebar-accent/10 text-sidebar-accent"
            : "text-sidebar-foreground hover:bg-secondary hover:text-foreground",
        )
      }
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </NavLink>
  );
}
