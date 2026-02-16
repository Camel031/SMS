import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  DashboardSummary,
  UpcomingSchedule,
  AttentionItem,
  RecentActivityItem,
} from "@/types/dashboard";

export function useDashboardSummary() {
  return useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: async () => {
      const { data } = await api.get<DashboardSummary>("/dashboard/summary/");
      return data;
    },
    refetchInterval: 60_000,
  });
}

export function useUpcomingSchedules(days = 7) {
  return useQuery({
    queryKey: ["dashboard-upcoming-schedules", days],
    queryFn: async () => {
      const { data } = await api.get<UpcomingSchedule[]>(
        "/dashboard/upcoming-schedules/",
        { params: { days } },
      );
      return data;
    },
    refetchInterval: 60_000,
  });
}

export function useAttentionItems() {
  return useQuery({
    queryKey: ["dashboard-attention-items"],
    queryFn: async () => {
      const { data } = await api.get<AttentionItem[]>(
        "/dashboard/attention-items/",
      );
      return data;
    },
    refetchInterval: 60_000,
  });
}

export function useRecentActivity(limit = 20) {
  return useQuery({
    queryKey: ["dashboard-recent-activity", limit],
    queryFn: async () => {
      const { data } = await api.get<RecentActivityItem[]>(
        "/dashboard/recent-activity/",
        { params: { limit } },
      );
      return data;
    },
    refetchInterval: 60_000,
  });
}
