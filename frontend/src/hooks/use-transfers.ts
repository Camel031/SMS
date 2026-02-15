import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  TransferCreatePayload,
  EquipmentTransferList,
  EquipmentTransferDetail,
  PaginatedResponse,
} from "@/types/transfer";

// ─── Transfer Queries ───────────────────────────────────────────────

export function useTransfers(params?: Record<string, string>) {
  return useQuery({
    queryKey: ["transfers", params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<EquipmentTransferList>>(
        "/transfers/transfers/",
        { params },
      );
      return data;
    },
  });
}

export function useTransfer(uuid: string) {
  return useQuery({
    queryKey: ["transfers", uuid],
    queryFn: async () => {
      const { data } = await api.get<EquipmentTransferDetail>(
        `/transfers/transfers/${uuid}/`,
      );
      return data;
    },
    enabled: !!uuid,
  });
}

export function useScheduleTransfers(scheduleUuid: string) {
  return useQuery({
    queryKey: ["schedule-transfers", scheduleUuid],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<EquipmentTransferList>>(
        `/transfers/schedules/${scheduleUuid}/transfers/`,
      );
      return data;
    },
    enabled: !!scheduleUuid,
  });
}

// ─── Transfer Mutations ─────────────────────────────────────────────

export function useCreateTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: TransferCreatePayload) => {
      const { data } = await api.post<EquipmentTransferDetail>(
        "/transfers/transfers/",
        payload,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transfers"] });
      qc.invalidateQueries({ queryKey: ["schedule-transfers"] });
      qc.invalidateQueries({ queryKey: ["schedules"] });
    },
  });
}

export function useExecuteTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ uuid, notes }: { uuid: string; notes?: string }) => {
      const { data } = await api.post<EquipmentTransferDetail>(
        `/transfers/transfers/${uuid}/execute/`,
        { notes },
      );
      return data;
    },
    onSuccess: (_data, { uuid }) => {
      qc.invalidateQueries({ queryKey: ["transfers"] });
      qc.invalidateQueries({ queryKey: ["transfers", uuid] });
      qc.invalidateQueries({ queryKey: ["schedule-transfers"] });
      qc.invalidateQueries({ queryKey: ["schedules"] });
    },
  });
}

export function useConfirmTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ uuid, notes }: { uuid: string; notes?: string }) => {
      const { data } = await api.post<EquipmentTransferDetail>(
        `/transfers/transfers/${uuid}/confirm/`,
        { notes },
      );
      return data;
    },
    onSuccess: (_data, { uuid }) => {
      qc.invalidateQueries({ queryKey: ["transfers"] });
      qc.invalidateQueries({ queryKey: ["transfers", uuid] });
      qc.invalidateQueries({ queryKey: ["schedule-transfers"] });
      qc.invalidateQueries({ queryKey: ["schedules"] });
    },
  });
}

export function useCancelTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ uuid, notes }: { uuid: string; notes?: string }) => {
      const { data } = await api.post<EquipmentTransferDetail>(
        `/transfers/transfers/${uuid}/cancel/`,
        { notes },
      );
      return data;
    },
    onSuccess: (_data, { uuid }) => {
      qc.invalidateQueries({ queryKey: ["transfers"] });
      qc.invalidateQueries({ queryKey: ["transfers", uuid] });
      qc.invalidateQueries({ queryKey: ["schedule-transfers"] });
      qc.invalidateQueries({ queryKey: ["schedules"] });
    },
  });
}
