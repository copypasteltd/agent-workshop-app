import type { SessionProjectStatus } from "@lingban/contracts";
import { useMobileQuery as useQuery } from "../../lib/useMobileQuery";
import { Button, Input, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useMemo, useState } from "react";
import { useMobilePageShellClass } from "../../components/MobilePageShell";
import { mobileSessionProjectsApi } from "../../lib/api";
import {
  canCreateMobileSourceRun,
  creatorProjectStatusLabel,
  creatorProjectStatusTone,
  mobileCreatorQueryKeys,
} from "../../lib/mobileCreator";
import { useResolvedMobileWorkspace } from "../../lib/useMobileWorkspace";
import { hasAuthoritativeMobileWorkspaceContext } from "../../lib/workspaceContext";

type ProjectFilter = "active" | "published" | "archived" | "all";

const activeStatuses = new Set<SessionProjectStatus>([
  "DRAFT",
  "RECORDING",
  "CAPTURED",
  "EDITING",
  "REPLAYING",
  "READY_TO_SEAL",
  "SEALED",
  "PACKAGED",
]);

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default function CreatorProjectsPage() {
  const pageShellClass = useMobilePageShellClass("creator-page-shell");
  const currentWorkspace = useResolvedMobileWorkspace();
  const workspaceReady = hasAuthoritativeMobileWorkspaceContext(currentWorkspace);
  const creatorAllowed =
    currentWorkspace.source === "auth" && canCreateMobileSourceRun(currentWorkspace.role);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ProjectFilter>("active");

  const projectsQuery = useQuery({
    queryKey: mobileCreatorQueryKeys.projects(currentWorkspace.runtimeWorkspaceId),
    queryFn: () => mobileSessionProjectsApi.list({ limit: 100 }),
    enabled: workspaceReady && creatorAllowed,
    retry: false,
    refetchInterval: 15_000,
  });

  const projects = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return [...(projectsQuery.data?.items ?? [])]
      .filter((project) => {
        if (filter === "active" && !activeStatuses.has(project.status)) return false;
        if (filter === "published" && project.status !== "PUBLISHED") return false;
        if (filter === "archived" && project.status !== "ARCHIVED") return false;
        if (!normalizedQuery) return true;
        return [project.name, project.description, project.sessionProjectId, project.sourceRunId]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(normalizedQuery));
      })
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }, [filter, projectsQuery.data?.items, query]);

  if (!workspaceReady || !creatorAllowed) {
    return (
      <View className={pageShellClass}>
        <View className="creator-page">
          <View className="empty-state creator-empty">
            <View className="section-title">
              {!workspaceReady ? "正在恢复工作区" : "当前账户没有创作权限"}
            </View>
            <View className="empty-copy">
              {!workspaceReady
                ? "工作区恢复后将加载当前账户的创作项目。"
                : "需要个人工作区所有者，或企业工作区 owner、admin、creator 权限。"}
            </View>
            <Button className="send-btn" onClick={() => Taro.navigateBack()}>返回</Button>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View className={pageShellClass}>
      <View className="creator-page" data-testid="mobile-creator-projects-page">
        <View className="creator-heading">
          <View>
            <View className="page-eyebrow">Session Workshop</View>
            <View className="creator-title">我的创作</View>
            <View className="section-copy">管理工作流来源实例、固化版本与发布进度。</View>
          </View>
          <Button className="pill active" onClick={() => Taro.navigateTo({ url: "/pages/tasks/new" })}>
            新建
          </Button>
        </View>

        <View className="creator-context-band">
          <View className="creator-context-item"><View className="summary-label">工作区</View><View className="summary-value">{currentWorkspace.name}</View></View>
          <View className="creator-context-item"><View className="summary-label">项目总数</View><View className="summary-value">{projectsQuery.data?.total ?? 0}</View></View>
        </View>

        <View className="search-bar">
          <Input
            className="search-input"
            value={query}
            placeholder="搜索项目名称或实例 ID"
            onInput={(event) => setQuery(event.detail.value)}
          />
        </View>
        <View className="creator-choice-list">
          {([
            ["active", "进行中"],
            ["published", "已发布"],
            ["archived", "已归档"],
            ["all", "全部"],
          ] as const).map(([key, label]) => (
            <Button
              className={`creator-choice ${filter === key ? "active" : ""}`}
              key={key}
              onClick={() => setFilter(key)}
            >{label}</Button>
          ))}
        </View>

        {projectsQuery.isLoading ? (
          <View className="empty-state"><View className="section-title">正在加载创作项目</View></View>
        ) : null}
        {projectsQuery.error ? (
          <View className="inline-error-banner">
            {projectsQuery.error instanceof Error ? projectsQuery.error.message : "项目加载失败"}
          </View>
        ) : null}
        {!projectsQuery.isLoading && !projectsQuery.error && projects.length === 0 ? (
          <View className="empty-state">
            <View className="section-title">当前筛选下没有项目</View>
            <View className="empty-copy">新建空白 Codex，完成工作流后可在移动端直接固化和发布。</View>
            <Button className="send-btn" onClick={() => Taro.navigateTo({ url: "/pages/tasks/new" })}>
              创建第一个项目
            </Button>
          </View>
        ) : null}

        <View className="creator-project-list">
          {projects.map((project) => (
            <View
              className="creator-project-card"
              key={project.sessionProjectId}
              onClick={() => Taro.navigateTo({
                url: `/pages/creator/project?id=${encodeURIComponent(project.sessionProjectId)}`,
              })}
            >
              <View className="card-row">
                <View>
                  <View className="task-title">{project.name}</View>
                  <View className="task-meta">{formatTime(project.updatedAt)}</View>
                </View>
                <View className={`pill ${creatorProjectStatusTone(project.status)}`}>
                  {creatorProjectStatusLabel(project.status)}
                </View>
              </View>
              <View className="section-copy">{project.description || "尚未填写项目说明"}</View>
              <View className="creator-project-progress">
                <View className={`creator-progress-step ${project.sourceRunId ? "done" : ""}`}>实例</View>
                <View className={`creator-progress-step ${project.currentDraftId ? "done" : ""}`}>草稿</View>
                <View className={`creator-progress-step ${project.currentSessionVersionId ? "done" : ""}`}>版本</View>
                <View className={`creator-progress-step ${project.packageId ? "done" : ""}`}>封装</View>
                <View className={`creator-progress-step ${project.status === "PUBLISHED" ? "done" : ""}`}>发布</View>
              </View>
              <View className="mono creator-project-id">{project.sessionProjectId}</View>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}
