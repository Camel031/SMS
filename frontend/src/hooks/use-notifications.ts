import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  Notification,
  PaginatedResponse,
} from "@/types/notification";

export function useNotifications(params?: Record<string, string>) {
  return useQuery({
    queryKey: ["notifications", params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<Notification>>(
        "/notifications/",
        { params },
      );
      return data;
    },
    placeholderData: keepPreviousData,
  });
}

export function useUnreadCount() {
  return useQuery({
    queryKey: ["notifications-unread-count"],
    queryFn: async () => {
      const { data } = await api.get<{ count: number }>(
        "/notifications/unread-count/",
      );
      return data.count;
    },
    refetchInterval: 30_000,
  });
}

export function useMarkAsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (uuid: string) => {
      const { data } = await api.post<Notification>(
        `/notifications/${uuid}/read/`,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["notifications-unread-count"] });
    },
  });
}

export function useMarkAllAsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post<{ marked: number }>(
        "/notifications/mark-all-read/",
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["notifications-unread-count"] });
    },
  });
}
