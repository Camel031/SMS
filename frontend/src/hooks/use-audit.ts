import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AuditLog, PaginatedResponse } from "@/types/audit";

export function useAuditLogs(params?: Record<string, string>) {
  return useQuery({
    queryKey: ["audit-logs", params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<AuditLog>>(
        "/audit/",
        { params },
      );
      return data;
    },
  });
}

export function useEntityAuditLogs(entityType: string, entityUuid: string) {
  return useQuery({
    queryKey: ["entity-audit-logs", entityType, entityUuid],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<AuditLog>>(
        `/audit/${entityType}/${entityUuid}/`,
      );
      return data;
    },
    enabled: !!entityType && !!entityUuid,
  });
}
