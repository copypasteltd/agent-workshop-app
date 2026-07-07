import { matchesSearchQuery } from "@lingban/domain-models";
import { useQuery } from "@tanstack/react-query";
import { Button, Input, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useMemo, useState } from "react";
import {
  getVisibleTasks,
  getWorkspaceEntry,
  normalizeMobileWorkspaceId,
} from "../../data/workspaceCatalog";
import { mobileRunsApi } from "../../lib/api";
import { mapRunSnapshotToMobileTask } from "../../lib/liveTaskAdapters";
import { useMobileUiStore } from "../../stores/mobileUiStore";

export default function TasksPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "running" | "approval" | "done">("all");
  const [tagFilter, setTagFilter] = useState("all");
  const currentWorkspaceId = useMobileUiStore((state) => state.currentWorkspaceId);
  const currentWorkspace = getWorkspaceEntry(currentWorkspaceId);
  const staticTasks = getVisibleTasks(currentWorkspace.id);

  const runsQuery = useQuery({
    queryKey: ["mobile", "runs"],
    queryFn: async () => {
      try {
        return await mobileRunsApi.listRuns();
      } catch {
        return [];
      }
    },
    refetchInterval: 10_000,
  });

  const liveTasks = (runsQuery.data ?? [])
    .map((snapshot) => mapRunSnapshotToMobileTask(snapshot))
    .filter((item) => normalizeMobileWorkspaceId(item.workspaceId) === currentWorkspace.id);

  const staticIds = new Set(staticTasks.map((item) => item.id));
  const combinedTasks = [...liveTasks.filter((item) => !staticIds.has(item.id)), ...staticTasks];
  const availableTags = useMemo(() => {
    const tags = Array.from(
      new Set(
        combinedTasks
          .flatMap((item) => item.tags)
          .filter((tag) => tag.startsWith("#"))
      )
    );

    return tags.slice(0, 4);
  }, [combinedTasks]);

  const filteredTasks = useMemo(() => {
    return combinedTasks.filter((item) => {
      const statusMatched = statusFilter === "all" || item.status === statusFilter;
      const tagMatched = tagFilter === "all" || item.tags.includes(tagFilter);

      if (!statusMatched || !tagMatched) {
        return false;
      }

      return matchesSearchQuery(searchQuery, [
        item.id,
        item.title,
        item.workshop,
        item.summary,
        item.statusLabel,
        item.updatedAt,
        item.targetPath,
        ...item.tags,
      ]);
    });
  }, [combinedTasks, searchQuery, statusFilter, tagFilter]);

  return (
    <View className="page-shell">
      <View className="page" data-page="tasks">
        <View className="search-bar">
          <Input
            className="search-input"
            value={searchQuery}
            placeholder="搜索任务名 / 工坊 / 标签"
            onInput={(event) => setSearchQuery(event.detail.value)}
          />
        </View>

        <View className="filter-block">
          <View className="pill-row">
            {[
              { key: "all" as const, label: "全部" },
              { key: "running" as const, label: "运行中" },
              { key: "approval" as const, label: "待确认" },
              { key: "done" as const, label: "已完成" },
            ].map((item) => (
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
            {availableTags.map((tag) => (
              <Button
                className={`task-chip ${tagFilter === tag ? "active" : ""}`}
                key={tag}
                onClick={() => setTagFilter(tag)}
              >
                {tag}
              </Button>
            ))}
          </View>
          <View className="muted">当前命中 {filteredTasks.length} 个任务，点入后进入完整对话工作面。</View>
        </View>

        <View className="task-list">
          {filteredTasks.length === 0 ? (
            <View className="empty-state">
              <View className="section-title">没有匹配任务</View>
              <View className="empty-copy">可以清空搜索词，或切换状态和标签筛选。</View>
            </View>
          ) : null}
          {filteredTasks.map((item) => (
            <View className={`task-card ${item.id === filteredTasks[0]?.id ? "active" : ""}`} key={item.id}>
              <View className="card-row">
                <View>
                  <View className="task-title">{item.title}</View>
                  <View className="task-meta">
                    工坊：{item.workshop} / {item.updatedAt}
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
                {item.id.startsWith("run_") ? <View className="pill success">live</View> : null}
              </View>
              <View className="card-row">
                <View className="muted">进入当前实例的完整对话</View>
                <Button className="pill active" onClick={() => Taro.navigateTo({ url: `/pages/tasks/detail?id=${item.id}` })}>
                  打开
                </Button>
              </View>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}
