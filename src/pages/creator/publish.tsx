import type {
  CreatorReleaseGate,
  CreatorReleaseState,
  WorkspaceRole,
} from "@lingban/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Input, Textarea, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useMobileQuery as useQuery } from "../../lib/useMobileQuery";
import { useEffect, useMemo, useState } from "react";
import { useMobilePageShellClass } from "../../components/MobilePageShell";
import { useMobileShareDisabled } from "../../lib/mobileShare";
import {
  mobileCatalogApi,
  mobileCreatorApi,
  mobileRunsApi,
  mobileSessionDraftsApi,
  mobileSessionProjectsApi,
  mobileSessionVersionsApi,
} from "../../lib/api";
import {
  canCreateMobileSourceRun,
  clearCreatorPublishDraft,
  createDefaultCreatorPublishDraft,
  creatorProjectStatusLabel,
  mobileCreatorQueryKeys,
  readCreatorPublishDraft,
  writeCreatorPublishDraft,
  type MobileCreatorPublishDraft,
} from "../../lib/mobileCreator";
import {
  areCreatorReleaseGatesPassed,
  resolveMobileCreatorPublishStage,
} from "../../lib/mobileCreatorFlow";
import { useResolvedMobileWorkspace } from "../../lib/useMobileWorkspace";
import { useMobileRouteParams } from "../../lib/useMobileRouteParams";
import { hasAuthoritativeMobileWorkspaceContext } from "../../lib/workspaceContext";

function roleRank(role: WorkspaceRole | null) {
  switch (role) {
    case "owner": return 5;
    case "admin": return 4;
    case "creator": return 3;
    case "operator": return 2;
    case "viewer": return 1;
    default: return 0;
  }
}

function gateLabel(gate: CreatorReleaseGate) {
  switch (gate.gateType) {
    case "desensitization": return "脱敏校验";
    case "replay": return "恢复回放";
    case "credential": return "凭证与依赖";
    case "manual_approval": return "发布签核";
  }
}

function gateRoleLabel(role: WorkspaceRole) {
  switch (role) {
    case "owner": return "所有者";
    case "admin": return "管理员";
    case "creator": return "创作者";
    case "operator": return "操作员";
    case "viewer": return "查看者";
  }
}

function gateTone(status: CreatorReleaseGate["status"]) {
  if (status === "passed" || status === "waived") return "success";
  if (status === "failed") return "warn";
  return "active";
}

export default function CreatorPublishPage() {
  useMobileShareDisabled();
  const params = useMobileRouteParams<{ id?: string }>();
  const pageShellClass = useMobilePageShellClass("creator-page-shell");
  if (!params) {
    return <View className={pageShellClass}><View className="section-copy">正在加载发布工作台</View></View>;
  }
  return <CreatorPublishContent projectId={params.id ?? ""} />;
}

