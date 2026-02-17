import type { QueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getTimeRange } from "@/features/timeline/timeline-utils";

type PrefetchFn = (queryClient: QueryClient) => Promise<void>;

const PAGE_1: Record<string, string> = { page: "1" };

async function prefetchGet(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
  url: string,
  params?: Record<string, string>,
) {
  await queryClient.prefetchQuery({
    queryKey,
    queryFn: async () => {
      const { data } = await api.get(url, { params });
      return data;
    },
  });
}

function getDefaultTimelineParams() {
  const { start, end } = getTimeRange("month", new Date());
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    category: undefined as string | undefined,
    include_drafts: false,
  };
}

export const sidebarPrefetchMap: Record<string, PrefetchFn> = {
  "/": async (queryClient) => {
    await Promise.all([
      prefetchGet(
        queryClient,
        ["dashboard-summary"],
        "/dashboard/summary/",
      ),
      prefetchGet(
        queryClient,
        ["dashboard-upcoming-schedules", 7],
        "/dashboard/upcoming-schedules/",
        { days: "7" },
      ),
      prefetchGet(
        queryClient,
        ["dashboard-attention-items"],
        "/dashboard/attention-items/",
      ),
      prefetchGet(
        queryClient,
        ["dashboard-recent-activity", 20],
        "/dashboard/recent-activity/",
        { limit: "20" },
      ),
    ]);
  },
  "/equipment": async (queryClient) => {
    await Promise.all([
      prefetchGet(
        queryClient,
        ["equipment-models", PAGE_1],
        "/equipment/models/",
        PAGE_1,
      ),
      prefetchGet(
        queryClient,
        ["equipment-items", PAGE_1],
        "/equipment/items/",
        PAGE_1,
      ),
      prefetchGet(
        queryClient,
        ["categories", "tree"],
        "/equipment/categories/tree/",
      ),
    ]);
  },
  "/inventory": async (queryClient) => {
    await Promise.all([
      prefetchGet(
        queryClient,
        ["inventory", "summary"],
        "/equipment/inventory/",
      ),
      prefetchGet(
        queryClient,
        ["inventory", "by-status", undefined],
        "/equipment/inventory/by-status/",
      ),
    ]);
  },
  "/schedules": async (queryClient) => {
    await prefetchGet(
      queryClient,
      ["schedules", PAGE_1],
      "/schedules/",
      PAGE_1,
    );
  },
  "/timeline": async (queryClient) => {
    const timelineParams = getDefaultTimelineParams();
    await Promise.all([
      prefetchGet(
        queryClient,
        ["categories", undefined],
        "/equipment/categories/",
      ),
      queryClient.prefetchQuery({
        queryKey: ["timeline", timelineParams],
        queryFn: async () => {
          const { data } = await api.get("/dashboard/timeline/", {
            params: {
              start: timelineParams.start,
              end: timelineParams.end,
              category: timelineParams.category,
              include_drafts: timelineParams.include_drafts ? "true" : "false",
            },
          });
          return data;
        },
      }),
    ]);
  },
  "/repairs": async (queryClient) => {
    await prefetchGet(
      queryClient,
      ["schedules", { type: "external_repair" }],
      "/schedules/",
      { type: "external_repair" },
    );
  },
  "/rentals": async (queryClient) => {
    await prefetchGet(
      queryClient,
      ["rental-agreements", PAGE_1],
      "/rentals/agreements/",
      PAGE_1,
    );
  },
  "/warehouse": async (queryClient) => {
    await prefetchGet(
      queryClient,
      ["warehouse-transactions", PAGE_1],
      "/warehouse/transactions/",
      PAGE_1,
    );
  },
  "/transfers": async (queryClient) => {
    await prefetchGet(
      queryClient,
      ["transfers", PAGE_1],
      "/transfers/transfers/",
      PAGE_1,
    );
  },
  "/notifications": async (queryClient) => {
    await prefetchGet(
      queryClient,
      ["notifications", PAGE_1],
      "/notifications/",
      PAGE_1,
    );
  },
  "/equipment/custom-fields": async (queryClient) => {
    await Promise.all([
      prefetchGet(
        queryClient,
        ["custom-fields", undefined],
        "/custom-fields/definitions/",
      ),
      prefetchGet(
        queryClient,
        ["categories", "tree"],
        "/equipment/categories/tree/",
      ),
    ]);
  },
  "/admin/users": async (queryClient) => {
    await prefetchGet(
      queryClient,
      ["users", PAGE_1],
      "/users/",
      PAGE_1,
    );
  },
  "/admin/audit-logs": async (queryClient) => {
    await prefetchGet(
      queryClient,
      ["audit-logs", PAGE_1],
      "/audit/",
      PAGE_1,
    );
  },
};
