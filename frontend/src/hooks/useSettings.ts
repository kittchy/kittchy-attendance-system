import { useCallback, useEffect, useState } from "react";
import { getSettings, updateSetting } from "../lib/commands";

export function useSettings() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const s = await getSettings();
      setSettings(s);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const saveSetting = useCallback(
    async (key: string, value: string) => {
      await updateSetting(key, value);
      setSettings((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  return { settings, loading, saveSetting, refresh };
}
