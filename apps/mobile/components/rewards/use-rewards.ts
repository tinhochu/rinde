import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { fetchRewards, type MyRewards } from "@/lib/receipts";

/**
 * This device's (or account's) rewards, reloaded whenever the screen comes back into view, so a
 * receipt just sent shows up. `failed` means the last load failed and nothing is known yet.
 */
export function useRewards() {
  const [mine, setMine] = useState<MyRewards | null>(null);
  const [failed, setFailed] = useState(false);

  useFocusEffect(useCallback(() => {
    const controller = new AbortController();
    setFailed(false);
    fetchRewards(controller.signal)
      .then(setMine)
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, []));

  return { mine, failed, setMine };
}
