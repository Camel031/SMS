import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import AppShell from "@/components/layout/AppShell";
import LoginPage from "@/features/auth/LoginPage";
import DashboardPage from "@/features/dashboard/DashboardPage";
import EquipmentPage from "@/features/equipment/EquipmentPage";
import EquipmentModelDetailPage from "@/features/equipment/EquipmentModelDetailPage";
import EquipmentItemDetailPage from "@/features/equipment/EquipmentItemDetailPage";
import EquipmentModelFormPage from "@/features/equipment/EquipmentModelFormPage";
import EquipmentItemFormPage from "@/features/equipment/EquipmentItemFormPage";
import CategoriesPage from "@/features/equipment/CategoriesPage";
import CustomFieldsPage from "@/features/equipment/CustomFieldsPage";
import InventoryPage from "@/features/equipment/InventoryPage";
import ScheduleListPage from "@/features/schedules/ScheduleListPage";
import ScheduleFormPage from "@/features/schedules/ScheduleFormPage";
import ScheduleDetailPage from "@/features/schedules/ScheduleDetailPage";
import RentalListPage from "@/features/rentals/RentalListPage";
import RentalFormPage from "@/features/rentals/RentalFormPage";
import RentalDetailPage from "@/features/rentals/RentalDetailPage";
import WarehouseTransactionsPage from "@/features/warehouse/WarehouseTransactionsPage";
import WarehouseTransactionDetailPage from "@/features/warehouse/WarehouseTransactionDetailPage";
import PendingConfirmationsPage from "@/features/warehouse/PendingConfirmationsPage";
import CheckOutPage from "@/features/warehouse/CheckOutPage";
import CheckInPage from "@/features/warehouse/CheckInPage";
import TransferListPage from "@/features/transfers/TransferListPage";
import TransferFormPage from "@/features/transfers/TransferFormPage";
import TransferDetailPage from "@/features/transfers/TransferDetailPage";
import NotificationListPage from "@/features/notifications/NotificationListPage";
import NotificationPreferencesPage from "@/features/notifications/NotificationPreferencesPage";
import TimelinePage from "@/features/timeline/TimelinePage";
import AuditLogPage from "@/features/audit/AuditLogPage";
import UserManagementPage from "@/features/admin/UserManagementPage";
import RepairKanbanPage from "@/features/repairs/RepairKanbanPage";
import EquipmentTemplatesPage from "@/features/equipment/EquipmentTemplatesPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            {/* Equipment */}
            <Route path="equipment" element={<EquipmentPage />} />
            <Route path="equipment/new" element={<EquipmentModelFormPage />} />
            <Route path="equipment/categories" element={<CategoriesPage />} />
            <Route path="equipment/custom-fields" element={<CustomFieldsPage />} />
            <Route path="equipment/models/:uuid" element={<EquipmentModelDetailPage />} />
            <Route path="equipment/models/:uuid/edit" element={<EquipmentModelFormPage />} />
            <Route path="equipment/items/new" element={<EquipmentItemFormPage />} />
            <Route path="equipment/items/:uuid" element={<EquipmentItemDetailPage />} />
            <Route path="equipment/items/:uuid/edit" element={<EquipmentItemFormPage />} />
            <Route path="equipment/templates" element={<EquipmentTemplatesPage />} />
            {/* Inventory */}
            <Route path="inventory" element={<InventoryPage />} />
            {/* Timeline */}
            <Route path="timeline" element={<TimelinePage />} />
            {/* Schedules */}
            <Route path="schedules" element={<ScheduleListPage />} />
            <Route path="schedules/new" element={<ScheduleFormPage />} />
            <Route path="schedules/:uuid" element={<ScheduleDetailPage />} />
            <Route path="schedules/:uuid/edit" element={<ScheduleFormPage />} />
            {/* Rentals */}
            <Route path="rentals" element={<RentalListPage />} />
            <Route path="rentals/new" element={<RentalFormPage />} />
            <Route path="rentals/:uuid" element={<RentalDetailPage />} />
            <Route path="rentals/:uuid/edit" element={<RentalFormPage />} />
            {/* Warehouse */}
            <Route path="warehouse" element={<WarehouseTransactionsPage />} />
            <Route path="warehouse/check-out" element={<CheckOutPage />} />
            <Route path="warehouse/check-in" element={<CheckInPage />} />
            <Route path="warehouse/pending" element={<PendingConfirmationsPage />} />
            <Route path="warehouse/transactions/:uuid" element={<WarehouseTransactionDetailPage />} />
            {/* Repairs */}
            <Route path="repairs" element={<RepairKanbanPage />} />
            {/* Transfers */}
            <Route path="transfers" element={<TransferListPage />} />
            <Route path="transfers/new" element={<TransferFormPage />} />
            <Route path="transfers/:uuid" element={<TransferDetailPage />} />
            {/* Notifications */}
            <Route path="notifications" element={<NotificationListPage />} />
            {/* Settings */}
            <Route path="settings/notifications" element={<NotificationPreferencesPage />} />
            {/* Admin */}
            <Route path="admin/users" element={<UserManagementPage />} />
            <Route path="admin/audit-logs" element={<AuditLogPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: "var(--color-card)",
            border: "1px solid var(--color-border)",
            color: "var(--color-foreground)",
          },
        }}
      />
    </QueryClientProvider>
  );
}
