import { uploadRunAttachment } from "@lingban/api-sdk";
import type {
  ApproveRunInput,
  ReviewRunInformationAnswerDecision,
  RunConversationAttachment,
  RunConversationMessage,
  RunInformationCollection,
  SessionCaptureRecord,
  SendRunMessageInput,
} from "@lingban/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Image, Input, Switch, Textarea, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useMobileQuery as useQuery } from "../../lib/useMobileQuery";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MobileTaskMessage } from "../../data/mobileData";
import { formatAttachmentSize, pickLocalAttachments, type AttachmentDraft } from "../../lib/attachments";
import {
  billingCostBasisLabel,
  billingSourceLabel,
  billingSourceTone,
  formatBillingQuantity,
  formatBillingUsd,
} from "../../lib/billing";
import { mobileBillingApi, mobileQuotaApi, mobileRunsApi, mobileSessionCapturesApi } from "../../lib/api";
import archiveIcon from "../../assets/archive.svg";
import chevronDownIcon from "../../assets/chevron-down.svg";
import copyIcon from "../../assets/copy.svg";
import moreHorizontalIcon from "../../assets/more-horizontal.svg";
import { isLiveTaskId, mapRunSnapshotToMobileTask } from "../../lib/liveTaskAdapters";
import {
  formatQuotaValue,
  latestQuotaEventNote,
  quotaDecisionLabel,
  quotaDecisionTone,
  quotaMetricLabel,
  quotaOverrideStatusLabel,
  quotaScopeLabel,
  summarizeQuotaOverride,
} from "../../lib/quota";
import { mobileRunDetailQueryKey, mobileRunFilesQueryKey } from "../../lib/runQueryKeys";
import { useMobileRecentRecorder } from "../../lib/recent";
import { useMobileRunStream } from "../../lib/runStream";
import { useResolvedMobileWorkspace } from "../../lib/useMobileWorkspace";
import { useMobileRouteParams } from "../../lib/useMobileRouteParams";
import { useMobilePageShellClass } from "../../components/MobilePageShell";
import { MobileMessageContent } from "../../components/MobileMessageContent";
import { isAgentMediaAttachment } from "../../lib/agentMessageImages";
import { useMobileShareDisabled } from "../../lib/mobileShare";
import {
  useMobileUiStore,
  type MobileOutgoingMessageRecord,
  type MobileOutgoingMessageStatus,
} from "../../stores/mobileUiStore";

function formatQuotaTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

