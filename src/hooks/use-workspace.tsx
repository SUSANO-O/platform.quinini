'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '@/hooks/use-auth';
import { initialsFromName, workspaceColorClass } from '@/lib/flow-editor/geometry';

export interface WorkspaceItem {
  id: string;
  name: string;
  role: string;
  initials: string;
  colorClass: string;
  kind: 'personal' | 'org';
}

const STORAGE_KEY = 'afhub_active_workspace';

type WorkspaceContextValue = {
  workspaces: WorkspaceItem[];
  activeWorkspaceId: string | null;
  activeWorkspace: WorkspaceItem | null;
  loading: boolean;
  switchWorkspace: (id: string) => void;
  refreshWorkspaces: () => Promise<void>;
  createOrgWorkspace: (name: string) => Promise<{ ok: boolean; error?: string }>;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function personalId(userId: string) {
  return `personal:${userId}`;
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshWorkspaces = useCallback(async () => {
    if (!user?.uid) {
      setWorkspaces([]);
      setActiveWorkspaceId(null);
      setLoading(false);
      return;
    }

    const displayName = user.displayName || user.email?.split('@')[0] || 'Mi cuenta';
    const personal: WorkspaceItem = {
      id: personalId(user.uid),
      name: `${displayName}'s Workspace`,
      role: 'Owner',
      initials: initialsFromName(displayName),
      colorClass: workspaceColorClass(personalId(user.uid)),
      kind: 'personal',
    };

    let orgWs: WorkspaceItem | null = null;
    try {
      const res = await fetch('/api/org', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json() as { org: { id: string; name: string; myRole: string } | null };
        if (data.org) {
          orgWs = {
            id: `org:${data.org.id}`,
            name: data.org.name,
            role: data.org.myRole,
            initials: initialsFromName(data.org.name),
            colorClass: workspaceColorClass(`org:${data.org.id}`),
            kind: 'org',
          };
        }
      }
    } catch {
      /* sin org */
    }

    const list = orgWs ? [personal, orgWs] : [personal];
    setWorkspaces(list);

    const stored = (() => {
      try {
        return localStorage.getItem(STORAGE_KEY);
      } catch {
        return null;
      }
    })();

    const validStored = stored && list.some((w) => w.id === stored) ? stored : personal.id;
    setActiveWorkspaceId(validStored);
    setLoading(false);
  }, [user?.uid, user?.displayName, user?.email]);

  useEffect(() => {
    void refreshWorkspaces();
  }, [refreshWorkspaces]);

  const switchWorkspace = useCallback((id: string) => {
    setActiveWorkspaceId(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* noop */
    }
  }, []);

  const createOrgWorkspace = useCallback(async (name: string) => {
    const res = await fetch('/api/org', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const data = await res.json() as { error?: string };
    if (!res.ok) return { ok: false, error: data.error || 'No se pudo crear el workspace.' };
    await refreshWorkspaces();
    return { ok: true };
  }, [refreshWorkspaces]);

  const activeWorkspace = useMemo(
    () => workspaces.find((w) => w.id === activeWorkspaceId) ?? workspaces[0] ?? null,
    [workspaces, activeWorkspaceId],
  );

  const value = useMemo(
    () => ({
      workspaces,
      activeWorkspaceId,
      activeWorkspace,
      loading,
      switchWorkspace,
      refreshWorkspaces,
      createOrgWorkspace,
    }),
    [workspaces, activeWorkspaceId, activeWorkspace, loading, switchWorkspace, refreshWorkspaces, createOrgWorkspace],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace debe usarse dentro de WorkspaceProvider');
  return ctx;
}