function CreatorPublishContent({ projectId }: { projectId: string }) {
  const pageShellClass = useMobilePageShellClass("creator-page-shell");
  const queryClient = useQueryClient();
  const currentWorkspace = useResolvedMobileWorkspace();
  const workspaceReady = hasAuthoritativeMobileWorkspaceContext(currentWorkspace);
  const creatorAllowed =
    currentWorkspace.source === "auth" && canCreateMobileSourceRun(currentWorkspace.role);
  const [form, setForm] = useState<MobileCreatorPublishDraft | null>(null);
  const [releaseNote, setReleaseNote] = useState("已确认发布范围与回滚责任");

  const projectQuery = useQuery({
    queryKey: mobileCreatorQueryKeys.project(currentWorkspace.runtimeWorkspaceId, projectId),
    queryFn: () => mobileSessionProjectsApi.get(projectId),
    enabled: Boolean(projectId && workspaceReady && creatorAllowed),
    retry: false,
    refetchInterval: 10_000,
  });
  const project = projectQuery.data ?? null;
  const sourceRunQuery = useQuery({
    queryKey: ["mobile", "creator", "source-run", project?.sourceRunId ?? "missing"],
    queryFn: () => mobileRunsApi.getRun(project!.sourceRunId!),
    enabled: Boolean(project?.sourceRunId),
    retry: false,
  });
  const draftQuery = useQuery({
    queryKey: mobileCreatorQueryKeys.draft(currentWorkspace.runtimeWorkspaceId, project?.currentDraftId ?? "missing"),
    queryFn: () => mobileSessionDraftsApi.get(project!.currentDraftId!),
    enabled: Boolean(project?.currentDraftId),
    retry: false,
  });

  useEffect(() => {
    if (!project || form?.sessionProjectId === project.sessionProjectId) return;
    setForm(
      readCreatorPublishDraft(project.sessionProjectId) ??
      createDefaultCreatorPublishDraft({
        sessionProjectId: project.sessionProjectId,
        name: project.name,
        description: project.description,
        targetPath: sourceRunQuery.data?.run.targetPath ?? currentWorkspace.root,
        personal: currentWorkspace.authType === "personal",
      })
    );
  }, [currentWorkspace.authType, currentWorkspace.root, form?.sessionProjectId, project, sourceRunQuery.data?.run.targetPath]);

  useEffect(() => {
    if (form) writeCreatorPublishDraft(form);
  }, [form]);

  const packageId = project?.packageId ?? form?.packageId ?? "";
  const packageQuery = useQuery({
    queryKey: ["mobile", "creator", "package", packageId || "missing"],
    queryFn: () => mobileCreatorApi.getPackage(packageId),
    enabled: Boolean(project?.packageId),
    retry: false,
  });
  const releasesQuery = useQuery({
    queryKey: ["mobile", "creator", "releases", packageId || "missing"],
    queryFn: () => mobileCreatorApi.listPackageReleases(packageId),
    enabled: Boolean(project?.packageId),
    retry: false,
  });
  const latestRelease = useMemo(
    () => [...(releasesQuery.data ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null,
    [releasesQuery.data]
  );
  const gatesQuery = useQuery({
    queryKey: ["mobile", "creator", "release-gates", latestRelease?.releaseId ?? "missing"],
    queryFn: () => mobileCreatorApi.listReleaseGates(latestRelease!.releaseId),
    enabled: Boolean(latestRelease),
    retry: false,
  });
  const activationsQuery = useQuery({
    queryKey: ["mobile", "creator", "release-activations", latestRelease?.releaseId ?? "missing"],
    queryFn: () => mobileCreatorApi.listReleaseActivations(latestRelease!.releaseId),
    enabled: Boolean(latestRelease),
    retry: false,
  });
  const latestReplay = useMemo(
    () => [...(draftQuery.data?.replays ?? [])].sort((a, b) => b.finishedAt.localeCompare(a.finishedAt))[0] ?? null,
    [draftQuery.data?.replays]
  );
  const activeActivation = activationsQuery.data?.find((item) => item.state === "active") ?? null;

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["mobile", "creator"] }),
      queryClient.invalidateQueries({ queryKey: ["mobile", "catalog"] }),
      queryClient.invalidateQueries({ queryKey: ["mobile", "search"] }),
      queryClient.invalidateQueries({ queryKey: ["mobile", "me"] }),
    ]);
  };

  const packageMutation = useMutation({
    mutationFn: async () => {
      if (!project || !form || !project.currentSessionVersionId) {
        throw new Error("需要已密封的 Session Version");
      }
      const normalizedPackageId = form.packageId.trim().toLowerCase();
      const bundle = await mobileCatalogApi.createWorkshopServiceBundle({
        sessionProjectId: project.sessionProjectId,
        displayName: { zh: form.title.trim(), en: form.title.trim() },
        summary: { zh: form.description.trim(), en: form.description.trim() },
        audience: { zh: form.audience.trim(), en: form.audience.trim() },
        nextStepSummary: {
          zh: "实例化后进入完整对话，由 Agent 主动收集执行所需信息。",
          en: "Launches a full conversation where the Agent collects required execution inputs.",
        },
        scope: form.scope,
        visibility: "workspace",
        coverAssetUrl: "/assets/logo.svg",
        tagList: form.tagsText.split(",").map((item) => item.trim()).filter(Boolean),
        service: {
          displayName: { zh: form.title.trim(), en: form.title.trim() },
          summary: { zh: form.description.trim(), en: form.description.trim() },
          authRequirementText: { zh: form.authorization.trim(), en: form.authorization.trim() },
          estimatedDuration: form.estimatedDuration.trim(),
          targetPathHint: form.targetPath.trim(),
          outputContractSummary: { zh: form.outputContract.trim(), en: form.outputContract.trim() },
          requiredBindings: { firstPartyMcpIds: [], externalConnectorRefs: [], credentialIds: [] },
          linkedInstanceHint: project.sourceRunId,
        },
      }, { idempotencyKey: `mobile:${project.sessionProjectId}:catalog-bundle` });

      let creatorPackage;
      try {
        creatorPackage = await mobileCreatorApi.createPackage({
          packageId: normalizedPackageId,
          title: { zh: form.title.trim(), en: form.title.trim() },
          description: { zh: form.description.trim(), en: form.description.trim() },
          workspaceContextKey: currentWorkspace.contextKey,
          linkedWorkshopIds: [bundle.workshop.workshopId],
          linkedServiceIds: [bundle.service.serviceId],
          currentTaskVersionId: bundle.taskVersion.taskVersionId,
        }, { idempotencyKey: form.packageIdempotencyKey });
      } catch (error) {
        try {
          creatorPackage = await mobileCreatorApi.getPackage(normalizedPackageId);
        } catch {
          throw error;
        }
      }

      const bindings = await mobileSessionVersionsApi.getPackageBindings(creatorPackage.packageId);
      if (bindings.candidate?.sessionVersionId !== project.currentSessionVersionId) {
        await mobileSessionVersionsApi.bindPackage(creatorPackage.packageId, {
          sessionVersionId: project.currentSessionVersionId,
          state: "candidate",
          expectedVersion: bindings.candidate?.version ?? 0,
        });
      }
      return creatorPackage;
    },
    onSuccess: invalidate,
  });

  const releaseMutation = useMutation({
    mutationFn: async () => {
      if (!project?.packageId || !form) throw new Error("Package 尚未创建");
      return mobileCreatorApi.createPackageRelease(project.packageId, {
        targetWorkspaceContextKey: currentWorkspace.contextKey,
        state: form.releaseState,
        channelLabel: {
          zh: form.releaseState === "production" ? "正式发布" : form.releaseState === "staged" ? "灰度发布" : "私有发布",
          en: form.releaseState,
        },
        gateSummary: [{ zh: "移动端发布检查", en: "Mobile release checks" }],
      }, { idempotencyKey: form.releaseIdempotencyKey });
    },
    onSuccess: invalidate,
  });

  const gateMutation = useMutation({
    mutationFn: async (gate: CreatorReleaseGate) => {
      if (!latestRelease || !project) throw new Error("Release 尚未创建");
      const evidenceRef = gate.gateType === "desensitization"
        ? `session-version:${project.currentSessionVersionId}`
        : gate.gateType === "replay"
          ? `session-replay:${latestReplay?.replayId ?? "verified"}`
          : gate.gateType === "credential"
            ? `session-project:${project.sessionProjectId}:bindings`
            : undefined;
      return mobileCreatorApi.decideReleaseGate(latestRelease.releaseId, gate.gateId, {
        status: "passed",
        note: { zh: releaseNote.trim(), en: releaseNote.trim() },
        ...(evidenceRef ? { evidenceRef } : {}),
        checklist: gate.checklist.map((item) => ({
          ...item,
          status: "passed" as const,
          note: { zh: releaseNote.trim(), en: releaseNote.trim() },
        })),
      });
    },
    onSuccess: invalidate,
  });

  const activationMutation = useMutation({
    mutationFn: async () => {
      if (!latestRelease) throw new Error("Release 尚未创建");
      return mobileCreatorApi.activateRelease(latestRelease.releaseId, {
        note: { zh: releaseNote.trim(), en: releaseNote.trim() },
      });
    },
    onSuccess: async () => {
      if (project) clearCreatorPublishDraft(project.sessionProjectId);
      await invalidate();
    },
  });

  const updateForm = <K extends keyof MobileCreatorPublishDraft>(key: K, value: MobileCreatorPublishDraft[K]) => {
    setForm((current) => current ? { ...current, [key]: value } : current);
  };
  const mutationError = packageMutation.error ?? releaseMutation.error ?? gateMutation.error ?? activationMutation.error;

  if (!workspaceReady || !creatorAllowed) {
    return <View className={pageShellClass}><View className="empty-state creator-empty"><View className="section-title">当前项目不可发布</View><Button className="send-btn" onClick={() => Taro.navigateBack()}>返回</Button></View></View>;
  }
  if (!projectId || projectQuery.isLoading || !form) {
    return <View className={pageShellClass}><View className="empty-state creator-empty"><View className="section-title">{projectId ? "正在加载发布链路" : "缺少 Session Project ID"}</View></View></View>;
  }
  if (!project || projectQuery.error) {
    return <View className={pageShellClass}><View className="empty-state creator-empty"><View className="section-title">项目加载失败</View><View className="empty-copy">{projectQuery.error instanceof Error ? projectQuery.error.message : "项目不存在"}</View></View></View>;
  }

  const packageReady = Boolean(project.packageId && packageQuery.data);
  const allGatesPassed = areCreatorReleaseGatesPassed(gatesQuery.data);
  const publishStage = resolveMobileCreatorPublishStage({
    packageReady,
    releaseReady: Boolean(latestRelease),
    gatesPassed: allGatesPassed,
    active: Boolean(activeActivation),
  });
  const packageFormValid = /^[a-z0-9][a-z0-9-]{1,118}[a-z0-9]$/.test(form.packageId.trim().toLowerCase()) && Boolean(form.title.trim() && form.description.trim() && form.targetPath.trim() && form.estimatedDuration.trim());

  return (
    <View className={pageShellClass}>
      <View className="creator-page" data-testid="mobile-creator-publish-page" data-publish-stage={publishStage}>
        <View className="creator-heading">
          <View><View className="page-eyebrow">Workshop Publication</View><View className="creator-title">封装与发布</View><View className="section-copy">将密封 Session Version 转换为可实例化的工坊服务。</View></View>
          <View className={`pill ${activeActivation ? "success" : "active"}`}>{creatorProjectStatusLabel(project.status)}</View>
        </View>

        {!project.currentSessionVersionId ? <View className="inline-error-banner">项目尚未密封 Session Version，请先完成固化。</View> : null}

        <View className="creator-form-section">
          <View className="creator-section-head"><View><View className="creator-section-title">01 工坊与服务</View><View className="creator-note">创建 Workshop、Service、Task Version 与 Package</View></View><View className={`pill ${packageReady ? "success" : ""}`}>{packageReady ? "PACKAGED" : "DRAFT"}</View></View>
          {!packageReady ? <>
            <View className="creator-field"><View className="creator-field-label">Package ID</View><Input className="creator-input mono" value={form.packageId} onInput={(event) => updateForm("packageId", event.detail.value.toLowerCase())} /></View>
            <View className="creator-field"><View className="creator-field-label">名称</View><Input className="creator-input" value={form.title} onInput={(event) => updateForm("title", event.detail.value)} /></View>
            <View className="creator-field"><View className="creator-field-label">说明</View><Textarea className="creator-textarea" value={form.description} onInput={(event) => updateForm("description", event.detail.value)} /></View>
            <View className="creator-field"><View className="creator-field-label">适用对象</View><Input className="creator-input" value={form.audience} onInput={(event) => updateForm("audience", event.detail.value)} /></View>
            <View className="creator-field"><View className="creator-field-label">所需授权</View><Textarea className="creator-textarea" value={form.authorization} onInput={(event) => updateForm("authorization", event.detail.value)} /></View>
            <View className="creator-field"><View className="creator-field-label">输出约定</View><Textarea className="creator-textarea" value={form.outputContract} onInput={(event) => updateForm("outputContract", event.detail.value)} /></View>
            <View className="creator-field"><View className="creator-field-label">Target Path</View><Input className="creator-input mono" value={form.targetPath} onInput={(event) => updateForm("targetPath", event.detail.value)} /></View>
            <View className="creator-field"><View className="creator-field-label">预计时长</View><Input className="creator-input" value={form.estimatedDuration} onInput={(event) => updateForm("estimatedDuration", event.detail.value)} /></View>
            <View className="creator-field"><View className="creator-field-label">标签</View><Input className="creator-input" value={form.tagsText} onInput={(event) => updateForm("tagsText", event.detail.value)} /></View>
            <View className="creator-choice-list">
              {(["personal", "enterprise"] as const).map((scope) => <Button className={`creator-choice ${form.scope === scope ? "active" : ""}`} key={scope} onClick={() => updateForm("scope", scope)}>{scope === "personal" ? "个人工坊" : "团队工坊"}</Button>)}
            </View>
            <Button className="creator-primary-btn creator-full-btn" disabled={!project.currentSessionVersionId || !packageFormValid || packageMutation.isPending} onClick={() => packageMutation.mutate()}>{packageMutation.isPending ? "正在封装" : "创建工坊服务并封装"}</Button>
          </> : <View className="creator-record-grid">
            <View className="creator-record-cell"><View className="summary-label">Package</View><View className="summary-value mono">{project.packageId}</View></View>
            <View className="creator-record-cell"><View className="summary-label">Workshop</View><View className="summary-value mono">{project.workshopId}</View></View>
            <View className="creator-record-cell"><View className="summary-label">Service</View><View className="summary-value mono">{project.serviceId}</View></View>
            <View className="creator-record-cell"><View className="summary-label">Session Version</View><View className="summary-value mono">{project.currentSessionVersionId}</View></View>
          </View>}
        </View>

        <View className="creator-form-section">
          <View className="creator-section-head"><View><View className="creator-section-title">02 Release</View><View className="creator-note">选择发布范围并生成正式 Gate</View></View><View className={`pill ${latestRelease ? "success" : ""}`}>{latestRelease?.state ?? "WAITING"}</View></View>
          {!latestRelease ? <>
            <View className="creator-choice-list">
              {(["private", "staged", "production"] as CreatorReleaseState[]).map((state) => <Button className={`creator-choice ${form.releaseState === state ? "active" : ""}`} key={state} onClick={() => updateForm("releaseState", state)}>{state === "private" ? "私有" : state === "staged" ? "灰度" : "正式"}</Button>)}
            </View>
            <Button className="creator-primary-btn creator-full-btn" disabled={!packageReady || releaseMutation.isPending} onClick={() => releaseMutation.mutate()}>{releaseMutation.isPending ? "正在创建 Release" : "创建 Release"}</Button>
          </> : <View className="creator-record-grid">
            <View className="creator-record-cell"><View className="summary-label">Release ID</View><View className="summary-value mono">{latestRelease.releaseId}</View></View>
            <View className="creator-record-cell"><View className="summary-label">发布通道</View><View className="summary-value">{latestRelease.channelLabel.zh}</View></View>
            <View className="creator-record-cell"><View className="summary-label">目标工作区</View><View className="summary-value mono">{latestRelease.targetWorkspaceContextKey}</View></View>
          </View>}
        </View>

        {latestRelease ? <View className="creator-form-section">
          <View className="creator-section-head"><View><View className="creator-section-title">03 发布门</View><View className="creator-note">每项 Gate 保存检查清单与证据引用</View></View><View className={`pill ${allGatesPassed ? "success" : "active"}`}>{allGatesPassed ? "ALL PASSED" : "REVIEW"}</View></View>
          <Textarea className="creator-textarea" value={releaseNote} maxlength={4000} onInput={(event) => setReleaseNote(event.detail.value)} />
          {(gatesQuery.data ?? []).map((gate) => {
            const allowed = roleRank(currentWorkspace.role) >= roleRank(gate.requiredRole);
            return <View className="creator-gate-row" key={gate.gateId}>
              <View className="creator-gate-main"><View className="file-name">{gateLabel(gate)}</View><View className="file-meta">{gate.resultSummary.zh}</View><View className="creator-note">要求权限：{gateRoleLabel(gate.requiredRole)} / 清单 {gate.checklist.length} 项</View></View>
              <View className="creator-gate-action"><View className={`pill ${gateTone(gate.status)}`}>{gate.status}</View>{gate.status === "pending" || gate.status === "failed" ? <Button className="pill active" disabled={!allowed || gateMutation.isPending || !releaseNote.trim()} onClick={() => gateMutation.mutate(gate)}>{allowed ? "确认通过" : "权限不足"}</Button> : null}</View>
            </View>;
          })}
          {gatesQuery.isLoading ? <View className="creator-note">正在加载发布门...</View> : null}
        </View> : null}

        {latestRelease ? <View className="creator-form-section">
          <View className="creator-section-head"><View><View className="creator-section-title">04 激活服务</View><View className="creator-note">发布后服务进入工坊并可直接实例化</View></View><View className={`pill ${activeActivation ? "success" : ""}`}>{activeActivation ? "ACTIVE" : "WAITING"}</View></View>
          {activeActivation ? <View className="creator-security-note">已激活到 {activeActivation.targetWorkspaceContextKey}<View className="mono">{activeActivation.activationId}</View></View> : <Button className="creator-primary-btn creator-full-btn" disabled={!allGatesPassed || activationMutation.isPending || roleRank(currentWorkspace.role) < roleRank("admin")} onClick={() => activationMutation.mutate()}>{activationMutation.isPending ? "正在激活" : roleRank(currentWorkspace.role) < roleRank("admin") ? "需要管理员权限" : "激活并发布"}</Button>}
        </View> : null}

        {(mutationError || packageQuery.error || releasesQuery.error || gatesQuery.error || activationsQuery.error) ? <View className="inline-error-banner">{mutationError instanceof Error ? mutationError.message : "发布链路加载失败，请刷新后重试。"}</View> : null}
        {activeActivation ? <View className="creator-footer-actions"><Button className="creator-secondary-btn" onClick={() => Taro.switchTab({ url: "/pages/workshops/index" })}>查看工坊</Button><Button className="creator-primary-btn" onClick={() => Taro.redirectTo({ url: `/pages/creator/project?id=${encodeURIComponent(project.sessionProjectId)}` })}>返回项目</Button></View> : null}
      </View>
    </View>
  );
}