async function copyMessageText(text: string) {
  if (!text.trim()) {
    await Taro.showToast({ title: "当前消息没有可复制文本", icon: "none" });
    return;
  }

  try {
    await Taro.setClipboardData({ data: text });
    await Taro.showToast({ title: "消息已复制", icon: "success" });
  } catch {
    await Taro.showToast({ title: "复制失败，请重试", icon: "none" });
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

function mcpCallStatusLabel(value: string) {
  switch (value) {
    case "success":
      return "成功";
    case "error":
      return "错误";
    case "cancelled":
      return "已取消";
    case "rejected":
      return "已拦截";
    default:
      return value;
  }
}

function mcpCallStatusTone(value: string) {
  switch (value) {
    case "success":
      return "success";
    case "error":
    case "rejected":
      return "warn";
    case "cancelled":
      return "";
    default:
      return "";
  }
}

function mcpRiskLabel(value: string) {
  switch (value) {
    case "low":
      return "低风险";
    case "medium":
      return "中风险";
    case "high":
      return "高风险";
    case "critical":
      return "关键风险";
    default:
      return value;
  }
}

function formatDataVolume(value: number | null) {
  if (value === null || value <= 0) {
    return "--";
  }

  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (value >= 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${value} B`;
}

function hasInformationCollectionData(
  informationCollection: RunInformationCollection | null | undefined
) {
  if (!informationCollection) {
    return false;
  }

  return (
    informationCollection.requiredCount > 0 ||
    informationCollection.satisfiedCount > 0 ||
    informationCollection.missingCount > 0 ||
    informationCollection.userMessageCount > 0 ||
    informationCollection.attachmentCount > 0 ||
    informationCollection.slotSchemaVersion !== null
  );
}

function informationCollectionStatusLabel(
  status: RunInformationCollection["status"]
) {
  switch (status) {
    case "completed":
      return "已补齐";
    case "in_progress":
      return "补充中";
    case "pending":
    default:
      return "待补充";
  }
}

function informationCollectionSlotStatusLabel(
  status: RunInformationCollection["slots"][number]["status"]
) {
  switch (status) {
    case "satisfied":
      return "已满足";
    case "missing":
      return "缺失";
    case "optional":
    default:
      return "可选";
  }
}

function buildInformationCollectionItems(
  informationCollection: RunInformationCollection
) {
  return [...informationCollection.slots]
    .sort((left, right) => {
      const leftRank =
        left.status === "missing" && left.required ? 0 : left.status === "satisfied" ? 2 : 1;
      const rightRank =
        right.status === "missing" && right.required ? 0 : right.status === "satisfied" ? 2 : 1;
      return leftRank - rightRank;
    })
    .slice(0, 4)
    .map((slot) => {
      const parts = [
        slot.title,
        slot.required ? "必填" : "可选",
        informationCollectionSlotStatusLabel(slot.status),
      ];

      if (slot.attachmentCount > 0) {
        parts.push(`附件 ${slot.attachmentCount}`);
      }

      if (slot.answerCount > 0) {
        parts.push(`回答 ${slot.answerCount}`);
      }

      const detail =
        slot.lastAnswerText?.trim() ||
        slot.prompt?.trim() ||
        slot.description?.trim();
      return detail ? `${parts.join(" / ")} / ${detail}` : parts.join(" / ");
    });
}

type InformationCollectionAnswer = RunInformationCollection["answers"][number];

type ReviewableInformationAnswer = InformationCollectionAnswer & {
  slotTitle: string;
};

type ReviewFormState = {
  open: boolean;
  note: string;
  replacementValueText: string;
  replacementAttachmentPath: string;
  replacementAttachmentLabel: string;
};

function informationCollectionAnswerReviewStatusLabel(
  status: InformationCollectionAnswer["reviewStatus"]
) {
  switch (status) {
    case "approved":
      return "已通过";
    case "rejected":
      return "已驳回";
    case "superseded":
      return "已替换";
    case "pending":
    default:
      return "待复核";
  }
}

function informationCollectionAnswerReviewTone(status: InformationCollectionAnswer["reviewStatus"]) {
  switch (status) {
    case "approved":
      return "success";
    case "rejected":
      return "warn";
    case "superseded":
      return "";
    case "pending":
    default:
      return "active";
  }
}

function informationCollectionAnswerSourceLabel(source: InformationCollectionAnswer["source"]) {
  switch (source) {
    case "manual-review":
      return "人工复核";
    case "user-message":
    default:
      return "用户消息";
  }
}

function informationCollectionAnswerPreview(answer: InformationCollectionAnswer) {
  if (answer.kind === "attachment") {
    const attachmentLabel = answer.attachmentLabel?.trim();
    const attachmentPath = answer.attachmentPath?.trim();
    if (attachmentLabel && attachmentPath) {
      return `${attachmentLabel} / ${attachmentPath}`;
    }

    return attachmentLabel || attachmentPath || "附件答案";
  }

  return answer.valueText?.trim() || "文本答案";
}

function createDefaultReviewFormState(answer: InformationCollectionAnswer): ReviewFormState {
  return {
    open: false,
    note: answer.reviewNote ?? "",
    replacementValueText: answer.valueText ?? "",
    replacementAttachmentPath: answer.attachmentPath ?? "",
    replacementAttachmentLabel: answer.attachmentLabel ?? "",
  };
}

function createEmptyReviewFormState(): ReviewFormState {
  return {
    open: false,
    note: "",
    replacementValueText: "",
    replacementAttachmentPath: "",
    replacementAttachmentLabel: "",
  };
}

type DisplayedTaskMessage = MobileTaskMessage & {
  localId?: string;
  deliveryStatus?: MobileOutgoingMessageStatus;
  errorMessage?: string | null;
};

function formatMessageTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function nextOutgoingMessageId() {
  return `msg_local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeOutgoingText(value: string) {
  return value.trim() || "我补充了附件，请读取并继续。";
}

function deliveryStatusLabel(status: MobileOutgoingMessageStatus) {
  switch (status) {
    case "uploading":
      return "上传中";
    case "sending":
      return "发送中";
    case "syncing":
      return "同步中";
    case "failed":
      return "发送失败";
    default:
      return status;
  }
}

function deliveryStatusTone(status: MobileOutgoingMessageStatus) {
  switch (status) {
    case "failed":
      return "warn";
    case "uploading":
    case "sending":
    case "syncing":
      return "active";
    default:
      return "";
  }
}

function captureStatusTone(status: SessionCaptureRecord["status"]) {
  if (status === "CAPTURED") return "success";
  if (status === "FAILED" || status === "CANCELLED") return "warn";
  return "active";
}

function formatCaptureBytes(value: number) {
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${value} B`;
}

function attachmentsEqual(
  left: RunConversationAttachment[] | Array<{ label: string; path: string }>,
  right: Array<{ label: string; path: string }>
) {
  if (left.length !== right.length) {
    return false;
  }

  return right.every(
    (item, index) => left[index]?.label === item.label && left[index]?.path === item.path
  );
}

function snapshotContainsOutgoingMessage(
  messages: RunConversationMessage[],
  outgoing: MobileOutgoingMessageRecord
) {
  const createdAtValue = Date.parse(outgoing.createdAt);
  return messages.some((message) => {
    if (message.role !== "user") {
      return false;
    }

    if (message.text !== outgoing.text) {
      return false;
    }

    if (!attachmentsEqual(message.attachments, outgoing.attachments)) {
      return false;
    }

    const messageCreatedAtValue = Date.parse(message.createdAt);
    if (!Number.isFinite(createdAtValue) || !Number.isFinite(messageCreatedAtValue)) {
      return true;
    }

    return messageCreatedAtValue >= createdAtValue - 5_000;
  });
}

function mapOutgoingMessageToDisplay(
  outgoing: MobileOutgoingMessageRecord
): DisplayedTaskMessage {
  return {
    localId: outgoing.localId,
    role: "你",
    time: formatMessageTime(outgoing.createdAt),
    body: outgoing.text,
    kind: "user",
    attachments: outgoing.attachments,
    deliveryStatus: outgoing.status,
    errorMessage: outgoing.errorMessage,
  };
}

export default function TaskDetailPage() {
  useMobileShareDisabled();
  const params = useMobileRouteParams<{ id?: string }>();
  const pageShellClass = useMobilePageShellClass("task-detail-page");
  if (!params) {
    return <View className={pageShellClass}><View className="section-copy">正在加载实例路由</View></View>;
  }
  return <TaskDetailContent id={params.id} />;
}

function TaskDetailContent({ id }: { id?: string }) {
  const pageShellClass = useMobilePageShellClass("task-detail-page");
  const queryClient = useQueryClient();
  const liveTaskId = isLiveTaskId(id);
  const taskDrafts = useMobileUiStore((state) => state.taskDrafts);
  const taskOutbox = useMobileUiStore((state) => state.taskOutbox);
  const setTaskDraft = useMobileUiStore((state) => state.setTaskDraft);
  const clearTaskDraft = useMobileUiStore((state) => state.clearTaskDraft);
  const upsertTaskOutboxMessage = useMobileUiStore((state) => state.upsertTaskOutboxMessage);
  const removeTaskOutboxMessage = useMobileUiStore((state) => state.removeTaskOutboxMessage);
  const currentWorkspace = useResolvedMobileWorkspace();
  const runStream = useMobileRunStream(liveTaskId ? id ?? null : null, liveTaskId);
  const outgoingPayloadsRef = useRef<
    Record<string, { text: string; drafts: AttachmentDraft[] }>
  >({});
  const [captureSheetOpen, setCaptureSheetOpen] = useState(false);
  const [submittedCaptureId, setSubmittedCaptureId] = useState<string | null>(null);

  const liveTaskQuery = useQuery({
    enabled: liveTaskId,
    queryKey: id ? mobileRunDetailQueryKey(id) : ["mobile", "runs", "missing-detail"],
    queryFn: async () => {
      const runId = id;
      if (!runId || !isLiveTaskId(runId)) {
        return null;
      }

      try {
        return await mobileRunsApi.getRun(runId);
      } catch {
        return null;
      }
    },
    refetchInterval: 10_000,
  });
  const liveSnapshot = liveTaskQuery.data;
  const capturesQuery = useQuery({
    enabled: liveTaskId && Boolean(id),
    queryKey: ["mobile", "session-captures", id],
    queryFn: async () => (await mobileSessionCapturesApi.list(id!)).items,
    refetchInterval: (query) =>
      query.state.data?.some((capture) => !["CAPTURED", "FAILED", "CANCELLED"].includes(capture.status))
        ? 1_500
        : 8_000,
  });
  const pendingApproval = useMemo(
    () => liveSnapshot?.approvals.find((item) => item.state === "pending") ?? null,
    [liveSnapshot]
  );
  const informationCollection = liveSnapshot?.informationCollection ?? null;
  const informationCollectionVisible = useMemo(
    () => hasInformationCollectionData(informationCollection),
    [informationCollection]
  );
  const informationCollectionItems = useMemo(
    () =>
      informationCollection ? buildInformationCollectionItems(informationCollection) : [],
    [informationCollection]
  );
  const reviewableInformationAnswers = useMemo<ReviewableInformationAnswer[]>(
    () =>
      informationCollection
        ? [...informationCollection.answers]
            .filter((answer) => answer.reviewStatus !== "superseded")
            .map((answer) => ({
              ...answer,
              slotTitle:
                informationCollection.slots.find((slot) => slot.key === answer.slotKey)?.title ??
                answer.slotKey,
            }))
            .sort((left, right) => {
              const rank = (status: ReviewableInformationAnswer["reviewStatus"]) => {
                switch (status) {
                  case "pending":
                    return 0;
                  case "rejected":
                    return 1;
                  case "approved":
                    return 2;
                  case "superseded":
                  default:
                    return 3;
                }
              };

              const rankDiff = rank(left.reviewStatus) - rank(right.reviewStatus);
              if (rankDiff !== 0) {
                return rankDiff;
              }

              return right.createdAt.localeCompare(left.createdAt);
            })
        : [],
    [informationCollection]
  );
  const pendingQuotaApproval = useMemo(
    () => (pendingApproval?.kind === "quota-override" ? pendingApproval : null),
    [pendingApproval]
  );

  const quotaOverridesQuery = useQuery({
    enabled: Boolean(liveTaskId && id && pendingQuotaApproval),
    queryKey: id ? ["mobile", "quotas", "overrides", "run", id] : ["mobile", "quotas", "overrides", "missing-run"],
    queryFn: async () => {
      if (!id || !isLiveTaskId(id)) {
        return [];
      }

      try {
        return await mobileQuotaApi.listOverrides({ runId: id });
      } catch {
        return [];
      }
    },
    refetchInterval: 10_000,
    retry: false,
  });

  const quotaEventsQuery = useQuery({
    enabled: Boolean(liveTaskId && id),
    queryKey: id ? ["mobile", "quotas", "events", "run", id] : ["mobile", "quotas", "events", "missing-run"],
    queryFn: async () => {
      if (!id || !isLiveTaskId(id)) {
        return [];
      }

      try {
        return await mobileQuotaApi.listEvents({ runId: id });
      } catch {
        return [];
      }
    },
    refetchInterval: 10_000,
    retry: false,
  });

  const billingSummaryQuery = useQuery({
    enabled: Boolean(liveTaskId && id),
    queryKey: id ? ["mobile", "billing", "summary", "run", id] : ["mobile", "billing", "summary", "missing-run"],
    queryFn: async () => {
      if (!id || !isLiveTaskId(id)) {
        return null;
      }

      try {
        return await mobileBillingApi.getSummary({ runId: id });
      } catch {
        return null;
      }
    },
    refetchInterval: 10_000,
    retry: false,
  });

  const billingEntriesQuery = useQuery({
    enabled: Boolean(liveTaskId && id),
    queryKey: id ? ["mobile", "billing", "entries", "run", id] : ["mobile", "billing", "entries", "missing-run"],
    queryFn: async () => {
      if (!id || !isLiveTaskId(id)) {
        return [];
      }

      try {
        return await mobileBillingApi.listEntries({ runId: id });
      } catch {
        return [];
      }
    },
    refetchInterval: 10_000,
    retry: false,
  });

  const mcpCallsQuery = useQuery({
    enabled: Boolean(liveTaskId && id),
    queryKey: id ? ["mobile", "mcp-calls", "run", id] : ["mobile", "mcp-calls", "missing-run"],
    queryFn: async () => {
      if (!id || !isLiveTaskId(id)) {
        return [];
      }

      try {
        return await mobileRunsApi.listRunMcpCalls(id, { limit: 4 });
      } catch {
        return [];
      }
    },
    refetchInterval: 10_000,
    retry: false,
  });

  const pendingQuotaOverride = useMemo(() => {
    if (!pendingQuotaApproval) {
      return null;
    }

    const records = quotaOverridesQuery.data ?? [];
    return (
      records.find(
        (item) =>
          item.overrideId === pendingQuotaApproval.relatedResourceRef ||
          item.approvalId === pendingQuotaApproval.approvalId
      ) ??
      records.find((item) => item.status === "pending") ??
      null
    );
  }, [pendingQuotaApproval, quotaOverridesQuery.data]);

  const recentQuotaEvents = useMemo(
    () =>
      [...(quotaEventsQuery.data ?? [])]
        .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
        .slice(0, 3),
    [quotaEventsQuery.data]
  );
  const recentBillingEntries = useMemo(
    () =>
      [...(billingEntriesQuery.data ?? [])]
        .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
        .slice(0, 4),
    [billingEntriesQuery.data]
  );
  const recentMcpCalls = useMemo(
    () =>
      [...(mcpCallsQuery.data ?? [])]
        .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
        .slice(0, 4),
    [mcpCallsQuery.data]
  );
  const topBillingMetric =
    [...(billingSummaryQuery.data?.metrics ?? [])].sort((left, right) => right.amountUsd - left.amountUsd)[0] ?? null;
  const latestMcpCall = recentMcpCalls[0] ?? null;
  const mcpIssueCount = recentMcpCalls.filter((item) => item.status !== "success").length;
  const distinctMcpCount = new Set(recentMcpCalls.map((item) => item.mcpId)).size;

  const approvalHeadline = pendingQuotaApproval ? "配额审批待处理" : "审批待处理";
  const approvalSummary = pendingQuotaOverride
    ? pendingQuotaOverride.reasonSummary.zh
    : pendingApproval?.note?.trim() || pendingApproval?.prompt || "";
  const mappedLiveTask = useMemo(() => {
    if (!liveTaskQuery.data) {
      return null;
    }

    return mapRunSnapshotToMobileTask(
      liveTaskQuery.data,
      undefined,
      currentWorkspace
    );
  }, [currentWorkspace, liveTaskQuery.data]);
  const routeLiveTaskOutOfScope = Boolean(
    liveTaskId &&
      !liveTaskQuery.isPending &&
      mappedLiveTask &&
      mappedLiveTask.workspaceId !== currentWorkspace.id
  );
  const routeTaskOutOfScope = routeLiveTaskOutOfScope;

  const task = useMemo(() => {
    if (liveTaskId && liveTaskQuery.isPending) {
      return null;
    }

    if (mappedLiveTask) {
      if (mappedLiveTask.workspaceId === currentWorkspace.id) {
        return mappedLiveTask;
      }
    }

    return null;
  }, [
    currentWorkspace.id,
    liveTaskId,
    liveTaskQuery.isPending,
    mappedLiveTask,
  ]);

  const [summaryOpen, setSummaryOpen] = useState(false);
  const [composerExpanded, setComposerExpanded] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [reviewFormsByAnswerId, setReviewFormsByAnswerId] = useState<
    Record<string, ReviewFormState>
  >({});
  const [attachmentDraftsByTask, setAttachmentDraftsByTask] = useState<
    Record<string, AttachmentDraft[]>
  >({});
  const draft = task ? taskDrafts[task.id] ?? "" : "";
  const attachmentDrafts = task ? attachmentDraftsByTask[task.id] ?? [] : [];
  const outgoingMessages = task ? taskOutbox[task.id] ?? [] : [];
  const hasInFlightOutgoing = outgoingMessages.some((item) => item.status !== "failed");

  const liveMode = Boolean(task);
  const runTerminal = Boolean(
    liveSnapshot && ["SUCCEEDED", "FAILED", "CANCELLED"].includes(liveSnapshot.run.status)
  );
  const runtimeTransitioning = Boolean(
    liveSnapshot && ["STOP_REQUESTED", "STOPPING"].includes(liveSnapshot.lifecycle.runtimeStatus)
  );
  const runInteractive = Boolean(liveSnapshot && !runTerminal && !runtimeTransitioning);
  const activeCapture =
    capturesQuery.data?.find((capture) => capture.captureId === submittedCaptureId) ??
    capturesQuery.data?.find((capture) => !["CAPTURED", "FAILED", "CANCELLED"].includes(capture.status)) ??
    capturesQuery.data?.[0] ??
    null;
  const captureReady =
    liveSnapshot?.agentThread?.currentTurnState === "completed" &&
    Boolean(liveSnapshot.agentThread.currentTurnId);
  const captureMutation = useMutation({
    mutationFn: async () => {
      if (!task || !liveSnapshot) throw new Error("当前任务不可固化");
      return mobileSessionCapturesApi.create(task.id, {
        mode: "terminal",
        throughTurnId: liveSnapshot.agentThread?.currentTurnId ?? null,
        workspaceSelection: {
          targetPath: liveSnapshot.run.targetPath,
          includeGlobs: ["**/*"],
          excludeGlobs: [
            ".git/**",
            "**/node_modules/**",
            "**/.env",
            "**/.env.*",
            "**/secrets/**",
            "**/codex-home/**",
            "**/tmp/**",
            "**/.cache/**",
          ],
          includeArtifacts: true,
          maxFiles: 100_000,
          maxBytes: 5 * 1024 * 1024 * 1024,
        },
        destinationSessionId: null,
        createDraft: true,
        idempotencyKey: `mobile:${task.id}:${liveSnapshot.agentThread?.currentTurnId ?? "terminal"}`,
      });
    },
    onSuccess: async (result) => {
      setSubmittedCaptureId(result.capture.captureId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["mobile", "session-captures", id] }),
        queryClient.invalidateQueries({ queryKey: id ? mobileRunDetailQueryKey(id) : ["mobile", "runs"] }),
        queryClient.invalidateQueries({ queryKey: ["mobile", "creator"] }),
      ]);
    },
    onError: (error) => {
      Taro.showToast({ title: error instanceof Error ? error.message : "固化提交失败", icon: "none" });
    },
  });
  const refreshLifecycleQueries = async (runId: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["mobile", "runs"] }),
      queryClient.invalidateQueries({ queryKey: mobileRunDetailQueryKey(runId) }),
      queryClient.invalidateQueries({ queryKey: mobileRunFilesQueryKey(runId) }),
      queryClient.invalidateQueries({ queryKey: ["mobile", "billing"] }),
    ]);
  };
  const stopMutation = useMutation({
    mutationFn: async (runId: string) =>
      mobileRunsApi.stopRun(runId, "用户从移动端结束当前实例"),
    onSuccess: async (snapshot) => {
      queryClient.setQueryData(mobileRunDetailQueryKey(snapshot.run.runId), snapshot);
      setComposerExpanded(false);
      await refreshLifecycleQueries(snapshot.run.runId);
      Taro.showToast({
        title: snapshot.lifecycle.runtimeStatus === "RELEASED" ? "运行环境已释放" : "停止请求已提交",
        icon: "success",
      });
    },
    onError: (error) => {
      Taro.showToast({ title: error instanceof Error ? error.message : "停止实例失败", icon: "none" });
    },
  });
  const archiveMutation = useMutation({
    mutationFn: async (runId: string) => mobileRunsApi.archiveRun(runId, "用户从移动端归档实例"),
    onSuccess: async (snapshot) => {
      queryClient.setQueryData(mobileRunDetailQueryKey(snapshot.run.runId), snapshot);
      await refreshLifecycleQueries(snapshot.run.runId);
      Taro.showToast({ title: "实例已归档", icon: "success" });
    },
    onError: (error) => Taro.showToast({ title: error instanceof Error ? error.message : "归档失败", icon: "none" }),
  });
  const restoreMutation = useMutation({
    mutationFn: async (runId: string) => mobileRunsApi.restoreRun(runId),
    onSuccess: async (snapshot) => {
      queryClient.setQueryData(mobileRunDetailQueryKey(snapshot.run.runId), snapshot);
      await refreshLifecycleQueries(snapshot.run.runId);
      Taro.showToast({ title: "实例已恢复", icon: "success" });
    },
    onError: (error) => Taro.showToast({ title: error instanceof Error ? error.message : "恢复失败", icon: "none" }),
  });
  const deleteMutation = useMutation({
    mutationFn: async (runId: string) => mobileRunsApi.deleteRun(runId, "用户确认永久删除当前实例"),
    onSuccess: async (_, runId) => {
      await queryClient.invalidateQueries({ queryKey: ["mobile", "runs"] });
      queryClient.removeQueries({ queryKey: mobileRunDetailQueryKey(runId) });
      Taro.showToast({ title: "实例已删除", icon: "success" });
      setTimeout(() => Taro.navigateBack(), 400);
    },
    onError: (error) => Taro.showToast({ title: error instanceof Error ? error.message : "删除失败", icon: "none" }),
  });
  const confirmStop = async () => {
    if (!task) return;
    let result;
    try {
      result = await Taro.showModal({
        title: "立即停止实例",
        content: "当前执行将被中断，已写入工作目录的文件会保留。运行环境释放后仍可查看消息和结果。",
        confirmText: "确认停止",
        confirmColor: "#d84b4b",
      });
    } catch (error) {
      await Taro.showToast({
        title: error instanceof Error ? error.message : "停止确认弹窗打开失败",
        icon: "none",
      });
      return;
    }
    if (result.confirm) stopMutation.mutate(task.id);
  };
  const confirmDelete = async () => {
    if (!task) return;
    const result = await Taro.showModal({
      title: "永久删除实例",
      content: `将清理实例 ${task.runRef} 的消息、工作目录和运行记录。该操作无法撤销。`,
      confirmText: "永久删除",
      confirmColor: "#d84b4b",
    });
    if (result.confirm) deleteMutation.mutate(task.id);
  };
  const openLifecycleActions = async () => {
    if (!task || !liveSnapshot) return;
    const actions: Array<{ label: string; run: () => void | Promise<void> }> = [];
    if (liveSnapshot.lifecycle.recordStatus === "ARCHIVED") {
      actions.push({ label: "恢复到任务列表", run: () => restoreMutation.mutate(task.id) });
      actions.push({ label: "永久删除实例", run: confirmDelete });
    } else if (runInteractive) {
      actions.push({ label: "固化并结束", run: () => setCaptureSheetOpen(true) });
      actions.push({ label: "立即停止并释放", run: confirmStop });
    } else if (liveSnapshot.lifecycle.runtimeStatus === "RELEASE_FAILED" || liveSnapshot.lifecycle.runtimeStatus === "ORPHANED") {
      actions.push({ label: "重试释放运行环境", run: confirmStop });
    } else if (liveSnapshot.lifecycle.runtimeStatus === "RELEASED") {
      actions.push({ label: "归档实例", run: () => archiveMutation.mutate(task.id) });
      actions.push({ label: "永久删除实例", run: confirmDelete });
    }
    if (actions.length === 0) return;
    let result;
    try {
      result = await Taro.showActionSheet({ itemList: actions.map((item) => item.label) });
    } catch {
      // The user dismissed the action sheet.
      return;
    }
    await actions[result.tapIndex]?.run();
  };
  useMobileRecentRecorder(
    task && liveMode && currentWorkspace.source === "auth"
      ? {
          resourceType: "run",
          runId: task.id,
          interaction: "resume",
          sourceSurface: "h5",
        }
      : null,
    currentWorkspace.source === "auth"
  );

  const applyInlineDraft = (value: string | undefined) => {
    if (!task || !value) {
      return;
    }

    setTaskDraft(task.id, value);
    setComposerExpanded(true);
  };
  const setTaskAttachments = (taskId: string, next: AttachmentDraft[]) => {
    setAttachmentDraftsByTask((current) => ({
      ...current,
      [taskId]: next,
    }));
  };
  const clearTaskAttachments = (taskId: string) => {
    setAttachmentDraftsByTask((current) => {
      const next = { ...current };
      delete next[taskId];
      return next;
    });
  };
  const updateReviewForm = (
    answerId: string,
    updater: (current: ReviewFormState) => ReviewFormState
  ) => {
    setReviewFormsByAnswerId((current) => {
      const nextCurrent = current[answerId] ?? createEmptyReviewFormState();
      return {
        ...current,
        [answerId]: updater(nextCurrent),
      };
    });
  };
  const openReviewForm = (answer: ReviewableInformationAnswer) => {
    setReviewError("");
    setReviewFormsByAnswerId((current) => ({
      ...current,
      [answer.answerId]: {
        ...(current[answer.answerId] ?? createDefaultReviewFormState(answer)),
        open: true,
      },
    }));
  };
  const closeReviewForm = (answer: ReviewableInformationAnswer) => {
    setReviewFormsByAnswerId((current) => ({
      ...current,
      [answer.answerId]: {
        ...(current[answer.answerId] ?? createDefaultReviewFormState(answer)),
        open: false,
      },
    }));
  };
  const rememberOutgoingPayload = (
    localId: string,
    payload: { text: string; drafts: AttachmentDraft[] }
  ) => {
    outgoingPayloadsRef.current[localId] = payload;
  };
  const forgetOutgoingPayload = (localId: string) => {
    delete outgoingPayloadsRef.current[localId];
  };
  const readCurrentOutboxMessage = (taskId: string, localId: string) =>
    useMobileUiStore
      .getState()
      .taskOutbox[taskId]
      ?.find((item) => item.localId === localId) ?? null;

  useEffect(() => {
    if (!task || !liveSnapshot) {
      return;
    }

    for (const outgoing of outgoingMessages) {
      if (outgoing.status === "failed") {
        continue;
      }

      if (!snapshotContainsOutgoingMessage(liveSnapshot.messages, outgoing)) {
        continue;
      }

      removeTaskOutboxMessage(task.id, outgoing.localId);
      forgetOutgoingPayload(outgoing.localId);
    }
  }, [liveSnapshot, outgoingMessages, removeTaskOutboxMessage, task]);

  useEffect(() => {
    setReviewError("");
    setReviewFormsByAnswerId({});
    setComposerExpanded(false);
  }, [task?.id]);

  const displayedMessages = useMemo<DisplayedTaskMessage[]>(() => {
    if (!task) {
      return [];
    }

    return [
      ...task.messages,
      ...outgoingMessages.map((item) => mapOutgoingMessageToDisplay(item)),
    ];
  }, [outgoingMessages, task]);

  const sendMessageMutation = useMutation({
    mutationFn: async (input: {
      localId: string;
      taskId: string;
      createdAt: string;
      text: string;
      drafts: AttachmentDraft[];
    }) => {
      const activeTaskId = task?.id ?? input.taskId;
      if (!activeTaskId) {
        throw new Error("Task not found.");
      }

      const normalizedText = normalizeOutgoingText(input.text);
      const attachments = await Promise.all(
        input.drafts.map(async (draftAttachment) =>
          uploadRunAttachment(mobileRunsApi, activeTaskId, {
            fileName: draftAttachment.fileName,
            contentType: draftAttachment.contentType,
            sizeBytes: draftAttachment.sizeBytes,
            content: await draftAttachment.readContent(),
            label: draftAttachment.label,
          })
        )
      );

      upsertTaskOutboxMessage(activeTaskId, {
        localId: input.localId,
        taskId: activeTaskId,
        text: normalizedText,
        createdAt: input.createdAt,
        attachments,
        status: "sending",
        errorMessage: null,
      });

      const payload: SendRunMessageInput = {
        text: normalizedText,
        attachments,
        slotValues: [],
      };

      if (liveMode && runStream.connected) {
        await runStream.sendMessageAwaitAck(payload);
        upsertTaskOutboxMessage(activeTaskId, {
          localId: input.localId,
          taskId: activeTaskId,
          text: normalizedText,
          createdAt: input.createdAt,
          attachments,
          status: "syncing",
          errorMessage: null,
        });
        return {
          mode: "ws" as const,
          snapshot: null,
        };
      }

      return {
        mode: "http" as const,
        snapshot: await mobileRunsApi.sendRunMessage(activeTaskId, payload),
      };
    },
    onSuccess: async (result, variables) => {
      if (result.mode === "http" && result.snapshot) {
        queryClient.setQueryData(mobileRunDetailQueryKey(variables.taskId), result.snapshot);
        queryClient.setQueryData(mobileRunFilesQueryKey(variables.taskId), result.snapshot.files);
        removeTaskOutboxMessage(variables.taskId, variables.localId);
        forgetOutgoingPayload(variables.localId);
      }

      const currentDraft = useMobileUiStore.getState().taskDrafts[variables.taskId] ?? "";
      if (currentDraft === variables.text || (!currentDraft.trim() && !variables.text.trim())) {
        clearTaskDraft(variables.taskId);
      }
      clearTaskAttachments(variables.taskId);
      setComposerExpanded(false);

      if (!variables.taskId) {
        return;
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["mobile", "runs"] }),
        queryClient.invalidateQueries({ queryKey: mobileRunDetailQueryKey(variables.taskId) }),
        queryClient.invalidateQueries({ queryKey: mobileRunFilesQueryKey(variables.taskId) }),
        queryClient.invalidateQueries({ queryKey: ["mobile", "billing"] }),
        queryClient.invalidateQueries({ queryKey: ["mobile", "mcp-calls"] }),
      ]);
    },
    onError: (error, variables) => {
      const current =
        readCurrentOutboxMessage(variables.taskId, variables.localId) ?? {
          localId: variables.localId,
          taskId: variables.taskId,
          text: normalizeOutgoingText(variables.text),
          createdAt: variables.createdAt,
          attachments: variables.drafts.map((item) => ({
            label: item.label,
            path: item.fileName,
          })),
          status: "failed" as const,
          errorMessage: null,
        };
      upsertTaskOutboxMessage(variables.taskId, {
        ...current,
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "发送失败",
      });
      Taro.showToast({
        title: error instanceof Error ? error.message : "发送失败",
        icon: "none",
      });
    },
  });

  const approvalMutation = useMutation({
    mutationFn: async (input: ApproveRunInput) => {
      if (!task) {
        throw new Error("Task not found.");
      }

      if (liveMode && runStream.connected) {
        await runStream.approveAwaitAck(input);
        return null;
      }

      return await mobileRunsApi.approveRun(task.id, input);
    },
    onSuccess: async () => {
      if (!task) {
        return;
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["mobile", "runs"] }),
        queryClient.invalidateQueries({ queryKey: mobileRunDetailQueryKey(task.id) }),
        queryClient.invalidateQueries({ queryKey: mobileRunFilesQueryKey(task.id) }),
        queryClient.invalidateQueries({ queryKey: ["mobile", "billing"] }),
        queryClient.invalidateQueries({ queryKey: ["mobile", "mcp-calls"] }),
        queryClient.invalidateQueries({ queryKey: ["mobile", "quotas"] }),
      ]);
    },
    onError: (error) => {
      Taro.showToast({
        title: error instanceof Error ? error.message : "Approval failed.",
        icon: "none",
      });
    },
  });

  const approvalModeMutation = useMutation({
    mutationFn: async (approvalMode: "manual" | "auto_all") => {
      if (!task) {
        throw new Error("Task not found.");
      }
      return await mobileRunsApi.setRunApprovalMode(task.id, { approvalMode });
    },
    onSuccess: async (snapshot) => {
      if (!task) return;
      queryClient.setQueryData(mobileRunDetailQueryKey(task.id), snapshot);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["mobile", "runs"] }),
        queryClient.invalidateQueries({ queryKey: mobileRunDetailQueryKey(task.id) }),
      ]);
    },
    onError: (error) => {
      Taro.showToast({
        title: error instanceof Error ? error.message : "自动审批设置更新失败",
        icon: "none",
      });
    },
  });

  const reviewMutation = useMutation({
    mutationFn: async (input: {
      answer: ReviewableInformationAnswer;
      decision: ReviewRunInformationAnswerDecision;
      note?: string;
      replacementValueText?: string;
      replacementAttachmentPath?: string;
      replacementAttachmentLabel?: string;
    }) => {
      if (!task) {
        throw new Error("Task not found.");
      }

      return await mobileRunsApi.reviewRunInformationAnswer(task.id, {
        answerId: input.answer.answerId,
        decision: input.decision,
        note: input.note?.trim() || undefined,
        replacementValueText: input.replacementValueText?.trim() || undefined,
        replacementAttachmentPath: input.replacementAttachmentPath?.trim() || undefined,
        replacementAttachmentLabel: input.replacementAttachmentLabel?.trim() || undefined,
      });
    },
    onSuccess: async (snapshot, variables) => {
      if (!task) {
        return;
      }

      queryClient.setQueryData(mobileRunDetailQueryKey(task.id), snapshot);
      queryClient.setQueryData(mobileRunFilesQueryKey(task.id), snapshot.files);
      setReviewError("");
      setReviewFormsByAnswerId((current) => {
        const next = { ...current };
        delete next[variables.answer.answerId];
        return next;
      });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["mobile", "runs"] }),
        queryClient.invalidateQueries({ queryKey: mobileRunDetailQueryKey(task.id) }),
        queryClient.invalidateQueries({ queryKey: mobileRunFilesQueryKey(task.id) }),
      ]);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "复核提交失败";
      setReviewError(message);
      Taro.showToast({
        title: message,
        icon: "none",
      });
    },
  });

  const handleApprovalDecision = (approved: boolean) => {
    if (!pendingApproval) {
      return;
    }

    approvalMutation.mutate({
      approvalId: pendingApproval.approvalId,
      approved,
      note: approved ? "Approved from mobile conversation." : "Rejected from mobile conversation.",
    });
  };

  const handleQuickReviewDecision = (
    answer: ReviewableInformationAnswer,
    decision: Exclude<ReviewRunInformationAnswerDecision, "revise">
  ) => {
    setReviewError("");
    reviewMutation.mutate({
      answer,
      decision,
      note:
        decision === "approve"
          ? "Approved from mobile review panel."
          : "Rejected from mobile review panel.",
    });
  };

  const handleRevisionSubmit = (answer: ReviewableInformationAnswer) => {
    const form = reviewFormsByAnswerId[answer.answerId] ?? createDefaultReviewFormState(answer);

    if (answer.kind === "text" && !form.replacementValueText.trim()) {
      const message = "文本答案改写必须填写替换内容。";
      setReviewError(message);
      Taro.showToast({
        title: message,
        icon: "none",
      });
      return;
    }

    if (answer.kind === "attachment" && !form.replacementAttachmentPath.trim()) {
      const message = "附件答案改写必须填写新的文件路径。";
      setReviewError(message);
      Taro.showToast({
        title: message,
        icon: "none",
      });
      return;
    }

    setReviewError("");
    reviewMutation.mutate({
      answer,
      decision: "revise",
      note: form.note,
      replacementValueText: form.replacementValueText,
      replacementAttachmentPath: form.replacementAttachmentPath,
      replacementAttachmentLabel: form.replacementAttachmentLabel,
    });
  };

  const queueOutgoingMessage = (text: string, drafts: AttachmentDraft[]) => {
    if (!task) {
      return;
    }

    const localId = nextOutgoingMessageId();
    const createdAt = new Date().toISOString();
    const normalizedText = normalizeOutgoingText(text);
    upsertTaskOutboxMessage(task.id, {
      localId,
      taskId: task.id,
      text: normalizedText,
      createdAt,
      attachments: drafts.map((item) => ({
        label: item.label,
        path: item.fileName,
      })),
      status: drafts.length > 0 ? "uploading" : "sending",
      errorMessage: null,
    });
    rememberOutgoingPayload(localId, {
      text,
      drafts,
    });
    sendMessageMutation.mutate({
      localId,
      taskId: task.id,
      createdAt,
      text,
      drafts,
    });
  };

  const handleRetryOutgoingMessage = (message: MobileOutgoingMessageRecord) => {
    if (!task || hasInFlightOutgoing || sendMessageMutation.isPending) {
      return;
    }

    const remembered = outgoingPayloadsRef.current[message.localId];
    if (!remembered && message.attachments.length > 0) {
      setTaskDraft(task.id, message.text);
      Taro.showToast({
        title: "已恢复文本，请重新选择附件后发送",
        icon: "none",
      });
      return;
    }

    const nextCreatedAt = new Date().toISOString();
    upsertTaskOutboxMessage(task.id, {
      ...message,
      createdAt: nextCreatedAt,
      status: remembered?.drafts.length && remembered.drafts.length > 0 ? "uploading" : "sending",
      errorMessage: null,
    });
    sendMessageMutation.mutate({
      localId: message.localId,
      taskId: task.id,
      createdAt: nextCreatedAt,
      text: remembered?.text ?? message.text,
      drafts: remembered?.drafts ?? [],
    });
  };

  const handleRestoreOutgoingMessage = (message: MobileOutgoingMessageRecord) => {
    if (!task) {
      return;
    }

    setTaskDraft(task.id, message.text);
    if (message.attachments.length > 0) {
      Taro.showToast({
        title: "文本已恢复，请重新选择附件",
        icon: "none",
      });
    }
  };

  if (!task && routeTaskOutOfScope) {
    return (
      <View className={pageShellClass}>
        <View className="hero-card">
          <View className="section-title">当前任务不属于这个工作区</View>
          <View className="section-copy">
            这个任务链接已经越过当前工作区边界。请先返回任务列表重新选择，或切换到对应工作区后再继续对话。
          </View>
          <View className="task-row">
            <Button className="pill active" onClick={() => Taro.navigateBack()}>
              返回任务列表
            </Button>
            <Button className="pill" onClick={() => Taro.switchTab({ url: "/pages/me/index" })}>
              切换工作区
            </Button>
          </View>
        </View>
      </View>
    );
  }

  if (!task && liveTaskId && liveTaskQuery.isPending) {
    return (
      <View className={pageShellClass}>
        <View className="hero-card">
          <View className="section-title">正在加载实例对话</View>
          <View className="section-copy">正在同步当前 run 的消息、状态和文件摘要。</View>
        </View>
      </View>
    );
  }

  if (!task) {
    return (
      <View className={pageShellClass}>
        <View className="hero-card">
          <View className="section-title">当前工作区暂无可查看任务</View>
          <View className="section-copy">先回到工坊启动一个实例，或者切换到有任务的工作区。</View>
          <Button className="pill active" onClick={() => Taro.switchTab({ url: "/pages/workshops/index" })}>
            返回工坊
          </Button>
        </View>
      </View>
    );
  }

  return (
    <View
      className={`${pageShellClass} ${composerExpanded ? "composer-expanded" : "composer-collapsed"}`}
      data-testid="mobile-task-detail-page"
    >
      <View className="crumb-row">
        <Button className="crumb-btn" onClick={() => Taro.navigateBack()}>
          返回任务列表
        </Button>
        <Button className="tab-btn active">对话</Button>
        <Button
          className="tab-btn"
          data-testid="mobile-task-detail-open-files"
          onClick={() => Taro.navigateTo({ url: `/pages/tasks/files?id=${task.id}` })}
        >
          查看文件
        </Button>
        <Button
          className="tab-btn capture-tab-btn"
          data-testid="mobile-task-capture-session"
          disabled={!runInteractive}
          onClick={() => setCaptureSheetOpen(true)}
        >
          <Image className="inline-action-icon" src={archiveIcon} mode="aspectFit" />
          固化
        </Button>
        <Button
          className="tab-btn lifecycle-menu-btn"
          data-testid="mobile-task-lifecycle-menu"
          disabled={stopMutation.isPending || archiveMutation.isPending || restoreMutation.isPending || deleteMutation.isPending}
          onClick={openLifecycleActions}
        >
          <Image className="inline-action-icon" src={moreHorizontalIcon} mode="aspectFit" />
          管理
        </Button>
      </View>

      {liveSnapshot && liveSnapshot.lifecycle.runtimeStatus !== "ACTIVE" && liveSnapshot.lifecycle.runtimeStatus !== "NOT_STARTED" ? (
        <View
          className={`lifecycle-banner ${liveSnapshot.lifecycle.deletionFailure || ["RELEASE_FAILED", "ORPHANED"].includes(liveSnapshot.lifecycle.runtimeStatus) ? "warn" : liveSnapshot.lifecycle.runtimeStatus === "RELEASED" ? "success" : "active"}`}
          data-testid="mobile-task-lifecycle-status"
        >
          <View>
            <View className="lifecycle-banner-title">
              {liveSnapshot.lifecycle.deletionFailure
                ? "实例销毁未完成"
                : liveSnapshot.lifecycle.runtimeStatus === "RELEASED"
                ? "运行环境已释放"
                : ["RELEASE_FAILED", "ORPHANED"].includes(liveSnapshot.lifecycle.runtimeStatus)
                  ? "运行环境释放失败"
                  : "正在停止并释放运行环境"}
            </View>
            <View className="lifecycle-banner-copy">
              {liveSnapshot.lifecycle.deletionFailure
                ? liveSnapshot.lifecycle.deletionFailure
                : liveSnapshot.lifecycle.releaseFailure
                ? liveSnapshot.lifecycle.releaseFailure
                : liveSnapshot.lifecycle.runtimeStatus === "RELEASED"
                  ? "当前实例不再占用运行资源，消息和结果文件继续保留。"
                  : "停止期间已锁定消息发送和审批操作。"}
            </View>
          </View>
          <View className="pill">{liveSnapshot.lifecycle.runtimeStatus}</View>
        </View>
      ) : null}

      <View className={`task-shell ${summaryOpen ? "is-open" : ""}`}>
        <Button
          className="card-hit task-shell-toggle"
          data-testid="mobile-task-summary-toggle"
          aria-expanded={summaryOpen}
          onClick={() => setSummaryOpen((value) => !value)}
        >
          <View className="task-top">
            <View className="task-main">
              <View className="task-shell-title">{task.title}</View>
              <View className="task-shell-meta">
                工坊：{task.workshop} / 空间：{currentWorkspace.name} / 实例：{task.runRef}
              </View>
            </View>
            <View className="task-toggle">
              <View className={`pill ${task.statusClass}`}>{task.statusLabel}</View>
              <View className="chevron-wrap">
                <View className="chevron" />
              </View>
            </View>
          </View>
          <View className="pill-row" style={{ marginTop: "10px" }}>
            <View className="pill active">阶段：{task.stage}</View>
            <View className="pill">{task.eta}</View>
            <View className="pill warn">待审批：{task.approvals}</View>
          </View>
        </Button>

        {summaryOpen ? (
          <View className="task-body">
            <View className="summary-grid">
              <View className="summary-card">
                <View className="summary-label">当前目标</View>
                <View className="summary-value">{task.objective}</View>
              </View>
              <View className="summary-card">
                <View className="summary-label">运行元数据</View>
                <View className="summary-value">{task.runtimeSummary}</View>
              </View>
              <View className="summary-card">
                <View className="summary-label">Provider 路由</View>
                <View className="summary-value">{task.providerSummary}</View>
              </View>
              <View className="summary-card">
                <View className="summary-label">工作目录</View>
                <View className="summary-value">{task.targetPath}</View>
              </View>
              <View className="summary-card">
                <View className="summary-label">任务标签</View>
                <View className="summary-value">{task.tags.slice(0, 2).join(" ")}</View>
              </View>
              {informationCollectionVisible && informationCollection ? (
                <View className="summary-card">
                  <View className="summary-label">待补信息</View>
                  <View className="summary-value">
                    {informationCollection.missingCount} / {informationCollection.requiredCount}
                  </View>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}
      </View>

      {liveMode && informationCollectionVisible && informationCollection ? (
        <View className="module-card" data-testid="mobile-task-information-collection">
          <View className="section-head">
            <View>
              <View className="module-title">信息采集</View>
              <View className="section-copy">{informationCollection.prompt}</View>
            </View>
            <View
              className={`pill ${
                informationCollection.status === "completed"
                  ? "success"
                  : informationCollection.status === "in_progress"
                    ? "active"
                    : "warn"
              }`}
            >
              {informationCollectionStatusLabel(informationCollection.status)}
            </View>
          </View>

          <View className="summary-grid">
            <View className="summary-card">
              <View className="summary-label">必填项</View>
              <View className="summary-value">{informationCollection.requiredCount}</View>
            </View>
            <View className="summary-card">
              <View className="summary-label">已满足</View>
              <View className="summary-value">{informationCollection.satisfiedCount}</View>
            </View>
            <View className="summary-card">
              <View className="summary-label">缺失项</View>
              <View className="summary-value">{informationCollection.missingCount}</View>
            </View>
            <View className="summary-card">
              <View className="summary-label">附件数</View>
              <View className="summary-value">{informationCollection.attachmentCount}</View>
            </View>
          </View>

          {informationCollectionItems.length > 0 ? (
            <View className="module-list">
              {informationCollectionItems.map((item) => (
                <View className="module-item" key={item}>
                  <View className="status-dot" />
                  <View className="path-helper">{item}</View>
                </View>
              ))}
            </View>
          ) : null}

          {reviewableInformationAnswers.length > 0 ? (
            <View className="review-summary">
              <View className="section-head">
                <View>
                  <View className="module-title">答案复核</View>
                  <View className="section-copy">
                    在当前任务内直接复核结构化答案，必要时改写后再继续执行。
                  </View>
                </View>
              </View>

              <View className="pill-row">
                <View
                  className="pill active"
                  data-testid="mobile-task-review-count-pending"
                >
                  待复核 {informationCollection.pendingReviewCount}
                </View>
                <View
                  className="pill success"
                  data-testid="mobile-task-review-count-approved"
                >
                  已通过 {informationCollection.approvedReviewCount}
                </View>
                <View
                  className="pill warn"
                  data-testid="mobile-task-review-count-rejected"
                >
                  已驳回 {informationCollection.rejectedReviewCount}
                </View>
              </View>

              {reviewError ? <View className="inline-error-banner">{reviewError}</View> : null}

              <View className="module-list">
                {reviewableInformationAnswers.slice(0, 4).map((answer) => {
                  const reviewForm =
                    reviewFormsByAnswerId[answer.answerId] ?? createDefaultReviewFormState(answer);

                  return (
                    <View
                      className="review-answer-card"
                      key={answer.answerId}
                      data-testid={`mobile-task-review-answer-${answer.answerId}`}
                    >
                      <View className="review-answer-head">
                        <View className="review-answer-main">
                          <View className="review-answer-title">{answer.slotTitle}</View>
                          <View className="review-answer-meta">
                            <View
                              className={`pill ${informationCollectionAnswerReviewTone(answer.reviewStatus)}`}
                            >
                              {informationCollectionAnswerReviewStatusLabel(answer.reviewStatus)}
                            </View>
                            <View className="pill">
                              {informationCollectionAnswerSourceLabel(answer.source)}
                            </View>
                          </View>
                        </View>
                      </View>

                      <View className="review-answer-preview">
                        {informationCollectionAnswerPreview(answer)}
                      </View>

                      {answer.reviewNote ? (
                        <View className="section-copy">最新备注：{answer.reviewNote}</View>
                      ) : null}

                      <View className="module-action-row">
                        <Button
                          className="pill active"
                          data-testid={`mobile-task-review-approve-${answer.answerId}`}
                          disabled={reviewMutation.isPending}
                          onClick={() => handleQuickReviewDecision(answer, "approve")}
                        >
                          通过
                        </Button>
                        <Button
                          className="pill warn"
                          data-testid={`mobile-task-review-reject-${answer.answerId}`}
                          disabled={reviewMutation.isPending}
                          onClick={() => handleQuickReviewDecision(answer, "reject")}
                        >
                          驳回
                        </Button>
                        <Button
                          className="pill"
                          disabled={reviewMutation.isPending}
                          onClick={() =>
                            reviewForm.open ? closeReviewForm(answer) : openReviewForm(answer)
                          }
                        >
                          {reviewForm.open ? "收起改写" : "改写"}
                        </Button>
                      </View>

                      {reviewForm.open ? (
                        <View className="review-form">
                          {answer.kind === "text" ? (
                            <Textarea
                              className="composer-box composer-input review-form-textarea"
                              value={reviewForm.replacementValueText}
                              maxlength={4000}
                              placeholder="填写替换后的结构化文本答案"
                              onInput={(event) =>
                                updateReviewForm(answer.answerId, (current) => ({
                                  ...current,
                                  replacementValueText: event.detail.value,
                                }))
                              }
                            />
                          ) : (
                            <View className="review-form-grid">
                              <View className="path-input-shell">
                                <Input
                                  className="path-input mono"
                                  value={reviewForm.replacementAttachmentPath}
                                  placeholder="新的文件路径"
                                  onInput={(event) =>
                                    updateReviewForm(answer.answerId, (current) => ({
                                      ...current,
                                      replacementAttachmentPath: event.detail.value,
                                    }))
                                  }
                                />
                              </View>
                              <View className="path-input-shell">
                                <Input
                                  className="path-input"
                                  value={reviewForm.replacementAttachmentLabel}
                                  placeholder="新的文件标签（可选）"
                                  onInput={(event) =>
                                    updateReviewForm(answer.answerId, (current) => ({
                                      ...current,
                                      replacementAttachmentLabel: event.detail.value,
                                    }))
                                  }
                                />
                              </View>
                            </View>
                          )}

                          <Textarea
                            className="composer-box composer-input review-note-input"
                            value={reviewForm.note}
                            maxlength={2000}
                            placeholder="填写复核备注（可选）"
                            onInput={(event) =>
                              updateReviewForm(answer.answerId, (current) => ({
                                ...current,
                                note: event.detail.value,
                              }))
                            }
                          />

                          <View className="module-action-row">
                            <Button
                              className="pill active"
                              data-testid={`mobile-task-review-submit-${answer.answerId}`}
                              disabled={reviewMutation.isPending}
                              onClick={() => handleRevisionSubmit(answer)}
                            >
                              {reviewMutation.isPending ? "提交中" : "提交改写"}
                            </Button>
                            <Button
                              className="pill"
                              disabled={reviewMutation.isPending}
                              onClick={() => closeReviewForm(answer)}
                            >
                              取消
                            </Button>
                          </View>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>

              {reviewableInformationAnswers.length > 4 ? (
                <View className="review-answer-more">
                  其余 {reviewableInformationAnswers.length - 4} 条答案仍可在当前任务内继续复核。
                </View>
              ) : null}
            </View>
          ) : null}

          <View className="module-action-row">
            <Button
              className="pill active"
              onClick={() =>
                applyInlineDraft("请逐项告诉我当前还缺哪些信息，并按顺序引导我补齐。")
              }
            >
              查看缺口
            </Button>
            <Button
              className="pill"
              onClick={() => applyInlineDraft(informationCollection.prompt)}
            >
              继续引导
            </Button>
          </View>
        </View>
      ) : null}

      {liveMode && summaryOpen ? (
        <View className="module-card">
          <View className="section-head">
            <View>
              <View className="module-title">计费明细</View>
              <View className="section-copy">
                当前实例的消息、上传、文件访问、下载与运行时长实时计量。
              </View>
            </View>
            <View
              className={`pill ${
                (billingSummaryQuery.data?.totalEntriesCount ?? 0) > 0 ? "active" : ""
              }`}
            >
              {billingSummaryQuery.data?.totalEntriesCount ?? 0} 条
            </View>
          </View>

          {(billingSummaryQuery.data?.totalEntriesCount ?? 0) > 0 ? (
            <>
              <View className="summary-grid">
                <View className="summary-card">
                  <View className="summary-label">累计金额</View>
                  <View className="summary-value">
                    {formatBillingUsd(billingSummaryQuery.data?.totalAmountUsd ?? 0)}
                  </View>
                </View>
                <View className="summary-card">
                  <View className="summary-label">计量条目</View>
                  <View className="summary-value">
                    {billingSummaryQuery.data?.totalEntriesCount ?? 0}
                  </View>
                </View>
                <View className="summary-card">
                  <View className="summary-label">主要指标</View>
                  <View className="summary-value">
                    {topBillingMetric?.label.zh ?? topBillingMetric?.label.en ?? "--"}
                  </View>
                </View>
                <View className="summary-card">
                  <View className="summary-label">最近更新</View>
                  <View className="summary-value">
                    {formatBillingTime(billingSummaryQuery.data?.updatedAt ?? null)}
                  </View>
                </View>
              </View>

              {recentBillingEntries.length > 0 ? (
                <View className="module-list">
                  {recentBillingEntries.map((entry) => (
                    <View className="module-item" key={entry.entryId}>
                      <View className="status-dot" />
                      <View>
                        <View className="file-name">
                          {billingSourceLabel(entry.source)} / {entry.metric}
                        </View>
                        <View className="path-helper">
                          {formatBillingQuantity(entry.quantity)} 单位 / {billingCostBasisLabel(entry.costBasis)} / {formatBillingTime(entry.occurredAt)}
                        </View>
                      </View>
                      <View className={`pill ${billingSourceTone(entry.source)}`}>
                        {formatBillingUsd(entry.amountUsd)}
                      </View>
                    </View>
                  ))}
                </View>
              ) : null}
            </>
          ) : (
            <View className="section-copy">
              当前实例尚未产生可计费活动。
            </View>
          )}
        </View>
      ) : null}

      {liveMode && summaryOpen ? (
        <View className="module-card">
          <View className="section-head">
            <View>
              <View className="module-title">MCP 活动</View>
              <View className="section-copy">
                这里展示当前实例真实发生的 connector 和 tool 调用，便于判断外部能力、风险级别和策略命中情况。
              </View>
            </View>
            <View className={`pill ${mcpIssueCount > 0 ? "warn" : recentMcpCalls.length > 0 ? "active" : ""}`}>
              {mcpCallsQuery.isFetching ? "同步中" : `${recentMcpCalls.length} 条`}
            </View>
          </View>

          {recentMcpCalls.length > 0 ? (
            <>
              <View className="summary-grid">
                <View className="summary-card">
                  <View className="summary-label">调用数</View>
                  <View className="summary-value">{recentMcpCalls.length}</View>
                </View>
                <View className="summary-card">
                  <View className="summary-label">连接器</View>
                  <View className="summary-value">{distinctMcpCount}</View>
                </View>
                <View className="summary-card">
                  <View className="summary-label">最近发生</View>
                  <View className="summary-value">{formatBillingTime(latestMcpCall?.occurredAt ?? null)}</View>
                </View>
                <View className="summary-card">
                  <View className="summary-label">异常/拦截</View>
                  <View className="summary-value">{mcpIssueCount}</View>
                </View>
              </View>

              <View className="module-list">
                {recentMcpCalls.map((call) => (
                  <View className="module-item" key={call.callId}>
                    <View className="status-dot" />
                    <View>
                      <View className="file-name">
                        {call.displayName} / {call.toolName}
                      </View>
                      <View className="path-helper">
                        {mcpCallStatusLabel(call.status)} / {mcpRiskLabel(call.riskLevel)} / {call.durationMs !== null ? `${call.durationMs} ms` : "--"}
                      </View>
                      <View className="path-helper">
                        {call.source} / {call.transport} / I {formatDataVolume(call.inputBytes)} / O {formatDataVolume(call.outputBytes)}
                      </View>
                      {call.inputSummary ? <View className="section-copy">{call.inputSummary}</View> : null}
                      {call.errorMessage ? <View className="section-copy">{call.errorMessage}</View> : null}
                    </View>
                    <View className={`pill ${mcpCallStatusTone(call.status)}`}>
                      {mcpCallStatusLabel(call.status)}
                    </View>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <View className="section-copy">
              {mcpCallsQuery.isFetching ? "正在同步 MCP 审计记录。" : "当前实例还没有记录到 MCP 调用。"}
            </View>
          )}
        </View>
      ) : null}

      {liveMode && pendingApproval ? (
        <View className="module-card approval" data-testid="mobile-task-pending-approval">
          <View className="section-head">
            <View>
              <View className="module-title">{approvalHeadline}</View>
              <View className="section-copy">{approvalSummary}</View>
            </View>
            <View className={`pill ${pendingQuotaApproval ? "warn" : "active"}`}>
              {pendingQuotaApproval ? "配额" : "审批"}
            </View>
          </View>

          {pendingQuotaOverride ? (
            <View className="summary-grid">
              <View className="summary-card">
                <View className="summary-label">指标</View>
                <View className="summary-value">
                  {quotaMetricLabel(pendingQuotaOverride.metric)}
                </View>
              </View>
              <View className="summary-card">
                <View className="summary-label">用量</View>
                <View className="summary-value">
                  {summarizeQuotaOverride(pendingQuotaOverride)}
                </View>
              </View>
              <View className="summary-card">
                <View className="summary-label">范围</View>
                <View className="summary-value">
                  {quotaScopeLabel(pendingQuotaOverride.scopeType)}
                </View>
              </View>
              <View className="summary-card">
                <View className="summary-label">审批角色</View>
                <View className="summary-value">{pendingQuotaOverride.requiredRole}</View>
              </View>
            </View>
          ) : null}

          {recentQuotaEvents.length > 0 ? (
            <View className="module-list">
              {recentQuotaEvents.map((event) => (
                <View className="module-item" key={event.eventId}>
                  <View className="status-dot" />
                  <View>
                    <View className="file-name">
                      {quotaDecisionLabel(event.decision)} · {quotaMetricLabel(event.metric)}
                    </View>
                    <View className="path-helper">
                      {latestQuotaEventNote(event)} · {formatQuotaTime(event.occurredAt)}
                    </View>
                  </View>
                  <View className={`pill ${quotaDecisionTone(event.decision)}`}>
                    {formatQuotaValue(event.metric, event.currentValue)}
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          <View className="module-action-row">
            <Button
              className="pill active"
              data-testid="mobile-task-approve-button"
              disabled={approvalMutation.isPending}
              onClick={() => handleApprovalDecision(true)}
            >
              {approvalMutation.isPending ? "提交中" : "批准"}
            </Button>
            <Button
              className="pill warn"
              data-testid="mobile-task-reject-button"
              disabled={approvalMutation.isPending}
              onClick={() => handleApprovalDecision(false)}
            >
              驳回
            </Button>
            <Button
              className="pill"
              data-testid="mobile-task-ask-approval"
              onClick={() =>
                applyInlineDraft(
                  pendingQuotaOverride
                    ? `请说明 ${quotaMetricLabel(
                        pendingQuotaOverride.metric
                      )} 超出当前限额的原因，便于我决定是否批准。`
                    : "请说明本次审批请求的原因，便于我决定是否批准。"
                )
              }
            >
              询问 Codex
            </Button>
          </View>

          {pendingQuotaOverride ? (
            <View className="pill-row">
              <View className={`pill ${quotaDecisionTone(pendingQuotaOverride.status)}`}>
                {quotaOverrideStatusLabel(pendingQuotaOverride.status)}
              </View>
              <View className="pill">{pendingQuotaOverride.requiredRole}</View>
            </View>
          ) : null}
        </View>
      ) : null}

      <View className="thread">
        {displayedMessages.map((message, index) => (
          <View className="message-shell" key={message.localId ?? `${message.time}-${index}`}>
            <View className={`message-card ${message.kind}`}>
              <View className="message-head">
                <View className="message-identity">
                  <View className={`message-role-marker ${message.kind}`} />
                  <View className="role">{message.role}</View>
                </View>
                <View className="message-head-actions">
                  <View className="time">{message.time}</View>
                  <Button
                    aria-label={`复制${message.role}消息`}
                    className="message-copy-button"
                    data-testid={`mobile-message-copy-${index}`}
                    onClick={() => void copyMessageText(message.body)}
                  >
                    <Image className="message-copy-icon" src={copyIcon} mode="aspectFit" />
                  </Button>
                </View>
              </View>
              <MobileMessageContent
                runId={task.id}
                targetPath={task.targetPath}
                text={message.body}
                attachments={message.attachments}
                onOpenFile={(filePath) =>
                  Taro.navigateTo({
                    url: `/pages/tasks/files?id=${encodeURIComponent(task.id)}&path=${encodeURIComponent(filePath)}`,
                  })
                }
              />
              {message.deliveryStatus ? (
                <View className="message-status-row">
                  <View className={`pill ${deliveryStatusTone(message.deliveryStatus)}`}>
                    {deliveryStatusLabel(message.deliveryStatus)}
                  </View>
                  {message.errorMessage ? (
                    <View className="message-status-copy">{message.errorMessage}</View>
                  ) : null}
                </View>
              ) : null}
              {message.attachments?.some(
                (attachment) => !isAgentMediaAttachment(attachment.path, task.targetPath)
              ) ? (
                <View className="message-attachment-list">
                  {message.attachments
                    .filter(
                      (attachment) => !isAgentMediaAttachment(attachment.path, task.targetPath)
                    )
                    .map((attachment) => (
                      <View className="message-attachment-chip" key={`${attachment.path}-${attachment.label}`}>
                        <View className="message-attachment-label">{attachment.label}</View>
                        <View className="message-attachment-meta mono">{attachment.path}</View>
                      </View>
                    ))}
                </View>
              ) : null}
            </View>
            {message.localId && message.deliveryStatus === "failed" ? (
              <View className="module-action-row">
                <Button
                  className="pill active"
                  data-testid={`mobile-task-retry-${message.localId}`}
                  disabled={sendMessageMutation.isPending || hasInFlightOutgoing}
                  onClick={() => {
                    const outgoing = outgoingMessages.find((item) => item.localId === message.localId);
                    if (!outgoing) {
                      return;
                    }

                    handleRetryOutgoingMessage(outgoing);
                  }}
                >
                  重新发送
                </Button>
                <Button
                  className="pill"
                  data-testid={`mobile-task-restore-${message.localId}`}
                  onClick={() => {
                    const outgoing = outgoingMessages.find((item) => item.localId === message.localId);
                    if (!outgoing) {
                      return;
                    }

                    handleRestoreOutgoingMessage(outgoing);
                  }}
                >
                  恢复到输入框
                </Button>
              </View>
            ) : null}
            {message.module ? (
              <View className={`module-card message-module ${message.module.type}`}>
                <View className="section-head">
                  <View>
                    <View className="module-title">{message.module.title}</View>
                    <View className="section-copy">{message.module.summary}</View>
                  </View>
                  <View className={`pill ${message.module.type === "approval" ? "warn" : message.module.type === "result" ? "success" : message.module.type === "error" ? "warn" : "active"}`}>
                    {message.module.status}
                  </View>
                </View>
                {message.module.items?.length ? (
                  <View className="module-list">
                    {message.module.items.map((item) => (
                      <View className="module-item" key={item}>
                        <View className="status-dot" />
                        <View className="path-helper">{item}</View>
                      </View>
                    ))}
                  </View>
                ) : null}
                <View className="module-action-row">
                  {message.module.primaryAction ? (
                    <Button
                      className="pill active"
                      onClick={() => {
                        if (message.module?.type === "file" || message.module?.type === "result") {
                          Taro.navigateTo({ url: `/pages/tasks/files?id=${task.id}` });
                          return;
                        }

                        applyInlineDraft(message.module?.primaryDraft);
                      }}
                    >
                      {message.module.primaryAction}
                    </Button>
                  ) : null}
                  {message.module.secondaryAction ? (
                    <Button
                      className="pill"
                      onClick={() => {
                        if (message.module?.secondaryDraft) {
                          applyInlineDraft(message.module.secondaryDraft);
                        }
                      }}
                    >
                      {message.module.secondaryAction}
                    </Button>
                  ) : null}
                </View>
              </View>
            ) : null}
          </View>
        ))}
      </View>

      {runInteractive ? (
        <View
          className={`composer task-composer ${composerExpanded ? "expanded" : "collapsed"}`}
          data-testid="mobile-task-composer"
        >
        <Button
          className="task-composer-toggle"
          data-testid="mobile-task-composer-toggle"
          aria-expanded={composerExpanded}
          onClick={() => setComposerExpanded((current) => !current)}
        >
          <View className="task-composer-title-group">
            <View className="task-composer-title">继续对话</View>
            {!composerExpanded ? (
              <View className="task-composer-preview">
                {draft.trim()
                  ? draft.trim()
                  : attachmentDrafts.length > 0
                    ? `已选择 ${attachmentDrafts.length} 个附件`
                    : "点按展开输入"}
              </View>
            ) : null}
          </View>
          <View className="task-composer-head-actions">
            <View
              className={`task-connection-state ${runStream.connected ? "online" : ""}`}
              data-testid="mobile-task-connection-state"
            >
              <View className="task-connection-dot" />
              {runStream.connected ? "实时连接" : "正在连接"}
            </View>
            <Image
              className={`task-composer-chevron ${composerExpanded ? "expanded" : "collapsed"}`}
              src={chevronDownIcon}
              mode="aspectFit"
            />
          </View>
        </Button>
        {composerExpanded ? (
          <>
            <Textarea
              className="composer-box composer-input task-composer-input"
              data-testid="mobile-task-composer-input"
              value={draft}
              maxlength={2000}
              placeholder="继续提问、补充材料说明，或者告诉 Codex 下一步要做什么"
              onFocus={() => setComposerExpanded(true)}
              onInput={(event) => {
                if (!task) {
                  return;
                }

                setTaskDraft(task.id, event.detail.value);
              }}
            />
            {attachmentDrafts.length > 0 ? (
              <View className="attachment-draft-list" data-testid="mobile-task-attachment-drafts">
                {attachmentDrafts.map((attachment) => (
                  <View
                    className="attachment-draft-card"
                    data-testid={`mobile-task-attachment-draft-${attachment.id}`}
                    key={attachment.id}
                  >
                    <View>
                      <View className="attachment-draft-title">{attachment.label}</View>
                      <View className="attachment-draft-meta">
                        {formatAttachmentSize(attachment.sizeBytes)}
                        {attachment.contentType ? ` / ${attachment.contentType}` : ""}
                      </View>
                    </View>
                    <Button
                      className="pill warn"
                      data-testid={`mobile-task-attachment-remove-${attachment.id}`}
                      onClick={() =>
                        setTaskAttachments(
                          task.id,
                          attachmentDrafts.filter((item) => item.id !== attachment.id)
                        )
                      }
                    >
                      移除
                    </Button>
                  </View>
                ))}
              </View>
            ) : null}
            <View className="approval-mode-control task-approval-mode-control" data-testid="mobile-approval-mode-control">
              <View>
                <View className="approval-mode-title">全自动审批</View>
                <View className="approval-mode-description">
                  {liveSnapshot?.run.approvalMode === "auto_all"
                    ? "所有审批请求将自动通过"
                    : "敏感操作等待人工确认"}
                </View>
              </View>
              <Switch
                data-testid="mobile-approval-mode-toggle"
                checked={liveSnapshot?.run.approvalMode === "auto_all"}
                disabled={approvalModeMutation.isPending}
                color="#2f6fed"
                onChange={(event) =>
                  approvalModeMutation.mutate(event.detail.value ? "auto_all" : "manual")
                }
              />
            </View>
            <View className="composer-row">
              <View className="task-row">
                <Button
                  className="pill composer-tool-button"
                  data-testid="mobile-task-add-attachments"
                  disabled={sendMessageMutation.isPending || hasInFlightOutgoing}
                  onClick={async () => {
                    try {
                      const picked = await pickLocalAttachments({ multiple: true });
                      if (!picked.length || !task) {
                        return;
                      }

                      setTaskAttachments(task.id, [...attachmentDrafts, ...picked]);
                    } catch (error) {
                      Taro.showToast({
                        title: error instanceof Error ? error.message : "暂不支持选择附件",
                        icon: "none",
                      });
                    }
                  }}
                >
                  附件
                </Button>
                <Button
                  className="pill composer-tool-button"
                  onClick={() =>
                    applyInlineDraft("请告诉我当前待审批动作是什么，并引导我逐项确认。")
                  }
                >
                  审批
                </Button>
              </View>
              <Button
                className="send-btn composer-send-button"
                data-testid="mobile-task-send-button"
                disabled={
                  sendMessageMutation.isPending ||
                  hasInFlightOutgoing ||
                  (!draft.trim() && attachmentDrafts.length === 0)
                }
                onClick={() => {
                  if (!draft.trim() && attachmentDrafts.length === 0) {
                    return;
                  }

                  queueOutgoingMessage(draft, attachmentDrafts);
                }}
              >
                {sendMessageMutation.isPending || hasInFlightOutgoing
                  ? attachmentDrafts.length > 0
                    ? "上传并发送中"
                    : "发送处理中"
                  : "发送"}
              </Button>
            </View>
          </>
        ) : null}
        </View>
      ) : (
        <View className="composer task-composer lifecycle-composer" data-testid="mobile-task-terminal-actions">
          <View>
            <View className="task-composer-title">
              {runtimeTransitioning
                ? "正在停止实例"
                : liveSnapshot && ["RELEASE_FAILED", "ORPHANED"].includes(liveSnapshot.lifecycle.runtimeStatus)
                  ? "运行环境释放失败"
                  : "实例已结束"}
            </View>
            <View className="task-composer-preview terminal">
              {runtimeTransitioning
                ? "完成释放后可继续查看文件和归档实例"
                : "当前会话已锁定，可查看结果、归档或删除"}
            </View>
          </View>
          <View className="lifecycle-composer-actions">
            <Button className="pill" onClick={() => Taro.navigateTo({ url: `/pages/tasks/files?id=${task.id}` })}>查看文件</Button>
            <Button className="pill active" onClick={openLifecycleActions}>管理实例</Button>
          </View>
        </View>
      )}

      {captureSheetOpen ? (
        <View className="capture-sheet-layer">
          <View className="capture-sheet-backdrop" onClick={() => setCaptureSheetOpen(false)} />
          <View className="capture-sheet" data-testid="mobile-task-capture-sheet">
            <View className="sheet-handle" />
            <View className="capture-sheet-head">
              <View className="capture-sheet-title-wrap">
                <Image className="capture-sheet-icon" src={archiveIcon} mode="aspectFit" />
                <View>
                  <View className="section-title">固化当前会话</View>
                  <View className="section-copy">完整会话、业务文件与运行产物</View>
                </View>
              </View>
              <Button className="pill" onClick={() => setCaptureSheetOpen(false)}>关闭</Button>
            </View>

            {activeCapture ? (
              <View className="capture-mobile-progress">
                <View className="capture-mobile-status">
                  <View>
                    <View className="summary-label">Capture 状态</View>
                    <View className="summary-value">{activeCapture.status}</View>
                  </View>
                  <View className={`pill ${captureStatusTone(activeCapture.status)}`}>
                    {formatCaptureBytes(activeCapture.capturedBytes)}
                  </View>
                </View>
                <View className="capture-mobile-track">
                  <View style={{ width: activeCapture.status === "CAPTURED" ? "100%" : activeCapture.status === "VERIFYING" ? "88%" : activeCapture.status === "UPLOADING" ? "68%" : activeCapture.status === "CAPTURING_WORKSPACE" ? "48%" : "24%" }} />
                </View>
                <View className="capture-mobile-grid">
                  <View><View className="summary-label">事件</View><View className="summary-value">{activeCapture.eventCount}</View></View>
                  <View><View className="summary-label">文件</View><View className="summary-value">{activeCapture.fileCount}</View></View>
                  <View><View className="summary-label">安全</View><View className="summary-value">{activeCapture.securityState}</View></View>
                </View>
                {activeCapture.statusReason ? <View className="inline-error-banner">{activeCapture.errorCode ? `${activeCapture.errorCode}: ` : ""}{activeCapture.statusReason}</View> : null}
                {activeCapture.status === "FAILED" ? (
                  <Button className="send-btn" onClick={() => mobileSessionCapturesApi.retry(activeCapture.captureId).then(() => capturesQuery.refetch())}>重试固化</Button>
                ) : null}
                {activeCapture.status === "CAPTURED" ? (
                  <>
                    <View className="capture-mobile-success">Capture 已验证，Draft 已进入当前项目的固化流程。</View>
                    <Button
                      className="send-btn"
                      onClick={() => {
                        const projectId = liveSnapshot?.run.sessionProjectId;
                        Taro.navigateTo({
                          url: projectId
                            ? `/pages/creator/project?id=${encodeURIComponent(projectId)}`
                            : "/pages/creator/projects",
                        });
                      }}
                    >
                      审核并固化
                    </Button>
                  </>
                ) : null}
              </View>
            ) : (
              <>
                <View className="capture-mobile-grid capture-mobile-source">
                  <View><View className="summary-label">Thread</View><View className="summary-value mono">{liveSnapshot?.agentThread?.threadId ?? "--"}</View></View>
                  <View><View className="summary-label">Turn</View><View className="summary-value mono">{liveSnapshot?.agentThread?.currentTurnId ?? "--"}</View></View>
                  <View><View className="summary-label">路径</View><View className="summary-value mono">{liveSnapshot?.run.targetPath ?? "--"}</View></View>
                </View>
                <View className="capture-mobile-note">系统将排除 Git、依赖目录、环境文件、Secret、缓存和 Runtime 临时目录。固化成功后当前任务结束。</View>
                {!captureReady ? <View className="inline-error-banner">当前 Turn 尚未完成，完成回复后才能固化。</View> : null}
                {captureMutation.error ? <View className="inline-error-banner">{captureMutation.error.message}</View> : null}
                <Button className="send-btn" disabled={!captureReady || captureMutation.isPending} onClick={() => captureMutation.mutate()}>
                  {captureMutation.isPending ? "提交中" : "固化并结束任务"}
                </Button>
              </>
            )}
          </View>
        </View>
      ) : null}
    </View>
  );
}
