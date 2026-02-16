import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { TimelineResponse, TimelineConflict } from "@/types/timeline";

export function useTimelineData(params: {
  start: string;
  end: string;
  category?: string;
  include_drafts?: boolean;
}) {
  return useQuery({
    queryKey: ["timeline", params],
    queryFn: async () => {
      const { data } = await api.get<TimelineResponse>(
        "/dashboard/timeline/",
        {
          params: {
            start: params.start,
            end: params.end,
            category: params.category,
            include_drafts: params.include_drafts ? "true" : "false",
          },
        },
      );
      return data;
    },
    enabled: !!params.start && !!params.end,
  });
}

export function useTimelineConflicts(start: string, end: string) {
  return useQuery({
    queryKey: ["timeline-conflicts", start, end],
    queryFn: async () => {
      const { data } = await api.get<TimelineConflict[]>(
        "/dashboard/timeline/conflicts/",
        { params: { start, end } },
      );
      return data;
    },
    enabled: !!start && !!end,
  });
}
