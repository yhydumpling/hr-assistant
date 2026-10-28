"use client";

import { useCallback, useEffect, useState } from "react";
import type { Workspace } from "@/lib/types";
import { messageOf, request } from "@/lib/api-client";

const EMPTY: Workspace = { jobs: [], candidates: [], interviews: [], activities: [] };

export function useWorkspace() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [workspaceError, setWorkspaceError] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const next = await request<Workspace>("/api/workspace");
      setWorkspace(next);
      setWorkspaceError("");
      return next;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload().catch(error => setWorkspaceError(messageOf(error)));
  }, [reload]);

  const refreshAfterWrite = useCallback(async () => {
    try {
      await reload();
    } catch (error) {
      setWorkspaceError(`操作已保存，但工作台刷新失败：${messageOf(error)} 请点击“刷新”重新读取。`);
    }
  }, [reload]);

  return {
    workspace,
    data: workspace || EMPTY,
    loading,
    workspaceError,
    setWorkspaceError,
    setWorkspace,
    reload,
    refreshAfterWrite
  };
}
