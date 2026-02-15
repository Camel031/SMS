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
            {/* Inventory */}
            <Route path="inventory" element={<InventoryPage />} />
            {/* Schedules */}
            <Route path="schedules" element={<ScheduleListPage />} />
            <Route path="schedules/new" element={<ScheduleFormPage />} />
            <Route path="schedules/:uuid" element={<ScheduleDetailPage />} />
            <Route path="schedules/:uuid/edit" element={<ScheduleFormPage />} />
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
