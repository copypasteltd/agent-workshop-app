import type { PropsWithChildren } from "react";
import type {
  AuthDisabledSessionBootstrap,
  AuthSessionEnvelope,
} from "@lingban/contracts";
import { useEffect, useRef } from "react";
import { View } from "@tarojs/components";
import { mobileApiBaseUrl, mobileAuthFetch } from "../lib/api";
import { inferMobileWorkspaceContextKey } from "../lib/workspaceContext";
import { useMobileAuthStore } from "../stores/mobileAuthStore";
import { useMobileUiStore } from "../stores/mobileUiStore";
import { MobileAuthScreen } from "./MobileAuthScreen";

const mobileE2eAuthMode = process.env.TARO_APP_E2E_AUTH_MODE?.trim();

function isAuthDisabledPayload(value: unknown): value is { authMode: "disabled" } {
  return (
    typeof value === "object" &&
    value !== null &&
    "authMode" in value &&
    (value as { authMode?: unknown }).authMode === "disabled"
  );
}

function isAuthDisabledSessionBootstrap(
  value: unknown
): value is AuthDisabledSessionBootstrap {
  return (
    isAuthDisabledPayload(value) &&
    typeof value === "object" &&
    value !== null &&
    "currentWorkspace" in value &&
    "workspaces" in value &&
    Array.isArray((value as { workspaces?: unknown }).workspaces)
  );
}

function isAuthSessionEnvelope(value: unknown): value is AuthSessionEnvelope {
  return (
    typeof value === "object" &&
    value !== null &&
    "user" in value &&
    "session" in value &&
    "currentWorkspace" in value &&
    "workspaces" in value
  );
}

type BootstrapWorkspace =
  | AuthSessionEnvelope["currentWorkspace"]
  | AuthDisabledSessionBootstrap["currentWorkspace"];

function isPublicWorkspace(
  workspace: BootstrapWorkspace
): workspace is AuthDisabledSessionBootstrap["currentWorkspace"] {
  return "runtimeWorkspaceId" in workspace && "displayName" in workspace;
}

function matchesWorkspaceSelection(workspace: BootstrapWorkspace, selectionId: string) {
  if (isPublicWorkspace(workspace)) {
    return (
      workspace.contextKey === selectionId ||
      workspace.runtimeWorkspaceId === selectionId
    );
  }

  return (
    workspace.workspaceId === selectionId ||
    workspace.contextKey === selectionId ||
    inferMobileWorkspaceContextKey({
      workspaceId: workspace.workspaceId,
      slug: workspace.slug,
      name: workspace.name,
      type: workspace.type,
    }) === selectionId
  );
}

function toWorkspaceSelectionId(workspace: BootstrapWorkspace) {
  return isPublicWorkspace(workspace) ? workspace.contextKey : workspace.workspaceId;
}

function syncWorkspaceSelection(
  envelope: AuthSessionEnvelope | AuthDisabledSessionBootstrap
) {
  const uiStore = useMobileUiStore.getState();
  const storedSelectionId = uiStore.currentWorkspaceId;

  const matchedWorkspace =
    envelope.workspaces.find(
      (workspace) => matchesWorkspaceSelection(workspace, storedSelectionId)
    ) ?? envelope.currentWorkspace;

  const nextSelectionId = toWorkspaceSelectionId(matchedWorkspace);
  if (nextSelectionId !== storedSelectionId) {
    uiStore.setCurrentWorkspaceId(nextSelectionId);
  }
}

export function MobileAuthGate({ children }: PropsWithChildren) {
  const startedRef = useRef(false);
  const authMode = useMobileAuthStore((state) => state.authMode);
  const authenticated = useMobileAuthStore((state) => state.authenticated);
  const bootstrapping = useMobileAuthStore((state) => state.bootstrapping);

  useEffect(() => {
    if (startedRef.current) {
      return;
    }

    startedRef.current = true;
    let cancelled = false;

    const bootstrap = async () => {
      const authStore = useMobileAuthStore.getState();

      authStore.setBootstrapping(true);

      if (mobileE2eAuthMode === "disabled") {
        authStore.clearAuth();
        authStore.setAuthMode("disabled");
        authStore.setBootstrapping(false);
        return;
      }

      try {
        const response = await mobileAuthFetch(`${mobileApiBaseUrl}/v1/auth/session`);

        const payload = (await response.json().catch(() => null)) as unknown;

        if (cancelled) {
          return;
        }

        if (response.ok && isAuthDisabledSessionBootstrap(payload)) {
          authStore.applyPublicWorkspaceBootstrap(payload);
          syncWorkspaceSelection(payload);
          return;
        }

        if (response.ok && isAuthDisabledPayload(payload)) {
          authStore.clearAuth();
          authStore.setAuthMode("disabled");
          authStore.setBootstrapping(false);
          return;
        }

        if (response.ok && isAuthSessionEnvelope(payload)) {
          authStore.applySessionEnvelope(payload);
          syncWorkspaceSelection(payload);
          return;
        }

        authStore.setAuthMode("required");
        authStore.clearAuth();
      } catch (error) {
        if (cancelled) {
          return;
        }

        authStore.setAuthMode("required");
        authStore.clearAuth(
          error instanceof Error ? error.message : "Failed to bootstrap mobile auth."
        );
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      {children}
      {bootstrapping || authMode === "unknown" ? (
        <View className="auth-screen-overlay">
          <View className="page-shell auth-screen-shell">
            <View className="page auth-screen-page active">
              <View className="hero-card auth-screen-card">
                <View className="page-eyebrow">灵办词元 / 会话恢复</View>
                <View className="section-title">正在恢复当前工作区</View>
                <View className="section-copy">
                  正在检查令牌状态、当前空间和可见工坊。恢复完成后会继续回到你上次的移动端工作现场。
                </View>
              </View>
            </View>
          </View>
        </View>
      ) : null}
      {authMode !== "disabled" && !authenticated && !bootstrapping ? (
        <MobileAuthScreen />
      ) : null}
    </>
  );
}
