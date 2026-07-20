import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Input, Textarea, View } from "@tarojs/components";
import Taro, { getCurrentInstance } from "@tarojs/taro";
import { useEffect, useMemo, useState } from "react";
import { useMobilePageShellClass } from "../../components/MobilePageShell";
import {
  mobileCreatorApi,
  mobileSessionDraftsApi,
  mobileSessionProjectsApi,
} from "../../lib/api";
import {
  canCreateMobileSourceRun,
  creatorProjectStatusLabel,
  creatorProjectStatusTone,
  mobileCreatorQueryKeys,
} from "../../lib/mobileCreator";
import { resolveMobileCreatorProjectAction } from "../../lib/mobileCreatorFlow";
import { useResolvedMobileWorkspace } from "../../lib/useMobileWorkspace";
import { hasAuthoritativeMobileWorkspaceContext } from "../../lib/workspaceContext";

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}

export default function CreatorProjectPage() {
  const pageShellClass = useMobilePageShellClass("creator-page-shell");
  const queryClient = useQueryClient();
  const projectId = getCurrentInstance().router?.params?.id ?? "";
  const currentWorkspace = useResolvedMobileWorkspace();
  const workspaceReady = hasAuthoritativeMobileWorkspaceContext(currentWorkspace);
  const creatorAllowed =
    currentWorkspace.source === "auth" && canCreateMobileSourceRun(currentWorkspace.role);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const projectQuery = useQuery({
    queryKey: mobileCreatorQueryKeys.project(currentWorkspace.runtimeWorkspaceId, projectId),
    queryFn: () => mobileSessionProjectsApi.get(projectId),
    enabled: Boolean(projectId && workspaceReady && creatorAllowed),
    retry: false,
    refetchInterval: 10_000,
  });
  const project = projectQuery.data ?? null;

  useEffect(() => {
    if (!project) return;
    setName(project.name);
    setDescription(project.description);
  }, [project?.description, project?.name]);

  const draftQuery = useQuery({
    queryKey: mobileCreatorQueryKeys.draft(
      currentWorkspace.runtimeWorkspaceId,
      project?.currentDraftId ?? "missing"
    ),
    queryFn: () => mobileSessionDraftsApi.get(project!.currentDraftId!),
    enabled: Boolean(project?.currentDraftId),
    retry: false,
  });
  const packageQuery = useQuery({
    queryKey: ["mobile", "creator", "package", project?.packageId ?? "missing"],
    queryFn: () => mobileCreatorApi.getPackage(project!.packageId!),
    enabled: Boolean(project?.packageId),
    retry: false,
  });
  const releasesQuery = useQuery({
    queryKey: ["mobile", "creator", "releases", project?.packageId ?? "missing"],
    queryFn: () => mobileCreatorApi.listPackageReleases(project!.packageId!),
    enabled: Boolean(project?.packageId),
    retry: false,
  });

  const latestRevision = useMemo(
    () => [...(draftQuery.data?.revisions ?? [])].sort((a, b) => b.revisionNumber - a.revisionNumber)[0] ?? null,
    [draftQuery.data?.revisions]
  );
  const latestReplay = useMemo(
    () => [...(draftQuery.data?.replays ?? [])].sort((a, b) => b.finishedAt.localeCompare(a.finishedAt))[0] ?? null,
    [draftQuery.data?.replays]
  );
  const latestRelease = useMemo(
    () => [...(releasesQuery.data ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null,
    [releasesQuery.data]
  );

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!project) throw new Error("项目尚未加载");
      return mobileSessionProjectsApi.update(project.sessionProjectId, {
        expectedVersion: project.version,
        name: name.trim(),
        description: description.trim(),
      });
    },
    onSuccess: async () => {
      setEditing(false);
      await queryClient.invalidateQueries({ queryKey: ["mobile", "creator", "projects"] });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async () => {
      if (!project) throw new Error("项目尚未加载");
      const result = await Taro.showModal({
        title: "归档创作项目",
        content: "归档后项目保留只读链路，不再继续编辑。",
        confirmText: "归档",
      });
      if (!result.confirm) return null;
      return mobileSessionProjectsApi.archive(project.sessionProjectId);
    },
    onSuccess: async (result) => {
      if (!result) return;
      await queryClient.invalidateQueries({ queryKey: ["mobile", "creator", "projects"] });
    },
  });

  if (!workspaceReady || !creatorAllowed) {
    return <View className={pageShellClass}><View className="empty-state creator-empty"><View className="section-title">当前项目不可访问</View><Button className="send-btn" onClick={() => Taro.navigateBack()}>返回</Button></View></View>;
  }
  if (!projectId) {
    return <View className={pageShellClass}><View className="inline-error-banner">缺少 Session Project ID。</View></View>;
  }
  if (projectQuery.isLoading) {
    return <View className={pageShellClass}><View className="empty-state creator-empty"><View className="section-title">正在加载项目</View></View></View>;
  }
  if (!project || projectQuery.error) {
    return <View className={pageShellClass}><View className="empty-state creator-empty"><View className="section-title">项目加载失败</View><View className="empty-copy">{projectQuery.error instanceof Error ? projectQuery.error.message : "项目不存在或无权访问"}</View><Button className="send-btn" onClick={() => projectQuery.refetch()}>重试</Button></View></View>;
  }

  const action = resolveMobileCreatorProjectAction(project);
  const openNext = () => {
    if (action.route === "run" && project.sourceRunId) {
      Taro.navigateTo({ url: `/pages/tasks/detail?id=${encodeURIComponent(project.sourceRunId)}` });
    } else if (action.route === "draft" && project.currentDraftId) {
      Taro.navigateTo({ url: `/pages/creator/draft?id=${encodeURIComponent(project.currentDraftId)}&projectId=${encodeURIComponent(project.sessionProjectId)}` });
    } else if (action.route === "publish") {
      Taro.navigateTo({ url: `/pages/creator/publish?id=${encodeURIComponent(project.sessionProjectId)}` });
    }
  };

  const stages = [
    ["来源实例", Boolean(project.sourceRunId)],
    ["Capture", Boolean(project.currentCaptureId)],
    ["Draft", Boolean(project.currentDraftId)],
    ["恢复验证", latestReplay?.status === "passed"],
    ["Session Version", Boolean(project.currentSessionVersionId)],
    ["Package", Boolean(project.packageId)],
    ["发布", project.status === "PUBLISHED"],
  ] as const;

  return (
    <View className={pageShellClass}>
      <View className="creator-page" data-testid="mobile-creator-project-page">
        <View className="creator-heading">
          <View>
            <View className="page-eyebrow">Session Project</View>
            <View className="creator-title">{project.name}</View>
            <View className="section-copy">{project.description || "尚未填写项目说明"}</View>
          </View>
          <View className={`pill ${creatorProjectStatusTone(project.status)}`}>{creatorProjectStatusLabel(project.status)}</View>
        </View>

        <View className="creator-stage-list">
          {stages.map(([label, done], index) => (
            <View className={`creator-stage-row ${done ? "done" : ""}`} key={label}>
              <View className="creator-stage-index">{String(index + 1).padStart(2, "0")}</View>
              <View className="creator-stage-label">{label}</View>
              <View className={`pill ${done ? "success" : ""}`}>{done ? "完成" : "待处理"}</View>
            </View>
          ))}
        </View>

        <View className="creator-form-section">
          <View className="creator-section-head">
            <View className="creator-section-title">项目信息</View>
            {project.status !== "ARCHIVED" ? <Button className="pill" onClick={() => setEditing((value) => !value)}>{editing ? "取消" : "编辑"}</Button> : null}
          </View>
          {editing ? <>
            <View className="creator-field"><View className="creator-field-label">名称</View><Input className="creator-input" value={name} maxlength={160} onInput={(event) => setName(event.detail.value)} /></View>
            <View className="creator-field"><View className="creator-field-label">说明</View><Textarea className="creator-textarea" value={description} maxlength={4000} onInput={(event) => setDescription(event.detail.value)} /></View>
            <Button className="creator-primary-btn creator-full-btn" disabled={!name.trim() || updateMutation.isPending} onClick={() => updateMutation.mutate()}>{updateMutation.isPending ? "保存中" : "保存"}</Button>
          </> : <View className="creator-record-grid">
            <View><View className="summary-label">Project ID</View><View className="summary-value mono">{project.sessionProjectId}</View></View>
            <View><View className="summary-label">更新时间</View><View className="summary-value">{formatTime(project.updatedAt)}</View></View>
            <View><View className="summary-label">Source Run</View><View className="summary-value mono">{project.sourceRunId ?? "--"}</View></View>
            <View><View className="summary-label">当前 Revision</View><View className="summary-value mono">{latestRevision?.revisionId ?? "--"}</View></View>
          </View>}
          {updateMutation.error ? <View className="inline-error-banner">{updateMutation.error.message}</View> : null}
        </View>

        {project.currentDraftId ? <View className="creator-form-section">
          <View className="creator-section-head"><View className="creator-section-title">固化状态</View><View className={`pill ${latestReplay?.status === "passed" ? "success" : "active"}`}>{draftQuery.data?.draft.status ?? "加载中"}</View></View>
          <View className="creator-record-grid">
            <View><View className="summary-label">Draft</View><View className="summary-value mono">{project.currentDraftId}</View></View>
            <View><View className="summary-label">Replay</View><View className="summary-value">{latestReplay?.status ?? "尚未执行"}</View></View>
            <View><View className="summary-label">Session Version</View><View className="summary-value mono">{project.currentSessionVersionId ?? "--"}</View></View>
          </View>
        </View> : null}

        {project.packageId ? <View className="creator-form-section">
          <View className="creator-section-head"><View className="creator-section-title">发布资产</View><View className={`pill ${packageQuery.data?.tone ?? ""}`}>{packageQuery.data?.statusLabel.zh ?? "加载中"}</View></View>
          <View className="creator-record-grid">
            <View><View className="summary-label">Package</View><View className="summary-value mono">{project.packageId}</View></View>
            <View><View className="summary-label">Release</View><View className="summary-value mono">{latestRelease?.releaseId ?? "--"}</View></View>
            <View><View className="summary-label">Channel</View><View className="summary-value">{latestRelease?.channelLabel.zh ?? "尚未创建"}</View></View>
          </View>
        </View> : null}

        {(draftQuery.error || packageQuery.error || releasesQuery.error || archiveMutation.error) ? <View className="inline-error-banner">项目关联资产加载或操作失败，请刷新后重试。</View> : null}

        <View className="creator-footer-actions">
          <Button className="creator-secondary-btn" onClick={() => archiveMutation.mutate()} disabled={project.status === "ARCHIVED" || archiveMutation.isPending}>归档</Button>
          <Button className="creator-primary-btn" onClick={openNext} disabled={action.route === "none" || project.status === "ARCHIVED"}>{action.label}</Button>
        </View>
      </View>
    </View>
  );
}
