import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Textarea, View } from "@tarojs/components";
import Taro, { getCurrentInstance } from "@tarojs/taro";
import { useEffect, useMemo, useState } from "react";
import {
  findVisibleTask,
  getWorkspaceEntry,
  normalizeMobileWorkspaceId,
} from "../../data/workspaceCatalog";
import { mobileRunsApi } from "../../lib/api";
import { isLiveTaskId, mapRunSnapshotToMobileTask } from "../../lib/liveTaskAdapters";
import { useMobileRunStream } from "../../lib/runStream";
import { useMobileUiStore } from "../../stores/mobileUiStore";

export default function TaskDetailPage() {
  const queryClient = useQueryClient();
  const id = getCurrentInstance().router?.params?.id;
  const liveTaskId = isLiveTaskId(id);
  const currentWorkspaceId = useMobileUiStore((state) => state.currentWorkspaceId);
  const taskDrafts = useMobileUiStore((state) => state.taskDrafts);
  const setTaskDraft = useMobileUiStore((state) => state.setTaskDraft);
  const clearTaskDraft = useMobileUiStore((state) => state.clearTaskDraft);
  const currentWorkspace = getWorkspaceEntry(currentWorkspaceId);
  const runStream = useMobileRunStream(liveTaskId ? id ?? null : null, liveTaskId);

  const liveTaskQuery = useQuery({
    enabled: liveTaskId,
    queryKey: ["mobile", "runs", id],
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

  const task = useMemo(() => {
    if (liveTaskId && liveTaskQuery.isPending) {
      return null;
    }

    if (liveTaskQuery.data) {
      const liveTask = mapRunSnapshotToMobileTask(liveTaskQuery.data);
      if (normalizeMobileWorkspaceId(liveTask.workspaceId) === currentWorkspace.id) {
        return liveTask;
      }
    }

    return findVisibleTask(id, currentWorkspace.id);
  }, [currentWorkspace.id, id, liveTaskId, liveTaskQuery.data, liveTaskQuery.isPending]);

  useEffect(() => {
    if (!id || !task || task.id === id || (liveTaskId && liveTaskQuery.isPending)) {
      return;
    }

    Taro.redirectTo({ url: `/pages/tasks/detail?id=${task.id}` });
  }, [id, liveTaskId, liveTaskQuery.isPending, task]);

  const [summaryOpen, setSummaryOpen] = useState(true);
  const draft = task ? taskDrafts[task.id] ?? "" : "";

  const liveMode = Boolean(task && isLiveTaskId(task.id));
  const applyInlineDraft = (value: string | undefined) => {
    if (!task || !value) {
      return;
    }

    setTaskDraft(task.id, value);
  };

  const sendMessageMutation = useMutation({
    mutationFn: async (text: string) => {
      if (!task) {
        throw new Error("Task not found.");
      }

      return mobileRunsApi.sendRunMessage(task.id, {
        text,
        attachments: [],
      });
    },
    onSuccess: async () => {
      if (task) {
        clearTaskDraft(task.id);
      }
      if (!task) {
        return;
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["mobile", "runs"] }),
        queryClient.invalidateQueries({ queryKey: ["mobile", "runs", task.id] }),
      ]);
    },
  });

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
    <View className="page-shell">
      <View className="crumb-row">
        <Button className="crumb-btn" onClick={() => Taro.navigateBack()}>
          返回任务列表
        </Button>
        <Button className="tab-btn active">对话</Button>
        <Button className="tab-btn" onClick={() => Taro.navigateTo({ url: `/pages/tasks/files?id=${task.id}` })}>
          查看文件
        </Button>
      </View>

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
            <View className="composer-row">
              <View className="task-row">
                <Button className="pill">附件</Button>
                <Button className="pill">审批</Button>
              </View>
              <Button
                className="send-btn"
                onClick={() => {
                  if (!draft.trim()) {
                    return;
                  }

                  if (liveMode && runStream.sendMessage(draft.trim())) {
                    clearTaskDraft(task.id);
                    return;
                  }

                  sendMessageMutation.mutate(draft.trim());
                }}
              >
                {sendMessageMutation.isPending
                  ? "发送中"
                  : runStream.connected
                    ? "实时发送"
                    : "发送"}
              </Button>
            </View>
          </>
        ) : (
          <>
            <View className="composer-box">可继续提出修改、查看文件，或基于当前结果再发起一个衍生任务。</View>
            <View className="composer-row">
              <View className="task-row">
                <Button className="pill">附件</Button>
                <Button className="pill">审批</Button>
              </View>
              <Button className="send-btn">发送</Button>
            </View>
          </>
        )}
      </View>
    </View>
  );
}
