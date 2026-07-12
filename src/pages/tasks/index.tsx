import { useQuery } from "@tanstack/react-query";
import { Button, Input, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useMemo, useState } from "react";
import { mobileRunsApi } from "../../lib/api";
import { mapRunSnapshotToMobileTask } from "../../lib/liveTaskAdapters";
import { useMobileWorkspaceCatalog } from "../../lib/useMobileWorkspaceCatalog";
import { useResolvedMobileWorkspace } from "../../lib/useMobileWorkspace";

export default function TasksPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "running" | "approval" | "done">("all");
  const [tagFilter, setTagFilter] = useState("all");
  const currentWorkspace = useResolvedMobileWorkspace();
  const { availableTaskTags, combinedTasks, taskDataMode } = useMobileWorkspaceCatalog(currentWorkspace);

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
            statusFilter === "all"
              ? undefined
              : statusFilter === "running"
                ? "running"
                : statusFilter === "approval"
                  ? "todo"
                  : "done",
          tag: tagFilter === "all" ? undefined : tagFilter,
        });
      } catch {
        return [];
      }
    },
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

  const statusOptions = [
    { key: "all" as const, label: "All" },
    { key: "running" as const, label: "Running" },
    { key: "approval" as const, label: "Needs approval" },
    { key: "done" as const, label: "Done" },
  ];

  const listSummary =
    taskDataMode === "live"
      ? `${filteredTasks.length} live run${filteredTasks.length === 1 ? "" : "s"} in ${currentWorkspace.name}`
      : `No continuing runs in ${currentWorkspace.name}`;

  return (
    <View className="page-shell">
      <View className="page" data-page="tasks" data-testid="mobile-tasks-page">
        <View className="search-bar">
          <Input
            className="search-input"
            value={searchQuery}
            placeholder="Search task, workshop, or tag"
            onInput={(event) => setSearchQuery(event.detail.value)}
          />
        </View>

        <View className="filter-block">
          {taskDataMode === "empty" ? (
            <View className="file-card">
              <View className="card-row">
                <View>
                  <View className="file-name">No live runs yet</View>
                  <View className="file-meta">
                    This workspace is already using authoritative data. Start a new instance from Workshop to open a real conversation.
                  </View>
                </View>
                <View className="pill">0 run</View>
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
              All tags
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
                {taskDataMode === "empty" ? "No runs in this workspace" : "No matching tasks"}
              </View>
              <View className="empty-copy">
                {taskDataMode === "empty"
                  ? "Go back to Workshop and start a new agent instance to begin a full conversation."
                  : "Clear the search or switch the status and tag filters."}
              </View>
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
                <View className="pill success">live</View>
              </View>
              <View className="card-row">
                <View className="muted">Open the full task conversation</View>
                <Button
                  className="pill active"
                  data-testid={`mobile-task-open-${item.id}`}
                  onClick={() => Taro.navigateTo({ url: `/pages/tasks/detail?id=${item.id}` })}
                >
                  Open
                </Button>
              </View>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}
