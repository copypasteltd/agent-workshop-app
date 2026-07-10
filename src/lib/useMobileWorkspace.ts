import { useMemo } from "react";
import { listMobileWorkspaceViews, resolveMobileWorkspaceView } from "./workspaceContext";
import { useMobileAuthStore } from "../stores/mobileAuthStore";
import { useMobileUiStore } from "../stores/mobileUiStore";

export function useResolvedMobileWorkspace() {
  const currentWorkspaceId = useMobileUiStore((state) => state.currentWorkspaceId);
  const authMode = useMobileAuthStore((state) => state.authMode);
  const authWorkspaces = useMobileAuthStore((state) => state.workspaces);
  const authCurrentWorkspace = useMobileAuthStore((state) => state.currentWorkspace);

  return useMemo(
    () =>
      resolveMobileWorkspaceView({
        selectionId: currentWorkspaceId,
        workspaces: authMode === "required" ? authWorkspaces : undefined,
        fallbackWorkspaceId: authCurrentWorkspace?.workspaceId,
      }),
    [authCurrentWorkspace?.workspaceId, authMode, authWorkspaces, currentWorkspaceId]
  );
}

export function useAvailableMobileWorkspaces() {
  const authMode = useMobileAuthStore((state) => state.authMode);
  const authWorkspaces = useMobileAuthStore((state) => state.workspaces);

  return useMemo(
    () =>
      listMobileWorkspaceViews(authMode === "required" ? authWorkspaces : undefined),
    [authMode, authWorkspaces]
  );
}
