import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import type { LoginRequest, LoginResponse, User } from "@/types/auth";

export function useMe() {
  const setUser = useAuthStore((s) => s.setUser);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const { data } = await api.get<User>("/auth/me/");
      setUser(data);
      return data;
    },
    enabled: isAuthenticated,
    staleTime: 30_000,
    retry: false,
  });
}

export function useLogin() {
  const setUser = useAuthStore((s) => s.setUser);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (credentials: LoginRequest) => {
      const { data } = await api.post<LoginResponse>(
        "/auth/login/",
        credentials,
      );
      return data;
    },
    onSuccess: async (data) => {
      localStorage.setItem("access_token", data.access);
      localStorage.setItem("refresh_token", data.refresh);
      // Fetch user profile after login
      const { data: user } = await api.get<User>("/auth/me/");
      setUser(user);
      queryClient.setQueryData(["me"], user);
    },
  });
}

export function useLogout() {
  const logout = useAuthStore((s) => s.logout);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const refresh = localStorage.getItem("refresh_token");
      if (refresh) {
        await api.post("/auth/logout/", { refresh });
      }
    },
    onSettled: () => {
      logout();
      queryClient.clear();
    },
  });
}

export function usePermission() {
  const user = useAuthStore((s) => s.user);

  return {
    canCheckIn: user?.can_check_in ?? false,
    canCheckOut: user?.can_check_out ?? false,
    canManageEquipment: user?.can_manage_equipment ?? false,
    canManageSchedules: user?.can_manage_schedules ?? false,
    canManageUsers: user?.can_manage_users ?? false,
    canViewReports: user?.can_view_reports ?? false,
    requiresConfirmation: user?.requires_confirmation ?? false,
  };
}
