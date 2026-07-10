import { uploadRunAttachment } from "@lingban/api-sdk";
import type { ApproveRunInput } from "@lingban/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Textarea, View } from "@tarojs/components";
import Taro, { getCurrentInstance } from "@tarojs/taro";
import { useMemo, useState } from "react";
import {
  findStaticTaskById,
  findVisibleTask,
} from "../../data/workspaceCatalog";
import { formatAttachmentSize, pickBrowserAttachments, type BrowserAttachmentDraft } from "../../lib/attachments";
import {
  billingSourceLabel,
  billingSourceTone,
  formatBillingQuantity,
  formatBillingUsd,
} from "../../lib/billing";
import { mobileBillingApi, mobileQuotaApi, mobileRunsApi } from "../../lib/api";
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
import { useMobileUiStore } from "../../stores/mobileUiStore";

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

function formatBillingTime(value: string | null) {
  if (!value) {
    return "No activity yet";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-US", {
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

export default function TaskDetailPage() {
  const queryClient = useQueryClient();
  const id = getCurrentInstance().router?.params?.id;
  const liveTaskId = isLiveTaskId(id);
  const taskDrafts = useMobileUiStore((state) => state.taskDrafts);
  const setTaskDraft = useMobileUiStore((state) => state.setTaskDraft);
  const clearTaskDraft = useMobileUiStore((state) => state.clearTaskDraft);
  const currentWorkspace = useResolvedMobileWorkspace();
  const runStream = useMobileRunStream(liveTaskId ? id ?? null : null, liveTaskId);

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
  const pendingApproval = useMemo(
    () => liveSnapshot?.approvals.find((item) => item.state === "pending") ?? null,
    [liveSnapshot]
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
        return await mobileBillingApi.listEntries({ runId: id, limit: 4 });
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

  const approvalHeadline = pendingQuotaApproval ? "Quota approval pending" : "Pending approval";
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
  const staticVisibleTask = useMemo(
    () =>
      currentWorkspace.source === "static"
        ? findVisibleTask(id, currentWorkspace.id)
        : null,
    [currentWorkspace.id, currentWorkspace.source, id]
  );
  const staticTaskAcrossWorkspaces = useMemo(() => findStaticTaskById(id), [id]);
  const routeLiveTaskOutOfScope = Boolean(
    liveTaskId &&
      !liveTaskQuery.isPending &&
      mappedLiveTask &&
      mappedLiveTask.workspaceId !== currentWorkspace.id
  );
  const routeStaticTaskOutOfScope = Boolean(
    !liveTaskId &&
      currentWorkspace.source === "static" &&
      id &&
      !staticVisibleTask &&
      staticTaskAcrossWorkspaces
  );
  const routeTaskOutOfScope = routeLiveTaskOutOfScope || routeStaticTaskOutOfScope;

  const task = useMemo(() => {
    if (liveTaskId && liveTaskQuery.isPending) {
      return null;
    }

    if (mappedLiveTask) {
      if (mappedLiveTask.workspaceId === currentWorkspace.id) {
        return mappedLiveTask;
      }
    }

    if (currentWorkspace.source === "static") {
      return staticVisibleTask;
    }

    return null;
  }, [
    currentWorkspace.id,
    currentWorkspace.source,
    liveTaskId,
    liveTaskQuery.isPending,
    mappedLiveTask,
    staticVisibleTask,
  ]);

  const [summaryOpen, setSummaryOpen] = useState(true);
  const [attachmentDraftsByTask, setAttachmentDraftsByTask] = useState<
    Record<string, BrowserAttachmentDraft[]>
  >({});
  const draft = task ? taskDrafts[task.id] ?? "" : "";
  const attachmentDrafts = task ? attachmentDraftsByTask[task.id] ?? [] : [];

  const liveMode = Boolean(task && isLiveTaskId(task.id));
  const sampleMode = Boolean(task && currentWorkspace.source === "static" && !liveMode);
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
  };
  const setTaskAttachments = (taskId: string, next: BrowserAttachmentDraft[]) => {
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

  const sendMessageMutation = useMutation({
    mutationFn: async (input: { text: string; drafts: BrowserAttachmentDraft[] }) => {
      if (!task) {
        throw new Error("Task not found.");
      }

      const attachments = await Promise.all(
        input.drafts.map(async (draftAttachment) =>
          uploadRunAttachment(mobileRunsApi, task.id, {
            fileName: draftAttachment.file.name,
            contentType: draftAttachment.contentType,
            sizeBytes: draftAttachment.sizeBytes,
            content: await draftAttachment.file.arrayBuffer(),
            label: draftAttachment.label,
          })
        )
      );

      const payload = {
        text: input.text.trim() || "我补充了附件，请读取并继续。",
        attachments,
      };

      if (liveMode && runStream.sendMessage(payload)) {
        return null;
      }

      return await mobileRunsApi.sendRunMessage(task.id, payload);
    },
    onSuccess: async () => {
      if (task) {
        clearTaskDraft(task.id);
        clearTaskAttachments(task.id);
      }
      if (!task) {
        return;
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["mobile", "runs"] }),
        queryClient.invalidateQueries({ queryKey: mobileRunDetailQueryKey(task.id) }),
        queryClient.invalidateQueries({ queryKey: mobileRunFilesQueryKey(task.id) }),
        queryClient.invalidateQueries({ queryKey: ["mobile", "billing"] }),
        queryClient.invalidateQueries({ queryKey: ["mobile", "mcp-calls"] }),
      ]);
    },
    onError: (error) => {
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

      if (liveMode && runStream.approve(input)) {
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

  if (!task && routeTaskOutOfScope) {
    return (
      <View className="page-shell">
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
      <View className="page-shell">
        <View className="hero-card">
          <View className="section-title">正在加载实例对话</View>
          <View className="section-copy">正在同步当前 run 的消息、状态和文件摘要。</View>
        </View>
      </View>
    );
  }

  if (!task) {
    return (
      <View className="page-shell">
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
    <View className="page-shell" data-testid="mobile-task-detail-page">
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
      </View>

      {sampleMode ? (
        <View className="hero-card">
          <View className="card-row">
            <View>
              <View className="section-title">当前是样例任务</View>
              <View className="section-copy">
                这里保留了任务对话结构、模块卡片和文件入口，便于继续查看交互。发送消息、附件上传和审批回写只会在真实 run 中生效。
              </View>
            </View>
            <View className="pill warn">样例回退</View>
          </View>
        </View>
      ) : null}

      <View className={`task-shell ${summaryOpen ? "is-open" : ""}`}>
        <Button className="card-hit task-shell-toggle" onClick={() => setSummaryOpen((value) => !value)}>
          <View className="task-top">
            <View className="task-main">
              <View className="task-shell-title">{task.title}</View>
              <View className="task-shell-meta">
                工坊：{task.workshop} / 空间：{currentWorkspace.name} / 实例：{task.container}
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
                <View className="summary-label">挂载能力</View>
                <View className="summary-value">{task.mounted}</View>
              </View>
              <View className="summary-card">
                <View className="summary-label">工作目录</View>
                <View className="summary-value">{task.targetPath}</View>
              </View>
              <View className="summary-card">
                <View className="summary-label">任务标签</View>
                <View className="summary-value">{task.tags.slice(0, 2).join(" ")}</View>
              </View>
            </View>
          </View>
        ) : null}
      </View>

      {liveMode ? (
        <View className="module-card">
          <View className="section-head">
            <View>
              <View className="module-title">Billing ledger</View>
              <View className="section-copy">
                Live metering for this run, including messages, uploads, file access, downloads, and runtime.
              </View>
            </View>
            <View
              className={`pill ${
                (billingSummaryQuery.data?.totalEntriesCount ?? 0) > 0 ? "active" : ""
              }`}
            >
              {billingSummaryQuery.data?.totalEntriesCount ?? 0} entries
            </View>
          </View>

          {(billingSummaryQuery.data?.totalEntriesCount ?? 0) > 0 ? (
            <>
              <View className="summary-grid">
                <View className="summary-card">
                  <View className="summary-label">Amount</View>
                  <View className="summary-value">
                    {formatBillingUsd(billingSummaryQuery.data?.totalAmountUsd ?? 0)}
                  </View>
                </View>
                <View className="summary-card">
                  <View className="summary-label">Entries</View>
                  <View className="summary-value">
                    {billingSummaryQuery.data?.totalEntriesCount ?? 0}
                  </View>
                </View>
                <View className="summary-card">
                  <View className="summary-label">Top metric</View>
                  <View className="summary-value">
                    {topBillingMetric?.label.zh ?? topBillingMetric?.label.en ?? "--"}
                  </View>
                </View>
                <View className="summary-card">
                  <View className="summary-label">Latest</View>
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
                          {formatBillingQuantity(entry.quantity)} units / {entry.costBasis} / {formatBillingTime(entry.occurredAt)}
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
              No billable activity has been recorded for this run yet.
            </View>
          )}
        </View>
      ) : null}

      {liveMode ? (
        <View className="module-card">
          <View className="section-head">
            <View>
              <View className="module-title">MCP activity</View>
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
        <View className="module-card approval">
          <View className="section-head">
            <View>
              <View className="module-title">{approvalHeadline}</View>
              <View className="section-copy">{approvalSummary}</View>
            </View>
            <View className={`pill ${pendingQuotaApproval ? "warn" : "active"}`}>
              {pendingQuotaApproval ? "quota" : "approval"}
            </View>
          </View>

          {pendingQuotaOverride ? (
            <View className="summary-grid">
              <View className="summary-card">
                <View className="summary-label">Metric</View>
                <View className="summary-value">
                  {quotaMetricLabel(pendingQuotaOverride.metric)}
                </View>
              </View>
              <View className="summary-card">
                <View className="summary-label">Usage</View>
                <View className="summary-value">
                  {summarizeQuotaOverride(pendingQuotaOverride)}
                </View>
              </View>
              <View className="summary-card">
                <View className="summary-label">Scope</View>
                <View className="summary-value">
                  {quotaScopeLabel(pendingQuotaOverride.scopeType)}
                </View>
              </View>
              <View className="summary-card">
                <View className="summary-label">Role gate</View>
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
              disabled={approvalMutation.isPending}
              onClick={() => handleApprovalDecision(true)}
            >
              {approvalMutation.isPending ? "Submitting" : "Approve"}
            </Button>
            <Button
              className="pill warn"
              disabled={approvalMutation.isPending}
              onClick={() => handleApprovalDecision(false)}
            >
              Reject
            </Button>
            <Button
              className="pill"
              onClick={() =>
                applyInlineDraft(
                  pendingQuotaOverride
                    ? `Please explain why ${quotaMetricLabel(
                        pendingQuotaOverride.metric
                      )} exceeded the current limit before I decide.`
                    : "Please explain this approval request before I decide."
                )
              }
            >
              Ask Codex
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
        {task.messages.map((message, index) => (
          <View className="message-shell" key={`${message.time}-${index}`}>
            <View className={`message-card ${message.kind}`}>
              <View className="message-head">
                <View className={`avatar ${message.kind}`}>
                  {message.kind === "agent" ? "C" : message.kind === "user" ? "你" : "系"}
                </View>
                <View>
                  <View className="role">{message.role}</View>
                  <View className="time">{message.time}</View>
                </View>
              </View>
              <View className="message-body">{message.body}</View>
              {message.attachments?.length ? (
                <View className="message-attachment-list">
                  {message.attachments.map((attachment) => (
                    <View className="message-attachment-chip" key={`${attachment.path}-${attachment.label}`}>
                      <View className="message-attachment-label">{attachment.label}</View>
                      <View className="message-attachment-meta mono">{attachment.path}</View>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
            {message.module ? (
              <View className={`module-card ${message.module.type}`}>
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

      <View className="composer">
        {liveMode ? (
          <>
            <Textarea
              className="composer-box composer-input"
              value={draft}
              maxlength={2000}
              placeholder="继续提问、补充材料说明，或者告诉 Codex 下一步要做什么"
              onInput={(event) => {
                if (!task) {
                  return;
                }

                setTaskDraft(task.id, event.detail.value);
              }}
            />
            {attachmentDrafts.length > 0 ? (
              <View className="attachment-draft-list">
                {attachmentDrafts.map((attachment) => (
                  <View className="attachment-draft-card" key={attachment.id}>
                    <View>
                      <View className="attachment-draft-title">{attachment.label}</View>
                      <View className="attachment-draft-meta">
                        {formatAttachmentSize(attachment.sizeBytes)}
                        {attachment.contentType ? ` / ${attachment.contentType}` : ""}
                      </View>
                    </View>
                    <Button
                      className="pill warn"
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
            <View className="composer-row">
              <View className="task-row">
                <Button
                  className="pill"
                  disabled={sendMessageMutation.isPending}
                  onClick={async () => {
                    try {
                      const picked = await pickBrowserAttachments({ multiple: true });
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
                  className="pill"
                  onClick={() =>
                    applyInlineDraft("请告诉我当前待审批动作是什么，并引导我逐项确认。")
                  }
                >
                  审批
                </Button>
              </View>
              <Button
                className="send-btn"
                disabled={
                  sendMessageMutation.isPending ||
                  (!draft.trim() && attachmentDrafts.length === 0)
                }
                onClick={() => {
                  if (!draft.trim() && attachmentDrafts.length === 0) {
                    return;
                  }

                  sendMessageMutation.mutate({
                    text: draft,
                    drafts: attachmentDrafts,
                  });
                }}
              >
                {sendMessageMutation.isPending
                  ? attachmentDrafts.length > 0
                    ? "上传并发送中"
                    : "发送中"
                  : runStream.connected
                    ? "实时发送"
                    : "发送"}
              </Button>
            </View>
          </>
        ) : (
          <>
            <View className="composer-box">
              当前页展示的是样例对话结构。要继续发送消息、补充材料或处理审批，需要先从工坊启动一个真实实例。
            </View>
            <View className="composer-row">
              <View className="task-row">
                <Button
                  className="pill"
                  onClick={() => Taro.navigateTo({ url: `/pages/tasks/files?id=${task.id}` })}
                >
                  查看文件
                </Button>
                <Button
                  className="pill"
                  onClick={() => Taro.switchTab({ url: "/pages/workshops/index" })}
                >
                  去工坊
                </Button>
              </View>
              <Button
                className="send-btn"
                onClick={() => Taro.switchTab({ url: "/pages/workshops/index" })}
              >
                启动真实实例
              </Button>
            </View>
          </>
        )}
      </View>
    </View>
  );
}
