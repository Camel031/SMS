import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  BulkTogglePayload,
  PreferenceMatrix,
  PreferenceTogglePayload,
  ResetResponse,
} from "@/types/notification-preferences";

const QUERY_KEY = ["notification-preferences"];

export function useNotificationPreferences() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data } = await api.get<PreferenceMatrix>(
        "/notifications/preferences/",
      );
      return data;
    },
  });
}

export function useTogglePreference() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: PreferenceTogglePayload) => {
      const { data } = await api.patch<PreferenceMatrix>(
        "/notifications/preferences/",
        payload,
      );
      return data;
    },
    onMutate: async (payload) => {
      await qc.cancelQueries({ queryKey: QUERY_KEY });
      const prev = qc.getQueryData<PreferenceMatrix>(QUERY_KEY);
      if (prev) {
        qc.setQueryData<PreferenceMatrix>(QUERY_KEY, {
          ...prev,
          preferences: {
            ...prev.preferences,
            [payload.event_type]: {
              ...prev.preferences[payload.event_type],
              [payload.channel]: payload.is_enabled,
            },
          },
        });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(QUERY_KEY, ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

export function useBulkToggle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: BulkTogglePayload) => {
      const { data } = await api.patch<PreferenceMatrix>(
        "/notifications/preferences/bulk/",
        payload,
      );
      return data;
    },
    onSuccess: (data) => {
      qc.setQueryData(QUERY_KEY, data);
    },
  });
}

export function useResetPreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post<ResetResponse>(
        "/notifications/preferences/reset/",
      );
      return data;
    },
    onSuccess: (data) => {
      const { deleted, ...matrix } = data;
      qc.setQueryData(QUERY_KEY, matrix);
    },
  });
}
