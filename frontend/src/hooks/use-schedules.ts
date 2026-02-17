import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  AvailabilityCheckRequest,
  AvailabilityCheckResponse,
  CheckoutRecordItem,
  ModelAvailability,
  PaginatedResponse,
  ScheduleDetail,
  ScheduleEquipmentFormData,
  ScheduleEquipmentItem,
  ScheduleFormData,
  ScheduleListItem,
} from "@/types/schedule";

// ─── Schedule CRUD ──────────────────────────────────────────────────

export function useSchedules(params?: Record<string, string>) {
  return useQuery({
    queryKey: ["schedules", params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<ScheduleListItem>>(
        "/schedules/",
        { params },
      );
      return data;
    },
    placeholderData: keepPreviousData,
  });
}

export function useSchedule(uuid: string) {
  return useQuery({
    queryKey: ["schedules", uuid],
    queryFn: async () => {
      const { data } = await api.get<ScheduleDetail>(
        `/schedules/${uuid}/`,
      );
      return data;
    },
    enabled: !!uuid,
  });
}

export function useCreateSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: ScheduleFormData) => {
      const { data } = await api.post<ScheduleDetail>(
        "/schedules/",
        payload,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedules"] });
    },
  });
}

export function useUpdateSchedule(uuid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<ScheduleFormData>) => {
      const { data } = await api.patch<ScheduleDetail>(
        `/schedules/${uuid}/`,
        payload,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedules"] });
      qc.invalidateQueries({ queryKey: ["schedules", uuid] });
    },
  });
}

export function useDeleteSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (uuid: string) => {
      await api.delete(`/schedules/${uuid}/`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedules"] });
    },
  });
}

// ─── Status Actions ─────────────────────────────────────────────────

export function useConfirmSchedule(uuid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post<ScheduleDetail>(
        `/schedules/${uuid}/confirm/`,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedules"] });
      qc.invalidateQueries({ queryKey: ["schedules", uuid] });
    },
  });
}

export function useCompleteSchedule(uuid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post<ScheduleDetail>(
        `/schedules/${uuid}/complete/`,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedules"] });
      qc.invalidateQueries({ queryKey: ["schedules", uuid] });
    },
  });
}

export function useCancelSchedule(uuid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      reason?: string;
      force?: boolean;
      notes?: string;
    }) => {
      const { data } = await api.post<ScheduleDetail>(
        `/schedules/${uuid}/cancel/`,
        payload,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedules"] });
      qc.invalidateQueries({ queryKey: ["schedules", uuid] });
    },
  });
}

export function useReopenSchedule(uuid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post<ScheduleDetail>(
        `/schedules/${uuid}/reopen/`,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedules"] });
      qc.invalidateQueries({ queryKey: ["schedules", uuid] });
    },
  });
}

// ─── Equipment Allocations ──────────────────────────────────────────

export function useScheduleEquipment(scheduleUuid: string) {
  return useQuery({
    queryKey: ["schedule-equipment", scheduleUuid],
    queryFn: async () => {
      const { data } = await api.get<ScheduleEquipmentItem[]>(
        `/schedules/${scheduleUuid}/equipment/`,
      );
      return data;
    },
    enabled: !!scheduleUuid,
  });
}

export function useAddScheduleEquipment(scheduleUuid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: ScheduleEquipmentFormData) => {
      const { data } = await api.post<ScheduleEquipmentItem>(
        `/schedules/${scheduleUuid}/equipment/`,
        payload,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedule-equipment", scheduleUuid] });
      qc.invalidateQueries({ queryKey: ["schedules", scheduleUuid] });
    },
  });
}

export function useUpdateScheduleEquipment(scheduleUuid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      pk,
      payload,
    }: {
      pk: number;
      payload: Partial<ScheduleEquipmentFormData>;
    }) => {
      const { data } = await api.patch<ScheduleEquipmentItem>(
        `/schedules/${scheduleUuid}/equipment/${pk}/`,
        payload,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedule-equipment", scheduleUuid] });
      qc.invalidateQueries({ queryKey: ["schedules", scheduleUuid] });
    },
  });
}

export function useDeleteScheduleEquipment(scheduleUuid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (pk: number) => {
      await api.delete(`/schedules/${scheduleUuid}/equipment/${pk}/`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedule-equipment", scheduleUuid] });
      qc.invalidateQueries({ queryKey: ["schedules", scheduleUuid] });
    },
  });
}

// ─── Dispatch Events ────────────────────────────────────────────────

export function useDispatchEvents(scheduleUuid: string) {
  return useQuery({
    queryKey: ["dispatch-events", scheduleUuid],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<ScheduleListItem>>(
        `/schedules/${scheduleUuid}/dispatches/`,
      );
      return data;
    },
    enabled: !!scheduleUuid,
  });
}

export function useCreateDispatchEvent(scheduleUuid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: ScheduleFormData) => {
      const { data } = await api.post<ScheduleDetail>(
        `/schedules/${scheduleUuid}/dispatches/`,
        payload,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dispatch-events", scheduleUuid] });
      qc.invalidateQueries({ queryKey: ["schedules", scheduleUuid] });
      qc.invalidateQueries({ queryKey: ["schedules"] });
    },
  });
}

// ─── Availability ───────────────────────────────────────────────────

export function useModelAvailability(
  modelUuid: string,
  start: string,
  end: string,
) {
  return useQuery({
    queryKey: ["model-availability", modelUuid, start, end],
    queryFn: async () => {
      const { data } = await api.get<ModelAvailability>(
        `/equipment/models/${modelUuid}/availability/`,
        { params: { start, end } },
      );
      return data;
    },
    enabled: !!modelUuid && !!start && !!end,
  });
}

export function useCheckAvailability() {
  return useMutation({
    mutationFn: async (payload: AvailabilityCheckRequest) => {
      const { data } = await api.post<AvailabilityCheckResponse>(
        "/schedules/check-availability/",
        payload,
      );
      return data;
    },
  });
}

// ─── Item Schedule Queries ──────────────────────────────────────────

export function useItemRepairHistory(itemUuid: string) {
  return useQuery({
    queryKey: ["equipment-items", itemUuid, "repairs"],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<ScheduleListItem>>(
        "/schedules/",
        { params: { equipment_item: itemUuid, type: "external_repair" } },
      );
      return data;
    },
    enabled: !!itemUuid,
  });
}

export function useItemSchedules(itemUuid: string) {
  return useQuery({
    queryKey: ["equipment-items", itemUuid, "schedules"],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<ScheduleListItem>>(
        "/schedules/",
        {
          params: {
            equipment_item: itemUuid,
            start: new Date().toISOString(),
          },
        },
      );
      return data;
    },
    enabled: !!itemUuid,
  });
}

// ─── Checkout Records ──────────────────────────────────────────────

export function useScheduleCheckoutRecords(scheduleUuid: string) {
  return useQuery({
    queryKey: ["schedule-checkout-records", scheduleUuid],
    queryFn: async () => {
      const { data } = await api.get<CheckoutRecordItem[]>(
        `/schedules/${scheduleUuid}/checkout-records/`,
      );
      return data;
    },
    enabled: !!scheduleUuid,
  });
}
