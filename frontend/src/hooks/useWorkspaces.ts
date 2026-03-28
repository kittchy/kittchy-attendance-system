import { useCallback, useEffect, useState } from "react";
import { listWorkspaces } from "../lib/commands";
import type { Workspace } from "../types";

export function useWorkspaces() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const ws = await listWorkspaces();
      setWorkspaces(ws);
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { workspaces, loading, error, refresh };
}
