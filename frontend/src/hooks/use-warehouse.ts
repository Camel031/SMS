import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  CheckOutPayload,
  CheckInPayload,
  WarehouseTransactionList,
  WarehouseTransactionDetail,
  PaginatedResponse,
} from "@/types/warehouse";

// ─── Transactions ────────────────────────────────────────────────────

export function useWarehouseTransactions(params?: Record<string, string>) {
  return useQuery({
    queryKey: ["warehouse-transactions", params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<WarehouseTransactionList>>(
        "/warehouse/transactions/",
        { params },
      );
      return data;
    },
    placeholderData: keepPreviousData,
  });
}

export function useWarehouseTransaction(uuid: string) {
  return useQuery({
    queryKey: ["warehouse-transactions", uuid],
    queryFn: async () => {
      const { data } = await api.get<WarehouseTransactionDetail>(
        `/warehouse/transactions/${uuid}/`,
      );
      return data;
    },
    enabled: !!uuid,
  });
}

export function usePendingConfirmations() {
  return useQuery({
    queryKey: ["warehouse-pending-confirmations"],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<WarehouseTransactionList>>(
        "/warehouse/pending-confirmations/",
      );
      return data;
    },
  });
}

// ─── Check-Out / Check-In ────────────────────────────────────────────

export function useCheckOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CheckOutPayload) => {
      const { data } = await api.post<WarehouseTransactionDetail>(
        "/warehouse/check-out/",
        payload,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["warehouse-transactions"] });
      qc.invalidateQueries({ queryKey: ["warehouse-pending-confirmations"] });
    },
  });
}

export function useCheckIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CheckInPayload) => {
      const { data } = await api.post<WarehouseTransactionDetail>(
        "/warehouse/check-in/",
        payload,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["warehouse-transactions"] });
      qc.invalidateQueries({ queryKey: ["warehouse-pending-confirmations"] });
    },
  });
}

// ─── Transaction Actions ─────────────────────────────────────────────

export function useConfirmTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ uuid, notes }: { uuid: string; notes?: string }) => {
      const { data } = await api.post<WarehouseTransactionDetail>(
        `/warehouse/transactions/${uuid}/confirm/`,
        { notes },
      );
      return data;
    },
    onSuccess: (_data, { uuid }) => {
      qc.invalidateQueries({ queryKey: ["warehouse-transactions"] });
      qc.invalidateQueries({ queryKey: ["warehouse-transactions", uuid] });
      qc.invalidateQueries({ queryKey: ["warehouse-pending-confirmations"] });
    },
  });
}

export function useCancelTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ uuid, notes }: { uuid: string; notes?: string }) => {
      const { data } = await api.post<WarehouseTransactionDetail>(
        `/warehouse/transactions/${uuid}/cancel/`,
        { notes },
      );
      return data;
    },
    onSuccess: (_data, { uuid }) => {
      qc.invalidateQueries({ queryKey: ["warehouse-transactions"] });
      qc.invalidateQueries({ queryKey: ["warehouse-transactions", uuid] });
      qc.invalidateQueries({ queryKey: ["warehouse-pending-confirmations"] });
    },
  });
}
