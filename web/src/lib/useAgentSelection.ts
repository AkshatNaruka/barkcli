import { useCallback, useEffect, useState } from "react";
import { fetchProviderModels, fetchProviders, fetchRoles } from "./api";
import type { ProviderStatus, RoleDef } from "./types";
import { readLocal, writeLocal } from "./drafts";

export interface AgentChoice { backend: string; model: string; role: string; testCommand: string; }
export function useAgentSelection(scope: string) {
  const key = `bark:agent:v1:${scope}`;
  const [backend, changeBackend] = useState(() => {
    try { return JSON.parse(readLocal(key) || "{}").backend || ""; } catch { return ""; }
  });
  const [model, changeModel] = useState(() => {
    try { return JSON.parse(readLocal(key) || "{}").model || ""; } catch { return ""; }
  });
  const [role, setRole] = useState(() => { try { return JSON.parse(readLocal(key) || "{}").role || "builder"; } catch { return "builder"; } });
  const [testCommand, setTestCommand] = useState(() => { try { return JSON.parse(readLocal(key) || "{}").testCommand || ""; } catch { return ""; } });
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [roles, setRoles] = useState<RoleDef[]>([]);
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchProviders(), fetchRoles()]).then(([all, nextRoles]) => {
      if (cancelled) return;
      const visible = all.filter((provider) => !["fake", "human"].includes(provider.id));
      setProviders(visible); setRoles(nextRoles);
      // Only a first-time user gets a default. A saved unavailable choice stays
      // selected so changing providers is always a deliberate action.
      changeBackend((current: string) => current || visible.find((provider) => provider.available && provider.authenticated !== false)?.id || "");
    }).catch(() => { if (!cancelled) setProviders([]); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [refresh]);
  useEffect(() => {
    let cancelled = false;
    setModelOptions([]);
    if (backend) void fetchProviderModels(backend).then((options) => { if (!cancelled) setModelOptions(options); }).catch(() => {});
    return () => { cancelled = true; };
  }, [backend]);
  const setBackend = useCallback((value: string) => {
    changeBackend(value); changeModel(""); writeLocal(key, JSON.stringify({ backend: value, model: "" }));
  }, [key]);
  const setModel = useCallback((value: string) => {
    changeModel(value); writeLocal(key, JSON.stringify({ backend, model: value }));
  }, [backend, key]);
  const restoreChoice = (provider: string, selectedModel: string) => { changeBackend(provider); changeModel(selectedModel); };
  useEffect(() => { if (!loading && backend) writeLocal(key, JSON.stringify({ backend, model, role, testCommand })); }, [key, backend, model, role, testCommand, loading]);
  const selected = providers.find((provider) => provider.id === backend);
  const ready = Boolean(selected?.available && selected.authenticated !== false);
  const readiness = loading ? "Checking agents…" : !selected?.available ? "Choose an installed agent" : selected.authenticated === false ? "Sign-in needed" : selected.authenticated === true ? "Ready" : "Installed; sign-in not confirmed";
  return { backend, setBackend, model, setModel, restoreChoice, role, setRole, testCommand, setTestCommand, providers, roles, modelOptions, loading, ready, readiness, selected,
    recheck: () => setRefresh((value) => value + 1), choice: { backend, model, role, testCommand } as AgentChoice };
}
export type AgentSelection = ReturnType<typeof useAgentSelection>;
