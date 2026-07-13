import { useMemo } from "react";
import {
  hasAuthoritativeMobileWorkspaceContext,
  listMobileWorkspaceViews,
  resolveMobileWorkspaceView,
} from "./workspaceContext";
import { useMobileAuthStore } from "../stores/mobileAuthStore";
import { useMobileUiStore } from "../stores/mobileUiStore";

export function useResolvedMobileWorkspace() {
  const currentWorkspaceId = useMobileUiStore((state) => state.currentWorkspaceId);
  const authWorkspaces = useMobileAuthStore((state) => state.workspaces);
  const authCurrentWorkspace = useMobileAuthStore((state) => state.currentWorkspace);

  return useMemo(
    () =>
      resolveMobileWorkspaceView({
        selectionId: currentWorkspaceId,
        workspaces: authWorkspaces.length > 0 ? authWorkspaces : undefined,
        fallbackWorkspace: authCurrentWorkspace,
      }),
    [authCurrentWorkspace, authWorkspaces, currentWorkspaceId]
  );
}

export function useAvailableMobileWorkspaces() {
  const currentWorkspace = useResolvedMobileWorkspace();
  const authWorkspaces = useMobileAuthStore((state) => state.workspaces);

  return useMemo(
    () => {
      const authViews = listMobileWorkspaceViews(
        authWorkspaces.length > 0 ? authWorkspaces : undefined
      );
      if (authViews.length > 0) {
        return authViews;
      }

      return hasAuthoritativeMobileWorkspaceContext(currentWorkspace)
        ? [currentWorkspace]
        : [];
    },
    [authWorkspaces, currentWorkspace]
  );
}
