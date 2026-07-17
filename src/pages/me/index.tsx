import type { NotificationRecord } from "@lingban/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Image, Input, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useMemo, useState } from "react";
import logoMark from "../../assets/logo-ui.png";
import {
  mobileAuthApi,
  mobileBillingApi,
  mobileMeApi,
  mobileNotificationsApi,
  mobileQuotaApi,
} from "../../lib/api";
import {
  billingCostBasisLabel,
  billingSourceLabel,
  billingSourceTone,
  formatBillingQuantity,
  formatBillingUsd,
} from "../../lib/billing";
import { buildMobileServiceCapabilityEntries } from "../../lib/catalog";
import {
  describeQuotaUsage,
  latestQuotaEventNote,
  quotaDecisionLabel,
  quotaDecisionTone,
  quotaMetricLabel,
  quotaOverrideStatusLabel,
  quotaUsageRatio,
  quotaWindowLabel,
} from "../../lib/quota";
import {
  useAvailableMobileWorkspaces,
  useResolvedMobileWorkspace,
} from "../../lib/useMobileWorkspace";
import { useMobileWorkspaceCatalog } from "../../lib/useMobileWorkspaceCatalog";
import { useMobileAuthStore } from "../../stores/mobileAuthStore";
import { useMobileUiStore } from "../../stores/mobileUiStore";

function toWorkspaceRoleLabel(role: string) {
  switch (role) {
    case "owner":
      return "所有者";
    case "admin":
      return "管理员";
    case "operator":
      return "操作员";
    case "creator":
      return "创作者";
    case "viewer":
      return "查看者";
    default:
      return role;
  }
}

function toWorkspaceMembershipStatusLabel(status: string) {
  switch (status) {
    case "active":
      return "生效中";
    case "suspended":
      return "已暂停";
    default:
      return status;
  }
}

function toWorkspaceInvitationStatusLabel(status: string) {
  switch (status) {
    case "pending":
      return "待接受";
    case "accepted":
      return "已接受";
    case "revoked":
      return "已撤销";
    case "expired":
      return "已过期";
    default:
      return status;
  }
}

function workspaceRolePriority(role: string) {
  switch (role) {
    case "owner":
      return 0;
    case "admin":
      return 1;
    case "creator":
      return 2;
    case "operator":
      return 3;
    case "viewer":
      return 4;
    default:
      return 5;
  }
}

