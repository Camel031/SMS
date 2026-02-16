import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  User,
  UserCreatePayload,
  UserUpdatePayload,
  UserPermissionPayload,
  PaginatedResponse,
} from "@/types/auth";

// ─── User Queries ───────────────────────────────────────────────────

export function useUsers(params?: Record<string, string>) {
  return useQuery({
    queryKey: ["users", params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<User>>(
        "/users/",
        { params },
      );
      return data;
    },
  });
}

export function useUser(uuid: string) {
  return useQuery({
    queryKey: ["users", uuid],
    queryFn: async () => {
      const { data } = await api.get<User>(`/users/${uuid}/`);
      return data;
    },
    enabled: !!uuid,
  });
}

// ─── User Mutations ─────────────────────────────────────────────────

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: UserCreatePayload) => {
      const { data } = await api.post<User>("/users/", payload);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useUpdateUser(uuid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: UserUpdatePayload) => {
      const { data } = await api.patch<User>(`/users/${uuid}/`, payload);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["users", uuid] });
    },
  });
}

export function useUpdateUserPermissions(uuid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: UserPermissionPayload) => {
      const { data } = await api.patch<User>(
        `/users/${uuid}/permissions/`,
        payload,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["users", uuid] });
    },
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (uuid: string) => {
      await api.delete(`/users/${uuid}/`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
    },
  });
}
