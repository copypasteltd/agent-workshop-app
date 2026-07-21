import { useMobileQuery as useQuery } from "../../lib/useMobileQuery";
import { Button, Input, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { mobileRunsApi } from "../../lib/api";
import { mapRunSnapshotToMobileTask } from "../../lib/liveTaskAdapters";
import { useMobileWorkspaceCatalog } from "../../lib/useMobileWorkspaceCatalog";
import { useResolvedMobileWorkspace } from "../../lib/useMobileWorkspace";
import { useMobilePageShellClass } from "../../components/MobilePageShell";

export default function TasksPage() {
  const pageShellClass = useMobilePageShellClass();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "running" | "approval" | "done" | "failed" | "cancelled" | "archived">("all");
  const [tagFilter, setTagFilter] = useState("all");
  const currentWorkspace = useResolvedMobileWorkspace();
  const queryClient = useQueryClient();
  const { availableTaskTags, combinedTasks, taskDataMode, workspaceDataReady } =
    useMobileWorkspaceCatalog(currentWorkspace);

  const filteredRunsQuery = useQuery({
    queryKey: [
      "mobile",
      "runs",
      "filtered",
      currentWorkspace.selectionId,
      currentWorkspace.id,
      statusFilter,
      tagFilter,
      searchQuery,
    ],
    queryFn: async () => {
      try {
        return await mobileRunsApi.listRuns({
          q: searchQuery.trim() || undefined,
          attentionMode:
            statusFilter === "all" || statusFilter === "failed" || statusFilter === "cancelled" || statusFilter === "archived"
              ? undefined
              : statusFilter === "running"
                ? "running"
                : statusFilter === "approval"
                  ? "todo"
                  : "done",
          viewStatus:
            statusFilter === "failed"
              ? "failed"
              : statusFilter === "cancelled"
                ? "cancelled"
                : undefined,
          recordStatus: statusFilter === "archived" ? "ARCHIVED" : undefined,
          tag: tagFilter === "all" ? undefined : tagFilter,
        });
      } catch {
        return [];
      }
    },
    enabled: workspaceDataReady,
    refetchInterval: 10_000,
    retry: false,
  });

  const filteredLiveTasks = useMemo(
    () =>
      [...(filteredRunsQuery.data ?? [])]
        .sort((left, right) => right.run.updatedAt.localeCompare(left.run.updatedAt))
        .map((snapshot) => mapRunSnapshotToMobileTask(snapshot, undefined, currentWorkspace))
        .filter((item) => item.workspaceId === currentWorkspace.id),
    [currentWorkspace, filteredRunsQuery.data]
  );

  const filteredTasks = useMemo(() => {
    if (taskDataMode === "live") {
      if (!filteredRunsQuery.isSuccess && filteredRunsQuery.fetchStatus !== "idle") {
        return combinedTasks;
      }

      return filteredLiveTasks;
    }

    return [];
  }, [
    combinedTasks,
    filteredLiveTasks,
    filteredRunsQuery.fetchStatus,
    filteredRunsQuery.isSuccess,
    taskDataMode,
  ]);
  const runSnapshotsById = useMemo(
    () => new Map((filteredRunsQuery.data ?? []).map((snapshot) => [snapshot.run.runId, snapshot])),
    [filteredRunsQuery.data]
  );
  const lifecycleMutation = useMutation({
    mutationFn: async (input: { runId: string; action: "stop" | "archive" | "restore" | "delete" }) => {
      switch (input.action) {
        case "stop":
          return await mobileRunsApi.stopRun(input.runId, "用户从移动端任务列表结束实例");
        case "archive":
          return await mobileRunsApi.archiveRun(input.runId, "用户从移动端任务列表归档实例");
        case "restore":
          return await mobileRunsApi.restoreRun(input.runId);
        case "delete":
          return await mobileRunsApi.deleteRun(input.runId, "用户确认从移动端永久删除实例");
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["mobile", "runs"] });
      Taro.showToast({ title: "实例状态已更新", icon: "success" });
    },
    onError: (error) => Taro.showToast({ title: error instanceof Error ? error.message : "实例操作失败", icon: "none" }),
  });
  const confirmListAction = async (runId: string, action: "stop" | "delete") => {
    let result;
    try {
      result = await Taro.showModal({
        title: action === "stop" ? "立即停止实例" : "永久删除实例",
        content: action === "stop"
          ? "当前执行将被中断，运行环境完成释放后仍可查看消息和结果。"
          : `实例 ${runId} 的消息、文件与运行记录将被清理，该操作无法撤销。`,
        confirmText: action === "stop" ? "确认停止" : "永久删除",
        confirmColor: "#d84b4b",
      });
    } catch (error) {
      await Taro.showToast({
        title: error instanceof Error ? error.message : "操作确认弹窗打开失败",
        icon: "none",
      });
      return;
    }
    if (result.confirm) lifecycleMutation.mutate({ runId, action });
  };
  const openTaskLifecycleMenu = async (runId: string) => {
    const snapshot = runSnapshotsById.get(runId);
    if (!snapshot) return;
    const items: Array<{ label: string; execute: () => void | Promise<void> }> = [
      { label: "打开实例", execute: () => { void Taro.navigateTo({ url: `/pages/tasks/detail?id=${runId}` }); } },
    ];
    if (snapshot.lifecycle.recordStatus === "ARCHIVED") {
      items.push({ label: "恢复到任务列表", execute: () => lifecycleMutation.mutate({ runId, action: "restore" }) });
      items.push({ label: "永久删除", execute: () => confirmListAction(runId, "delete") });
    } else if (["SUCCEEDED", "FAILED", "CANCELLED"].includes(snapshot.run.status) && snapshot.lifecycle.runtimeStatus === "RELEASED") {
      items.push({ label: "归档实例", execute: () => lifecycleMutation.mutate({ runId, action: "archive" }) });
      items.push({ label: "永久删除", execute: () => confirmListAction(runId, "delete") });
    } else {
      items.push({ label: "立即停止并释放", execute: () => confirmListAction(runId, "stop") });
    }
    let result;
    try {
      result = await Taro.showActionSheet({ itemList: items.map((item) => item.label) });
    } catch {
      // The user dismissed the action sheet.
      return;
    }
    await items[result.tapIndex]?.execute();
  };

  const statusOptions = [
    { key: "all" as const, label: "全部" },
    { key: "running" as const, label: "运行中" },
    { key: "approval" as const, label: "待审批" },
    { key: "done" as const, label: "已完成" },
    { key: "failed" as const, label: "失败" },
    { key: "cancelled" as const, label: "已取消" },
    { key: "archived" as const, label: "已归档" },
  ];

  const listSummary =
    taskDataMode === "waiting"
      ? `正在恢复 ${currentWorkspace.name} 的工作区上下文，完成后加载实时实例`
      : taskDataMode === "live"
      ? `${currentWorkspace.name} 当前显示 ${filteredTasks.length} 个实时实例`
      : `${currentWorkspace.name} 当前没有持续运行的实例`;

  return (
    <View className={pageShellClass}>
      <View className="page" data-page="tasks" data-testid="mobile-tasks-page">
        <View className="section-head mobile-page-command-head">
          <View>
            <View className="page-eyebrow">实例中心</View>
            <View className="section-title">任务与对话</View>
            <View className="section-copy">管理运行实例，或从空白 Codex 开始创作工作流。</View>
          </View>
          <Button
            className="pill active"
            data-testid="mobile-new-instance-entry"
            onClick={() => Taro.navigateTo({ url: "/pages/tasks/new" })}
          >
            新建实例
          </Button>
        </View>
        <View className="search-bar">
          <Input
            className="search-input"
            value={searchQuery}
            placeholder="搜索任务、工坊或标签"
            onInput={(event) => setSearchQuery(event.detail.value)}
          />
        </View>

        <View className="filter-block">
          {taskDataMode !== "live" ? (
            <View className="file-card">
              <View className="card-row">
                <View>
                  <View className="file-name">
                    {workspaceDataReady ? "当前没有实时实例" : "正在恢复工作区上下文"}
                  </View>
                  <View className="file-meta">
                    {workspaceDataReady
                      ? "当前工作区已连接正式数据。请从工坊启动新实例并进入完整对话。"
                      : "任务列表将在后端会话恢复当前工作区上下文后加载。"}
                  </View>
                </View>
                <View className="pill">0 个实例</View>
              </View>
            </View>
          ) : null}

          <View className="pill-row">
            {statusOptions.map((item) => (
              <Button
                className={`task-chip ${statusFilter === item.key ? "active" : ""}`}
                key={item.key}
                onClick={() => setStatusFilter(item.key)}
              >
                {item.label}
              </Button>
            ))}
          </View>

          <View className="pill-row">
            <View className="task-chip active">{currentWorkspace.name}</View>
            <Button
              className={`task-chip ${tagFilter === "all" ? "active" : ""}`}
              onClick={() => setTagFilter("all")}
            >
              全部标签
            </Button>
            {availableTaskTags.map((tag) => (
              <Button
                className={`task-chip ${tagFilter === tag ? "active" : ""}`}
                key={tag}
                onClick={() => setTagFilter(tag)}
              >
                {tag}
              </Button>
            ))}
          </View>

          <View className="muted">{listSummary}</View>
        </View>

        <View className="task-list">
          {filteredTasks.length === 0 ? (
            <View className="empty-state">
              <View className="section-title">
                {taskDataMode === "waiting"
                  ? "正在恢复工作区上下文"
                  : taskDataMode === "empty"
                    ? "当前工作区没有实例"
                    : "没有匹配任务"}
              </View>
              <View className="empty-copy">
                {taskDataMode === "waiting"
                  ? "工作区会话恢复后，任务中心将从正式后端链路加载实时实例。"
                  : taskDataMode === "empty"
                  ? "创建一个空白 Codex，在完整对话中完成工作流后即可固化和发布。"
                  : "请清空搜索条件，或切换状态和标签筛选。"}
              </View>
              {taskDataMode === "empty" ? (
                <Button
                  className="send-btn"
                  onClick={() => Taro.navigateTo({ url: "/pages/tasks/new" })}
                >
                  新建空白实例
                </Button>
              ) : null}
            </View>
          ) : null}

          {filteredTasks.map((item) => (
            <View className={`task-card ${item.id === filteredTasks[0]?.id ? "active" : ""}`} key={item.id}>
              <View className="card-row">
                <View>
                  <View className="task-title">{item.title}</View>
                  <View className="task-meta">
                    {item.workshop} / {item.updatedAt}
                  </View>
                </View>
                <View className={`pill ${item.statusClass}`}>{item.statusLabel}</View>
              </View>
              <View className="muted">{item.summary}</View>
              <View className="pill-row">
                {item.tags.map((tag) => (
                  <View className="pill" key={tag}>
                    {tag}
                  </View>
                ))}
                <View className="pill success">实时</View>
              </View>
              <View className="card-row">
                <View className="muted">进入任务完整对话</View>
                <View className="pill-row">
                  <Button
                    className="pill"
                    disabled={lifecycleMutation.isPending}
                    onClick={() => openTaskLifecycleMenu(item.id)}
                  >
                    管理
                  </Button>
                  <Button
                    className="pill active"
                    data-testid={`mobile-task-open-${item.id}`}
                    onClick={() => Taro.navigateTo({ url: `/pages/tasks/detail?id=${item.id}` })}
                  >
                    打开
                  </Button>
                </View>
              </View>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}
