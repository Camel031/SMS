import { useCallback, useRef } from "react";

export function useTabIntentPrefetch<TTab extends string>(
  prefetch: (tab: TTab) => void | Promise<void>,
  throttleMs = 10_000,
) {
  const lastPrefetchAtRef = useRef<Record<string, number>>({});

  return useCallback(
    (tab: TTab) => {
      const key = String(tab);
      const now = Date.now();
      const last = lastPrefetchAtRef.current[key] ?? 0;
      if (now - last < throttleMs) return;
      lastPrefetchAtRef.current[key] = now;
      void prefetch(tab);
    },
    [prefetch, throttleMs],
  );
}

export function getTabIntentProps<TTab extends string>(
  tab: TTab,
  triggerPrefetch: (tab: TTab) => void,
) {
  return {
    onMouseEnter: () => triggerPrefetch(tab),
    onFocus: () => triggerPrefetch(tab),
  };
}