function formatBillingTime(value: string | null) {
  if (!value) {
    return "暂无活动";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatWorkspaceTime(value: string | null) {
  if (!value) {
    return "未设置";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function pickLocalizedText(value: { zh: string; en: string }) {
  return value.zh || value.en;
}

function buildMobileNoticeRoute(notice: NotificationRecord) {
  if (notice.target.resource !== "run") {
    return undefined;
  }

  if (notice.target.view === "files") {
    return `/pages/tasks/files?id=${encodeURIComponent(notice.target.runId)}`;
  }

  return `/pages/tasks/detail?id=${encodeURIComponent(notice.target.runId)}`;
}

function buildMobileAssetRoute(target: {
  resource: "run" | "workspace";
  runId?: string;
  view: string;
  anchorType?: string | null;
  anchorRefId?: string | null;
}) {
  if (target.resource !== "run" || !target.runId) {
    return undefined;
  }

  if (target.view === "files") {
    const nextPath =
      target.anchorType === "file" && target.anchorRefId
        ? `&path=${encodeURIComponent(target.anchorRefId)}`
        : "";
    return `/pages/tasks/files?id=${encodeURIComponent(target.runId)}${nextPath}`;
  }

  return `/pages/tasks/detail?id=${encodeURIComponent(target.runId)}`;
}

function buildMobileFavoriteRoute(target: {
  resource: "workshop";
  workshopId: string;
  view: "detail";
}) {
  if (target.resource !== "workshop") {
    return undefined;
  }

  return `/pages/workshops/detail?id=${encodeURIComponent(target.workshopId)}`;
}

export default function MePage() {
  const queryClient = useQueryClient();
  const theme = useMobileUiStore((state) => state.theme);
  const workspaceSheetOpen = useMobileUiStore((state) => state.workspaceSheetOpen);
  const toggleTheme = useMobileUiStore((state) => state.toggleTheme);
  const setCurrentWorkspaceId = useMobileUiStore((state) => state.setCurrentWorkspaceId);
  const setWorkspaceSheetOpen = useMobileUiStore((state) => state.setWorkspaceSheetOpen);
  const authMode = useMobileAuthStore((state) => state.authMode);
  const authenticated = useMobileAuthStore((state) => state.authenticated);
  const tokens = useMobileAuthStore((state) => state.tokens);
  const user = useMobileAuthStore((state) => state.user);
  const applySessionResponse = useMobileAuthStore(
    (state) => state.applySessionResponse
  );
  const applySessionEnvelope = useMobileAuthStore(
    (state) => state.applySessionEnvelope
  );
  const clearAuth = useMobileAuthStore((state) => state.clearAuth);
  const currentWorkspace = useResolvedMobileWorkspace();
  const workspaceOptions = useAvailableMobileWorkspaces();
  const [invitationTokenDrafts, setInvitationTokenDrafts] = useState<
    Record<string, string>
  >({});
  const authDataEnabled =
    authMode === "required" && authenticated && currentWorkspace.source === "auth";
  const { liveTasks, metrics, taskDataMode, visibleServices } =
    useMobileWorkspaceCatalog(currentWorkspace);
  const summaryTasks = taskDataMode === "live" ? liveTasks : [];

  const meSummaryQuery = useQuery({
    queryKey: ["mobile", "me", "summary", currentWorkspace.selectionId, currentWorkspace.id],
    queryFn: async () => {
      try {
        return await mobileMeApi.getSummary();
      } catch {
        return null;
      }
    },
    enabled: authDataEnabled,
    retry: false,
    staleTime: 30_000,
  });

  const meAssetsQuery = useQuery({
    queryKey: ["mobile", "me", "assets", currentWorkspace.selectionId, currentWorkspace.id],
    queryFn: async () => {
      try {
        return await mobileMeApi.listAssets({
          limit: 6,
        });
      } catch {
        return null;
      }
    },
    enabled: authDataEnabled,
    retry: false,
    staleTime: 30_000,
  });

  const meFavoritesQuery = useQuery({
    queryKey: ["mobile", "me", "favorites", currentWorkspace.selectionId, currentWorkspace.id],
    queryFn: async () => {
      try {
        return await mobileMeApi.listFavoriteWorkshops({
          limit: 6,
        });
      } catch {
        return null;
      }
    },
    enabled: authDataEnabled,
    retry: false,
    staleTime: 30_000,
  });

  const meAuthorizationsQuery = useQuery({
    queryKey: [
      "mobile",
      "me",
      "authorizations",
      currentWorkspace.selectionId,
      currentWorkspace.id,
    ],
    queryFn: async () => {
      try {
        return await mobileMeApi.getAuthorizationSummary({
          limit: 8,
        });
      } catch {
        return null;
      }
    },
    enabled: authDataEnabled,
    retry: false,
    staleTime: 30_000,
  });

  const quotaPoliciesQuery = useQuery({
    queryKey: ["mobile", "quotas", "policies", currentWorkspace.selectionId, currentWorkspace.id],
    queryFn: async () => {
      try {
        return await mobileQuotaApi.listPolicies({
          workspaceContextKey: currentWorkspace.id,
        });
      } catch {
        return [];
      }
    },
    enabled: authDataEnabled,
    retry: false,
    staleTime: 30_000,
  });

  const quotaCountersQuery = useQuery({
    queryKey: ["mobile", "quotas", "counters", currentWorkspace.selectionId, currentWorkspace.id],
    queryFn: async () => {
      try {
        return await mobileQuotaApi.listCounters({
          workspaceContextKey: currentWorkspace.id,
        });
      } catch {
        return [];
      }
    },
    enabled: authDataEnabled,
    retry: false,
    staleTime: 30_000,
  });

  const quotaEventsQuery = useQuery({
    queryKey: ["mobile", "quotas", "events", currentWorkspace.selectionId, currentWorkspace.id],
    queryFn: async () => {
      try {
        return await mobileQuotaApi.listEvents({
          workspaceContextKey: currentWorkspace.id,
        });
      } catch {
        return [];
      }
    },
    enabled: authDataEnabled,
    retry: false,
    staleTime: 30_000,
  });

  const quotaOverridesQuery = useQuery({
    queryKey: ["mobile", "quotas", "overrides", currentWorkspace.selectionId, currentWorkspace.id],
    queryFn: async () => {
      try {
        return await mobileQuotaApi.listOverrides({
          workspaceContextKey: currentWorkspace.id,
        });
      } catch {
        return [];
      }
    },
    enabled: authDataEnabled,
    retry: false,
    staleTime: 30_000,
  });
  const billingSummaryQuery = useQuery({
    queryKey: ["mobile", "billing", "summary", currentWorkspace.selectionId, currentWorkspace.id],
    queryFn: async () => {
      try {
        return await mobileBillingApi.getSummary({
          workspaceContextKey: currentWorkspace.id,
        });
      } catch {
        return null;
      }
    },
    enabled: authDataEnabled,
    retry: false,
    staleTime: 30_000,
  });

  const billingEntriesQuery = useQuery({
    queryKey: ["mobile", "billing", "entries", currentWorkspace.selectionId, currentWorkspace.id],
    queryFn: async () => {
      try {
        return await mobileBillingApi.listEntries({
          workspaceContextKey: currentWorkspace.id,
        });
      } catch {
        return [];
      }
    },
    enabled: authDataEnabled,
    retry: false,
    staleTime: 30_000,
  });

  const workspaceMembersQuery = useQuery({
    queryKey: [
      "mobile",
      "workspace-members",
      currentWorkspace.selectionId,
      currentWorkspace.runtimeWorkspaceId,
    ],
    queryFn: async () => {
      try {
        return await mobileAuthApi.listWorkspaceMembers(currentWorkspace.runtimeWorkspaceId);
      } catch {
        return [];
      }
    },
    enabled: authDataEnabled,
    retry: false,
    staleTime: 30_000,
  });

  const myInvitationsQuery = useQuery({
    queryKey: ["mobile", "workspace-invitations", user?.userId ?? "anonymous"],
    queryFn: async () => {
      try {
        return await mobileAuthApi.listMyInvitations();
      } catch {
        return [];
      }
    },
    enabled: authMode === "required" && authenticated,
    retry: false,
    staleTime: 30_000,
  });
  const notificationsQuery = useQuery({
    queryKey: [
      "mobile",
      "notifications",
      currentWorkspace.selectionId,
      currentWorkspace.id,
    ],
    queryFn: async () => {
      try {
        return await mobileNotificationsApi.listNotifications({
          limit: 6,
        });
      } catch {
        return [];
      }
    },
    enabled: authDataEnabled,
    retry: false,
    staleTime: 15_000,
    refetchInterval: 15_000,
  });
  const notificationSummaryQuery = useQuery({
    queryKey: [
      "mobile",
      "notifications",
      "summary",
      currentWorkspace.selectionId,
      currentWorkspace.id,
    ],
    queryFn: async () => {
      try {
        return await mobileNotificationsApi.getNotificationSummary();
      } catch {
        return null;
      }
    },
    enabled: authDataEnabled,
    retry: false,
    staleTime: 15_000,
    refetchInterval: 15_000,
  });
  const governanceLoading =
    authDataEnabled &&
    (
      meSummaryQuery.isLoading ||
      meAssetsQuery.isLoading ||
      meFavoritesQuery.isLoading ||
      meAuthorizationsQuery.isLoading ||
      quotaPoliciesQuery.isLoading ||
      quotaCountersQuery.isLoading ||
      quotaEventsQuery.isLoading ||
      quotaOverridesQuery.isLoading ||
      billingSummaryQuery.isLoading ||
      billingEntriesQuery.isLoading ||
      workspaceMembersQuery.isLoading
    );
  const visibleTaskSummary =
    taskDataMode === "live"
      ? `${summaryTasks.length} 个可继续任务`
      : authDataEnabled
        ? "等待真实任务同步"
        : "当前暂无可继续任务";

  const normalizedVisibleTaskSummary =
    taskDataMode === "empty"
      ? "当前没有可继续的实例"
      : visibleTaskSummary;

  const switchWorkspaceMutation = useMutation({
    mutationFn: async (selectionId: string) => {
      if (authMode === "required" && authenticated) {
        return await mobileAuthApi.switchWorkspace({
          workspaceId: selectionId,
        });
      }

      return selectionId;
    },
    onSuccess: async (result) => {
      if (typeof result === "string") {
        setCurrentWorkspaceId(result);
      } else {
        applySessionResponse(result);
        setCurrentWorkspaceId(result.currentWorkspace.workspaceId);
      }

      setWorkspaceSheetOpen(false);
      await queryClient.removeQueries({
        queryKey: ["mobile"],
      });
    },
    onError: () => {
      Taro.showToast({
        title: "切换工作区失败",
        icon: "none",
      });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      if (authMode === "required" && authenticated) {
        await mobileAuthApi.logout({
          refreshToken: tokens?.refreshToken,
        });
      }
    },
    onSuccess: async () => {
      clearAuth();
      setWorkspaceSheetOpen(false);
      await queryClient.removeQueries({
        queryKey: ["mobile"],
      });
    },
    onError: () => {
      clearAuth("当前会话已失效，请重新登录。");
    },
  });

  const acceptInvitationMutation = useMutation({
    mutationFn: async (input: {
      invitationId: string;
      workspaceId: string;
      acceptToken: string;
    }) => {
      const accepted = await mobileAuthApi.acceptWorkspaceInvitation(input.invitationId, {
        acceptToken: input.acceptToken,
      });

      try {
        const switched = await mobileAuthApi.switchWorkspace({
          workspaceId: input.workspaceId,
        });
        return {
          accepted,
          switched,
        };
      } catch {
        return {
          accepted,
          switched: null,
        };
      }
    },
    onSuccess: async (result) => {
      const acceptedWorkspaceId = result.accepted.invitation.workspace.workspaceId;
      if (result.switched) {
        applySessionResponse(result.switched);
        setCurrentWorkspaceId(result.switched.currentWorkspace.workspaceId);
      } else {
        applySessionEnvelope(result.accepted.session);
        setCurrentWorkspaceId(acceptedWorkspaceId);
      }

      setInvitationTokenDrafts((current) => {
        const next = { ...current };
        delete next[result.accepted.invitation.invitation.invitationId];
        return next;
      });

      await queryClient.invalidateQueries({
        queryKey: ["mobile"],
      });

      Taro.showToast({
        title: result.switched ? "已加入并切换工作区" : "已加入工作区",
        icon: "success",
      });
    },
    onError: (error) => {
      const message =
        error instanceof Error && error.message
          ? error.message
          : "接受邀请失败，请检查 token 后重试";
      Taro.showToast({
        title: message,
        icon: "none",
      });
    },
  });

  const assetEntries = useMemo(() => {
    if (authDataEnabled && meAssetsQuery.data) {
      return meAssetsQuery.data.items.map((item) => ({
        key: item.assetId,
        title: item.title,
        meta: pickLocalizedText(item.sourceSummary),
        route: buildMobileAssetRoute(item.target),
      }));
    }

    const entries = summaryTasks.flatMap((task) =>
      task.files.map((file) => ({
        key: `${task.id}:${file.path}`,
        title: file.name,
        meta: `${task.title} / ${file.helper}`,
        priority:
          file.status === "结果" || file.status === "完成" || file.status === "output"
            ? 0
            : file.status === "archive"
              ? 2
              : 1,
      }))
    );

    return entries
      .sort((left, right) => left.priority - right.priority)
      .slice(0, 4)
      .map(({ key, title, meta }) => ({ key, title, meta, route: undefined }));
  }, [authDataEnabled, meAssetsQuery.data, summaryTasks]);

  const favoriteEntries = useMemo(() => {
    if (authDataEnabled && meFavoritesQuery.data) {
      return meFavoritesQuery.data.items.map((item) => ({
        key: item.favoriteId,
        title: pickLocalizedText(item.title),
        meta: `${pickLocalizedText(item.badge)} / ${pickLocalizedText(item.summary)}`,
        route: buildMobileFavoriteRoute(item.target),
      }));
    }

    return [];
  }, [authDataEnabled, meFavoritesQuery.data]);

  const authEntries = useMemo(() => {
    if (authDataEnabled && meAuthorizationsQuery.data) {
      return meAuthorizationsQuery.data.entries.slice(0, 5).map((item) => ({
        name: pickLocalizedText(item.title),
        detail: pickLocalizedText(item.summary),
        status: pickLocalizedText(item.statusLabel),
      }));
    }

    if (authDataEnabled && governanceLoading) {
      return [
        {
          name: "授权摘要同步中",
          detail: "正在拉取当前工作区的凭证、连接器、额度和账本摘要。",
          status: "同步中",
        },
      ];
    }

    if (!authDataEnabled) {
      const entries: Array<{ name: string; detail: string; status: string }> = [];
      for (const item of buildMobileServiceCapabilityEntries(visibleServices)) {
        entries.push({
          name: item.name,
          detail: item.detail,
          status: item.status,
        });
      }

      return entries.slice(0, 5);
    }

    return [
      {
        name: "当前工作区尚未同步授权摘要",
        detail: "需要先在 Dashboard 或 Creator 端登记密钥、浏览器状态或 MCP 绑定。",
        status: "待配置",
      },
    ];
  }, [
    authDataEnabled,
    currentWorkspace,
    governanceLoading,
    meAuthorizationsQuery.data,
    visibleServices,
  ]);

  const workspaceMemberSummary = useMemo(() => {
    const members = [...(workspaceMembersQuery.data ?? [])];
    const activeMembers = members.filter((item) => item.membership.status === "active");
    const suspendedMembers = members.filter(
      (item) => item.membership.status === "suspended"
    );

    return {
      total: members.length,
      active: activeMembers.length,
      suspended: suspendedMembers.length,
      members: members
        .sort((left, right) => {
          if (left.user.userId === user?.userId && right.user.userId !== user?.userId) {
            return -1;
          }

          if (right.user.userId === user?.userId && left.user.userId !== user?.userId) {
            return 1;
          }

          if (left.membership.status !== right.membership.status) {
            return left.membership.status === "active" ? -1 : 1;
          }

          const roleDelta =
            workspaceRolePriority(left.membership.role) -
            workspaceRolePriority(right.membership.role);
          if (roleDelta !== 0) {
            return roleDelta;
          }

          return left.user.displayName.localeCompare(right.user.displayName);
        })
        .slice(0, 5),
    };
  }, [workspaceMembersQuery.data, user?.userId]);

  const pendingWorkspaceInvitations = useMemo(
    () =>
      [...(myInvitationsQuery.data ?? [])]
        .filter((item) => item.invitation.status === "pending")
        .sort((left, right) => left.invitation.expiresAt.localeCompare(right.invitation.expiresAt)),
    [myInvitationsQuery.data]
  );

  const quotaSummary = useMemo(() => {
    const policies = [...(quotaPoliciesQuery.data ?? [])]
      .filter((item) => item.enabled && item.status !== "archived" && item.status !== "replaced")
      .sort((left, right) => left.priority - right.priority);
    const countersByPolicyId = new Map(
      (quotaCountersQuery.data ?? []).map((item) => [item.policyId, item])
    );
    const pendingOverrides = [...(quotaOverridesQuery.data ?? [])]
      .filter((item) => item.status === "pending")
      .sort((left, right) => right.requestedAt.localeCompare(left.requestedAt));
    const recentEvents = [...(quotaEventsQuery.data ?? [])]
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
      .slice(0, 4);
    const alertEvents = recentEvents.filter((item) => item.decision !== "healthy");
    const hottestCounter =
      policies
        .map((policy) => {
          const counter = countersByPolicyId.get(policy.policyId);
          if (!counter) {
            return null;
          }

          return {
            policy,
            counter,
            ratio: quotaUsageRatio(counter, policy),
          };
        })
        .filter(
          (
            item
          ): item is {
            policy: (typeof policies)[number];
            counter: NonNullable<ReturnType<typeof countersByPolicyId.get>>;
            ratio: number;
          } => Boolean(item)
        )
        .sort((left, right) => right.ratio - left.ratio)[0] ?? null;

    return {
      policies,
      pendingOverrides,
      recentEvents,
      alertEvents,
      hottestCounter,
    };
  }, [
    quotaCountersQuery.data,
    quotaEventsQuery.data,
    quotaOverridesQuery.data,
    quotaPoliciesQuery.data,
  ]);

  const quotaEntries = useMemo(() => {
    const entries: Array<{ title: string; detail: string; status: string; tone: string }> = [];

    for (const overrideRecord of quotaSummary.pendingOverrides.slice(0, 2)) {
      entries.push({
        title: `${quotaMetricLabel(overrideRecord.metric)} 配额覆盖待审批`,
        detail: `${overrideRecord.reasonSummary.zh} / ${overrideRecord.currentValue} -> ${overrideRecord.limitValue}`,
        status: quotaOverrideStatusLabel(overrideRecord.status),
        tone: quotaDecisionTone(overrideRecord.status),
      });
    }

    if (quotaSummary.hottestCounter) {
      entries.push({
        title: `${quotaMetricLabel(quotaSummary.hottestCounter.policy.metric)} 最接近限额`,
        detail: describeQuotaUsage(
          quotaSummary.hottestCounter.counter,
          quotaSummary.hottestCounter.policy
        ),
        status: `${Math.round(quotaSummary.hottestCounter.ratio * 100)}%`,
        tone:
          quotaSummary.hottestCounter.ratio >= 1
            ? "warn"
            : quotaSummary.hottestCounter.ratio >= 0.8
              ? "active"
              : "success",
      });
    }

    for (const event of quotaSummary.recentEvents.slice(0, 2)) {
      entries.push({
        title: `${quotaDecisionLabel(event.decision)} · ${quotaMetricLabel(event.metric)}`,
        detail: latestQuotaEventNote(event),
        status: quotaDecisionLabel(event.decision),
        tone: quotaDecisionTone(event.decision),
      });
    }

    return entries.slice(0, 4);
  }, [quotaSummary]);

  const billingOverview = useMemo(() => {
    const summary = billingSummaryQuery.data;
    const recentEntries = [...(billingEntriesQuery.data ?? [])]
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
      .slice(0, 4);
    const topMetric =
      [...(summary?.metrics ?? [])].sort((left, right) => right.amountUsd - left.amountUsd)[0] ?? null;

    return {
      summary,
      recentEntries,
      topMetric,
    };
  }, [billingEntriesQuery.data, billingSummaryQuery.data]);

  const liveNoticeEntries = useMemo(
    () =>
      (notificationsQuery.data ?? []).map((notice) => ({
        key: notice.notificationId,
        notificationId: notice.notificationId,
        title: pickLocalizedText(notice.title),
        detail: pickLocalizedText(notice.summary),
        route: buildMobileNoticeRoute(notice),
        unread: !notice.isRead,
      })),
    [notificationsQuery.data]
  );

  const noticeEntries = useMemo(() => {
    const entries: Array<{
      key?: string;
      notificationId?: string;
      title: string;
      detail: string;
      route?: string;
      unread?: boolean;
    }> = [];

    if (pendingWorkspaceInvitations.length > 0) {
      entries.push({
        title: `有 ${pendingWorkspaceInvitations.length} 个工作区邀请待接受`,
        detail:
          "在下方空间协作卡片里粘贴完整 accept token，即可加入并直接切换到对应工作区。",
      });
    }

    if (taskDataMode === "empty") {
      entries.push({
        title: "当前工作区没有实时实例",
        detail:
          "当前工作区已连接正式数据，请从工坊启动新的 Agent 实例。",
      });
    }

    {
      const approvalCount = summaryTasks.filter((item) => item.status === "approval").length;
      const runningCount = summaryTasks.filter((item) => item.status === "running").length;
      const doneCount = summaryTasks.filter((item) => item.status === "done").length;

      if (liveNoticeEntries.length > 0) {
        entries.push(...liveNoticeEntries);
      }

      if (liveNoticeEntries.length === 0 && approvalCount > 0) {
        entries.push({
          title: `有 ${approvalCount} 个任务待确认`,
          detail: "处理动作会继续回到对应任务对话里执行，不会重新初始化实例。",
        });
      }

      if (runningCount > 0) {
        entries.push({
          title: `有 ${runningCount} 个任务继续运行中`,
          detail: "可以直接回到任务页追问进度、补充材料或继续给 Codex 下指令。",
        });
      }

      if (liveNoticeEntries.length === 0 && doneCount > 0) {
        entries.push({
          title: `最近完成 ${doneCount} 个任务`,
          detail: "结果文件和回执已经同步沉淀到任务目录与我的资产入口。",
        });
      }
    }

    if (quotaSummary.pendingOverrides.length > 0) {
      entries.push({
        title: `${quotaSummary.pendingOverrides.length} 个配额审批待处理`,
        detail:
          "请进入关联任务对话完成批准或驳回，实例上下文将继续保留。",
      });
    }

    if (quotaSummary.alertEvents.length > 0) {
      entries.push({
        title: `${quotaSummary.alertEvents.length} 条近期配额告警`,
        detail:
          "当前工作区用量正在接近或已经超过已配置限额。",
      });
    }

    if (workspaceOptions.length > 1) {
      entries.push({
        title: `当前可切换 ${workspaceOptions.length} 个工作区`,
        detail: "不同空间的工坊、任务和文件目录会随切换即时刷新。",
      });
    }

    if (currentWorkspace.membershipStatus === "suspended") {
      entries.push({
        title: "当前工作区成员资格已暂停",
        detail: "当前账号仍可看到已缓存摘要，但需要联系管理员恢复成员状态后再继续运行。",
      });
    }

    if (entries.length === 0) {
      entries.push({
        title: "当前没有待处理动作",
        detail: "可以回到工坊启动一个新实例，或者打开已有任务继续对话。",
      });
    }

    return entries.slice(0, 3);
  }, [
    currentWorkspace.membershipStatus,
    liveNoticeEntries,
    pendingWorkspaceInvitations.length,
    quotaSummary.alertEvents.length,
    quotaSummary.pendingOverrides.length,
    summaryTasks,
    taskDataMode,
    workspaceOptions.length,
  ]);
  const noticeBadgeCount =
    notificationSummaryQuery.data?.unreadCount ??
    (liveNoticeEntries.length > 0
      ? liveNoticeEntries.filter((item) => item.unread).length
      : noticeEntries.length);
  const profileSummary = meSummaryQuery.data;

  const profileStats = useMemo(() => {
    if (profileSummary) {
      return {
        files: profileSummary.profileMetrics.totalAssetsCount,
        receipts: profileSummary.profileMetrics.receiptAssetsCount,
        favorites: profileSummary.profileMetrics.favoriteWorkshopsCount,
        pending: profileSummary.profileMetrics.pendingActionsCount,
      };
    }

    const totalFiles = summaryTasks.reduce((sum, task) => sum + task.files.length, 0);
    const resultFiles = summaryTasks.reduce(
      (sum, task) =>
        sum +
        task.files.filter(
          (file) => file.status === "结果" || file.status === "完成"
        ).length,
      0
    );
    const pendingActions = summaryTasks.filter(
      (item) => item.status === "running" || item.status === "approval"
    ).length;

    return {
      files: totalFiles,
      receipts: resultFiles,
      favorites: 0,
      pending: pendingActions,
    };
  }, [profileSummary, summaryTasks]);
  const summaryWorkspace = profileSummary?.currentWorkspace ?? null;
  const assetBadgeCount = meAssetsQuery.data?.totalCount ?? assetEntries.length;
  const favoriteBadgeCount = meFavoritesQuery.data?.totalCount ?? 0;
  const authorizationBadgeCount =
    meAuthorizationsQuery.data?.totalCount ?? authEntries.length;
  const currentWorkspaceRoleLabel =
    summaryWorkspace?.role
      ? toWorkspaceRoleLabel(summaryWorkspace.role)
      : currentWorkspace.role
        ? toWorkspaceRoleLabel(currentWorkspace.role)
        : currentWorkspace.meta.split(" / ")[0];
  const currentWorkspaceRoot = summaryWorkspace?.root ?? currentWorkspace.root;
  const currentWorkspaceWorkshopCount =
    profileSummary?.metrics.visibleWorkshopsCount ?? metrics.workshops;
  const currentWorkspaceRunCount =
    profileSummary?.metrics.visibleRunsCount ??
    (taskDataMode === "empty" ? 0 : metrics.tasks);

  return (
    <View className="page-shell">
      <View className="page" data-page="profile" data-testid="mobile-me-page">
        <View className="hero-card profile-hero">
          <View className="card-row">
            <View className="brand-row">
              <View className="brand-mark">
                <Image src={logoMark} mode="aspectFit" />
              </View>
              <View>
                <View className="section-title">
                  {user?.displayName ?? "当前账号"}
                </View>
                <View className="profile-note">
                  {authenticated && user
                    ? `${user.email} / ${currentWorkspace.name} / ${normalizedVisibleTaskSummary}`
                    : `${currentWorkspace.name} / ${currentWorkspace.type} / ${normalizedVisibleTaskSummary}`}
                </View>
              </View>
            </View>
            <View className="pill-row">
              <View className={`pill ${authenticated ? "success" : ""}`}>
                {authenticated
                  ? "已登录"
                  : authMode === "disabled"
                    ? "匿名模式"
                    : "待登录"}
              </View>
              <Button className="pill" onClick={toggleTheme}>
                {theme === "dark" ? "深色" : "浅色"}
              </Button>
              {authMode === "required" ? (
                <Button
                  className="pill profile-logout-btn"
                  disabled={logoutMutation.isPending}
                  onClick={() => logoutMutation.mutate()}
                >
                  {logoutMutation.isPending ? "退出中" : "退出"}
                </Button>
              ) : null}
            </View>
          </View>
          <View className="section-copy">
            这里长期沉淀结果文件、回执、工作区授权摘要和最近资产。任务运行中断后，也可以从这里直接回到对应任务或文件页。
          </View>
          <View className="profile-grid">
            <View className="mini-card">
              <View className="page-eyebrow">文件</View>
              <View className="mini-value">{profileStats.files}</View>
            </View>
            <View className="mini-card">
              <View className="page-eyebrow">回执</View>
              <View className="mini-value">{profileStats.receipts}</View>
            </View>
            <View className="mini-card">
              <View className="page-eyebrow">收藏工坊</View>
              <View className="mini-value">{profileStats.favorites}</View>
            </View>
            <View className="mini-card">
              <View className="page-eyebrow">待处理</View>
              <View className="mini-value">{profileStats.pending}</View>
            </View>
          </View>
        </View>

        <View className="page-section">
          <View className="section-head">
            <View>
              <View className="page-eyebrow">收藏工坊</View>
              <View className="section-title">常用入口</View>
            </View>
            <View className="pill active">{favoriteBadgeCount} 项</View>
          </View>
          <View className="favorite-rack">
            {!authDataEnabled ? (
              <View className="empty-state">
                <View className="section-title">登录后沉淀收藏工坊</View>
                <View className="empty-copy">
                  收藏会按当前账户与工作区独立保存，回到这里即可直接进入常用工坊。
                </View>
              </View>
            ) : favoriteEntries.length === 0 ? (
              <View className="empty-state">
                <View className="section-title">当前还没有收藏工坊</View>
                <View className="empty-copy">
                  去工坊页将常用工作流加入收藏，这里会同步显示最近保留的入口。
                </View>
              </View>
            ) : (
              favoriteEntries.map((item) => (
                <View
                  className="favorite-entry"
                  key={item.key}
                  onClick={() => {
                    if (item.route) {
                      void Taro.navigateTo({
                        url: item.route,
                      });
                    }
                  }}
                >
                  <View className="file-name">{item.title}</View>
                  <View className="file-meta">{item.meta}</View>
                </View>
              ))
            )}
          </View>
        </View>

        <View className="page-section">
          <View className="section-head">
            <View>
              <View className="page-eyebrow">工作区</View>
              <View className="section-title">当前工作区</View>
            </View>
            <Button className="pill active" onClick={() => setWorkspaceSheetOpen(true)}>
              切换工作区
            </Button>
          </View>
          <View className="profile-card workspace-current-card">
            <View className="card-row">
              <View>
              <View className="file-name">{currentWorkspace.name}</View>
                <View className="profile-note">
                  {summaryWorkspace
                    ? `${toWorkspaceRoleLabel(summaryWorkspace.role)} / ${summaryWorkspace.contextKey}`
                    : currentWorkspace.meta}
                </View>
              </View>
              <View className="pill success">
                {currentWorkspace.type}
                {currentWorkspace.source === "auth" ? " / 账户工作区" : ""}
              </View>
            </View>
            <View className="entry-metrics">
              <View className="metric-box">
                <View className="page-eyebrow">角色</View>
                <View className="mini-value">{currentWorkspaceRoleLabel}</View>
              </View>
              <View className="metric-box">
                <View className="page-eyebrow">可见工坊</View>
                <View className="mini-value">{currentWorkspaceWorkshopCount}</View>
              </View>
              <View className="metric-box">
                <View className="page-eyebrow">可见任务</View>
                <View className="mini-value">{currentWorkspaceRunCount}</View>
              </View>
            </View>
            <View className="file-row">
              <View>
                <View className="file-name">默认目录</View>
                <View className="file-meta mono">{currentWorkspaceRoot}</View>
              </View>
              <Button className="pill active" onClick={() => setWorkspaceSheetOpen(true)}>
                选择
              </Button>
            </View>
          </View>
        </View>

        <View className="page-section">
          <View className="section-head">
            <View>
              <View className="page-eyebrow">空间协作</View>
              <View className="section-title">成员与邀请</View>
            </View>
            <View className={`pill ${pendingWorkspaceInvitations.length > 0 ? "warn" : "active"}`}>
              {pendingWorkspaceInvitations.length} 个待处理邀请
            </View>
          </View>

          <View className="file-card">
            <View className="section-head">
              <View>
                <View className="page-eyebrow">Members</View>
                <View className="section-title">当前工作区成员</View>
              </View>
              <View
                className={`pill ${
                  currentWorkspace.membershipStatus === "suspended" ? "warn" : "success"
                }`}
              >
                {currentWorkspace.membershipStatus
                  ? toWorkspaceMembershipStatusLabel(currentWorkspace.membershipStatus)
                  : "预览"}
              </View>
            </View>

            {!authDataEnabled ? (
              <View className="empty-state">
                <View className="section-title">登录后显示真实成员列表</View>
                <View className="empty-copy">
                  认证工作区会在这里展示当前空间成员、角色分布和成员状态。
                </View>
              </View>
            ) : workspaceMembersQuery.isLoading && workspaceMemberSummary.total === 0 ? (
              <View className="file-row">
                <View>
                  <View className="file-name">正在同步工作区成员</View>
                  <View className="file-meta">
                    拉取当前工作区的成员、角色和成员状态。
                  </View>
                </View>
              </View>
            ) : workspaceMemberSummary.total === 0 ? (
              <View className="empty-state">
                <View className="section-title">当前工作区没有可见成员记录</View>
                <View className="empty-copy">
                  需要管理员先完成成员邀请，或等待成员关系同步。
                </View>
              </View>
            ) : (
              <>
                <View className="profile-grid">
                  <View className="mini-card">
                    <View className="page-eyebrow">成员总数</View>
                    <View className="mini-value">{workspaceMemberSummary.total}</View>
                  </View>
                  <View className="mini-card">
                    <View className="page-eyebrow">生效中</View>
                    <View className="mini-value">{workspaceMemberSummary.active}</View>
                  </View>
                  <View className="mini-card">
                    <View className="page-eyebrow">已暂停</View>
                    <View className="mini-value">{workspaceMemberSummary.suspended}</View>
                  </View>
                  <View className="mini-card">
                    <View className="page-eyebrow">当前角色</View>
                    <View className="mini-value">
                      {currentWorkspace.role
                        ? toWorkspaceRoleLabel(currentWorkspace.role)
                        : "预览"}
                    </View>
                  </View>
                </View>

                <View className="notice-rack">
                  {workspaceMemberSummary.members.map((member) => (
                    <View className="file-row" key={member.user.userId}>
                      <View>
                        <View className="file-name">
                          {member.user.displayName}
                          {member.user.userId === user?.userId ? " / 我" : ""}
                        </View>
                        <View className="file-meta">
                          {member.user.email} / 更新于 {formatWorkspaceTime(member.membership.updatedAt)}
                        </View>
                      </View>
                      <View className="pill-row">
                        <View className="pill active">
                          {toWorkspaceRoleLabel(member.membership.role)}
                        </View>
                        <View
                          className={`pill ${
                            member.membership.status === "active" ? "success" : "warn"
                          }`}
                        >
                          {toWorkspaceMembershipStatusLabel(member.membership.status)}
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              </>
            )}
          </View>

          <View className="file-card">
            <View className="section-head">
              <View>
                <View className="page-eyebrow">Invitations</View>
                <View className="section-title">待接受工作区邀请</View>
              </View>
              <View className={`pill ${pendingWorkspaceInvitations.length > 0 ? "warn" : ""}`}>
                {pendingWorkspaceInvitations.length} 条
              </View>
            </View>

            {authMode !== "required" || !authenticated ? (
              <View className="empty-state">
                <View className="section-title">登录后可接收工作区邀请</View>
                <View className="empty-copy">
                  系统会按当前账号邮箱匹配邀请，并在这里显示待加入的工作区。
                </View>
              </View>
            ) : myInvitationsQuery.isLoading && pendingWorkspaceInvitations.length === 0 ? (
              <View className="file-row">
                <View>
                  <View className="file-name">正在拉取邀请列表</View>
                  <View className="file-meta">
                    仅显示匹配当前账号邮箱的工作区邀请记录。
                  </View>
                </View>
              </View>
            ) : pendingWorkspaceInvitations.length === 0 ? (
              <View className="empty-state">
                <View className="section-title">当前没有待接受邀请</View>
                <View className="empty-copy">
                  管理员发起邀请后，这里会显示工作区、角色和到期时间。
                </View>
              </View>
            ) : (
              <View className="notice-rack">
                {pendingWorkspaceInvitations.map((item) => {
                  const invitationId = item.invitation.invitationId;
                  const draftToken = invitationTokenDrafts[invitationId] ?? "";
                  const isAccepting =
                    acceptInvitationMutation.isPending &&
                    acceptInvitationMutation.variables?.invitationId === invitationId;
                  const tokenPreview = item.invitation.acceptTokenPreview;

                  return (
                    <View className="file-card" key={invitationId}>
                      <View className="card-row">
                        <View>
                          <View className="file-name">{item.workspace.name}</View>
                          <View className="file-meta">
                            {toWorkspaceRoleLabel(item.invitation.role)} / 过期于{" "}
                            {formatWorkspaceTime(item.invitation.expiresAt)}
                          </View>
                        </View>
                        <View className="pill warn">
                          {toWorkspaceInvitationStatusLabel(item.invitation.status)}
                        </View>
                      </View>

                      <View className="section-copy">
                        {item.invitedBy
                          ? `邀请人：${item.invitedBy.displayName} / ${item.invitedBy.email}`
                          : "邀请人信息暂不可见"}
                      </View>
                      {item.invitation.note ? (
                        <View className="file-row">
                          <View>
                            <View className="file-name">附言</View>
                            <View className="file-meta">{item.invitation.note}</View>
                          </View>
                        </View>
                      ) : null}
                      <View className="section-copy">
                        {tokenPreview
                          ? `请输入完整 accept token。当前预览：${tokenPreview}******`
                          : "请输入管理员发给你的完整 accept token。"}
                      </View>
                      <View className="path-input-row">
                        <View className="path-input-shell">
                          <Input
                            className="path-input mono"
                            maxlength={160}
                            password
                            placeholder="粘贴完整 accept token"
                            value={draftToken}
                            onInput={(event) => {
                              const value = event.detail.value;
                              setInvitationTokenDrafts((current) => ({
                                ...current,
                                [invitationId]: value,
                              }));
                            }}
                          />
                        </View>
                        <Button
                          className="path-apply-btn"
                          disabled={isAccepting}
                          onClick={() => {
                            const normalizedToken = draftToken.trim();
                            if (!normalizedToken) {
                              Taro.showToast({
                                title: "请先输入完整 token",
                                icon: "none",
                              });
                              return;
                            }

                            acceptInvitationMutation.mutate({
                              invitationId,
                              workspaceId: item.workspace.workspaceId,
                              acceptToken: normalizedToken,
                            });
                          }}
                        >
                          {isAccepting ? "加入中" : "接受并切换"}
                        </Button>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </View>

        <View className="page-section">
          <View className="section-head">
            <View>
              <View className="page-eyebrow">我的资产</View>
              <View className="section-title">结果与下载</View>
            </View>
            <View className="pill active">{assetBadgeCount} 项最近资产</View>
          </View>
          <View className="asset-rack">
            {assetEntries.length === 0 ? (
              <View className="empty-state">
                <View className="section-title">暂时没有可展示的结果文件</View>
                <View className="empty-copy">启动实例并产生结果后，最近文件会优先沉淀在这里。</View>
              </View>
            ) : (
              assetEntries.map((item) => (
                <View
                  className="file-card"
                  key={item.key}
                  onClick={() => {
                    if (item.route) {
                      void Taro.navigateTo({
                        url: item.route,
                      });
                    }
                  }}
                >
                  <View className="file-name">{item.title}</View>
                  <View className="file-meta">{item.meta}</View>
                </View>
              ))
            )}
          </View>
        </View>

        <View className="page-section">
          <View className="section-head">
            <View>
              <View className="page-eyebrow">授权中心</View>
              <View className="section-title">连接与凭证</View>
            </View>
            <View className="pill">{authorizationBadgeCount} 项摘要</View>
          </View>
          <View className="file-card">
            <View className="section-head">
              <View>
                <View className="page-eyebrow">配额</View>
                <View className="section-title">容量与审批</View>
              </View>
              <View
                className={`pill ${
                  quotaSummary.pendingOverrides.length > 0 ? "warn" : "active"
                }`}
              >
                {quotaSummary.pendingOverrides.length} 个待处理
              </View>
            </View>

            {!authDataEnabled ? (
              <View className="empty-state">
                <View className="section-title">登录后查看配额汇总</View>
                <View className="empty-copy">
                  进入已登录工作区后，可以查看实时限额、审批和近期配额事件。
                </View>
              </View>
            ) : quotaPoliciesQuery.isLoading && quotaEntries.length === 0 ? (
              <View className="file-row">
                <View>
                  <View className="file-name">正在同步工作区配额状态</View>
                  <View className="file-meta">
                    正在获取当前工作区的策略、计数器、覆盖申请和近期事件。
                  </View>
                </View>
              </View>
            ) : quotaSummary.policies.length === 0 ? (
              <View className="empty-state">
                <View className="section-title">当前没有生效的配额策略</View>
                <View className="empty-copy">
                  当前工作区已连接正式数据，当前范围尚未发布配额策略。
                </View>
              </View>
            ) : (
              <>
                <View className="profile-grid">
                  <View className="mini-card">
                    <View className="page-eyebrow">策略</View>
                    <View className="mini-value">{quotaSummary.policies.length}</View>
                  </View>
                  <View className="mini-card">
                    <View className="page-eyebrow">待审批</View>
                    <View className="mini-value">{quotaSummary.pendingOverrides.length}</View>
                  </View>
                  <View className="mini-card">
                    <View className="page-eyebrow">告警</View>
                    <View className="mini-value">{quotaSummary.alertEvents.length}</View>
                  </View>
                  <View className="mini-card">
                    <View className="page-eyebrow">最高占用</View>
                    <View className="mini-value">
                      {quotaSummary.hottestCounter
                        ? `${quotaMetricLabel(quotaSummary.hottestCounter.policy.metric)} / ${quotaWindowLabel(
                            quotaSummary.hottestCounter.policy.windowType
                          )}`
                        : "--"}
                    </View>
                  </View>
                </View>

                <View className="notice-rack">
                  {quotaEntries.map((item) => (
                    <View className="file-row" key={`${item.title}-${item.status}`}>
                      <View>
                        <View className="file-name">{item.title}</View>
                        <View className="file-meta">{item.detail}</View>
                      </View>
                      <View className={`pill ${item.tone}`}>{item.status}</View>
                    </View>
                  ))}
                </View>
              </>
            )}
          </View>

          <View className="file-card">
            <View className="section-head">
              <View>
                <View className="page-eyebrow">计费</View>
                <View className="section-title">用量与支出</View>
              </View>
              <View
                className={`pill ${
                  (billingOverview.summary?.totalEntriesCount ?? 0) > 0 ? "active" : ""
                }`}
              >
                {billingOverview.summary?.totalEntriesCount ?? 0} 条
              </View>
            </View>

            {!authDataEnabled ? (
              <View className="empty-state">
                <View className="section-title">登录后查看计费汇总</View>
                <View className="empty-copy">
                  进入已登录工作区后，可以查看实时计量总额和近期计费活动。
                </View>
              </View>
            ) : billingSummaryQuery.isLoading && billingOverview.recentEntries.length === 0 ? (
              <View className="file-row">
                <View>
                  <View className="file-name">正在同步计费明细</View>
                  <View className="file-meta">
                    正在获取当前工作区的最新计量总额、主要指标和近期条目。
                  </View>
                </View>
              </View>
            ) : (billingOverview.summary?.totalEntriesCount ?? 0) === 0 ? (
              <View className="empty-state">
                <View className="section-title">当前没有计费活动</View>
                <View className="empty-copy">
                  当前工作区发送消息、上传文件或下载结果后，计量记录将在这里显示。
                </View>
              </View>
            ) : (
              <>
                <View className="profile-grid">
                  <View className="mini-card">
                    <View className="page-eyebrow">累计金额</View>
                    <View className="mini-value">
                      {formatBillingUsd(billingOverview.summary?.totalAmountUsd ?? 0)}
                    </View>
                  </View>
                  <View className="mini-card">
                    <View className="page-eyebrow">计量条目</View>
                    <View className="mini-value">
                      {billingOverview.summary?.totalEntriesCount ?? 0}
                    </View>
                  </View>
                  <View className="mini-card">
                    <View className="page-eyebrow">主要指标</View>
                    <View className="mini-value">
                      {billingOverview.topMetric?.label.zh ??
                        billingOverview.topMetric?.label.en ??
                        "--"}
                    </View>
                  </View>
                  <View className="mini-card">
                    <View className="page-eyebrow">最近更新</View>
                    <View className="mini-value">
                      {formatBillingTime(billingOverview.summary?.updatedAt ?? null)}
                    </View>
                  </View>
                </View>

                <View className="notice-rack">
                  {billingOverview.recentEntries.map((entry) => (
                    <View className="file-row" key={entry.entryId}>
                      <View>
                        <View className="file-name">
                          {billingSourceLabel(entry.source)} / {entry.metric}
                        </View>
                        <View className="file-meta">
                          {formatBillingQuantity(entry.quantity)} 单位 / {billingCostBasisLabel(entry.costBasis)} / {formatBillingTime(entry.occurredAt)}
                        </View>
                      </View>
                      <View className={`pill ${billingSourceTone(entry.source)}`}>
                        {formatBillingUsd(entry.amountUsd)}
                      </View>
                    </View>
                  ))}
                </View>
              </>
            )}
          </View>

          <View className="auth-rack">
            {authEntries.length === 0 ? (
              <View className="empty-state">
                <View className="section-title">当前没有可展示的连接</View>
                <View className="empty-copy">登录并启动实例后，能力挂载和授权摘要会沉淀在这里。</View>
              </View>
            ) : (
              authEntries.map((item) => (
                <View className="file-card" key={item.name}>
                  <View className="card-row">
                    <View>
                      <View className="file-name">{item.name}</View>
                      <View className="file-meta">{item.detail}</View>
                    </View>
                    <View className="pill active">{item.status}</View>
                  </View>
                </View>
              ))
            )}
          </View>
        </View>

        <View className="page-section">
          <View className="section-head">
            <View>
              <View className="page-eyebrow">通知与待办</View>
              <View className="section-title">需要你处理的动作</View>
            </View>
            <View className="pill warn">{noticeBadgeCount} 条联动提醒</View>
          </View>
          <View className="notice-rack">
            {noticeEntries.map((item) => (
              <View
                className={`file-card ${item.route ? "is-actionable" : ""}`}
                key={item.key ?? item.title}
                onClick={() => {
                  if (!item.route) {
                    return;
                  }

                  if (item.notificationId) {
                    void mobileNotificationsApi
                      .markNotificationRead(item.notificationId)
                      .then(async () => {
                        await Promise.all([
                          queryClient.invalidateQueries({
                            queryKey: ["mobile", "notifications"],
                          }),
                          queryClient.invalidateQueries({
                            queryKey: ["mobile", "notifications", "summary"],
                          }),
                        ]);
                      })
                      .catch(() => undefined);
                  }

                  Taro.navigateTo({
                    url: item.route,
                  });
                }}
              >
                <View className="file-name">
                  {item.title}
                  {item.unread ? " · 未读" : ""}
                </View>
                <View className="file-meta">{item.detail}</View>
              </View>
            ))}
          </View>
        </View>
      </View>

      {workspaceSheetOpen ? (
        <>
          <View className="sheet-backdrop is-open" onClick={() => setWorkspaceSheetOpen(false)} />
          <View className="workspace-sheet is-open">
            <View className="sheet-handle" />
            <View className="card-row">
              <View>
                <View className="page-eyebrow">工作区切换</View>
                <View className="section-title">选择当前工作区</View>
              </View>
              <Button className="pill" onClick={() => setWorkspaceSheetOpen(false)}>
                关闭
              </Button>
            </View>
            <View className="workspace-option-list">
              {workspaceOptions.map((item) => (
                (() => {
                  const isCurrent = item.selectionId === currentWorkspace.selectionId;
                  const workshopCount = isCurrent ? metrics.workshops : item.workshops;
                  const taskCount = isCurrent
                    ? taskDataMode === "empty"
                      ? 0
                      : metrics.tasks
                    : item.tasks;

                  return (
                    <Button
                      className={`workspace-option ${isCurrent ? "active" : ""}`}
                      disabled={switchWorkspaceMutation.isPending}
                      key={item.selectionId}
                      onClick={() => {
                        if (isCurrent) {
                          setWorkspaceSheetOpen(false);
                          return;
                        }

                        switchWorkspaceMutation.mutate(item.selectionId);
                      }}
                    >
                      <View className="workspace-option-top">
                        <View>
                          <View className="workspace-option-title">{item.name}</View>
                          <View className="workspace-option-meta">{item.meta}</View>
                        </View>
                        <View className={`pill ${isCurrent ? "active" : ""}`}>{item.type}</View>
                      </View>
                      <View className="workspace-option-note mono">{item.root}</View>
                      <View className="pill-row">
                        <View className="pill">工坊 {workshopCount}</View>
                        <View className="pill">任务 {taskCount}</View>
                        {item.source === "auth" ? (
                          <View className="pill success">账户</View>
                        ) : (
                          <View className="pill">预置</View>
                        )}
                      </View>
                    </Button>
                  );
                })()
              ))}
            </View>
          </View>
        </>
      ) : null}
    </View>
  );
}
