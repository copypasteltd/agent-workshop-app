import type {
  SessionPackRedactionRuleInput,
  SessionPackRedactionStrategy,
  SessionPackRedactionTargetKind,
} from "@lingban/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Input, Textarea, View } from "@tarojs/components";
import Taro, { getCurrentInstance } from "@tarojs/taro";
import { useEffect, useMemo, useState } from "react";
import { useMobilePageShellClass } from "../../components/MobilePageShell";
import {
  mobileSessionCapturesApi,
  mobileSessionDraftsApi,
  mobileSessionProjectsApi,
} from "../../lib/api";
import { canCreateMobileSourceRun, mobileCreatorQueryKeys } from "../../lib/mobileCreator";
import { useResolvedMobileWorkspace } from "../../lib/useMobileWorkspace";
import { hasAuthoritativeMobileWorkspaceContext } from "../../lib/workspaceContext";

function reportArrayCount(value: Record<string, unknown>, key: string) {
  const result = value[key];
  return Array.isArray(result) ? result.length : 0;
}

function securityPassed(value: Record<string, unknown>) {
  return value.passed === true;
}

function createRuleId() {
  return `rule_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export default function CreatorDraftPage() {
  const pageShellClass = useMobilePageShellClass("creator-page-shell");
  const queryClient = useQueryClient();
  const params = getCurrentInstance().router?.params;
  const draftId = params?.id ?? "";
  const projectId = params?.projectId ?? "";
  const currentWorkspace = useResolvedMobileWorkspace();
  const workspaceReady = hasAuthoritativeMobileWorkspaceContext(currentWorkspace);
  const creatorAllowed =
    currentWorkspace.source === "auth" && canCreateMobileSourceRun(currentWorkspace.role);
  const [rules, setRules] = useState<SessionPackRedactionRuleInput[]>([]);
  const [rulesSourceRevisionId, setRulesSourceRevisionId] = useState<string | null>(null);
  const [targetKind, setTargetKind] = useState<SessionPackRedactionTargetKind>("text");
  const [selector, setSelector] = useState("");
  const [strategy, setStrategy] = useState<SessionPackRedactionStrategy>("mask");
  const [replacement, setReplacement] = useState("");
  const [rationale, setRationale] = useState("");
  const [reviewNote, setReviewNote] = useState("已核对脱敏范围与安全扫描结果");
  const [signingPolicyId, setSigningPolicyId] = useState("default-production-signing");

  const draftQuery = useQuery({
    queryKey: mobileCreatorQueryKeys.draft(currentWorkspace.runtimeWorkspaceId, draftId),
    queryFn: () => mobileSessionDraftsApi.get(draftId),
    enabled: Boolean(draftId && workspaceReady && creatorAllowed),
    retry: false,
  });
  const detail = draftQuery.data ?? null;
  const captureQuery = useQuery({
    queryKey: ["mobile", "creator", "capture", detail?.draft.sourceCaptureId ?? "missing"],
    queryFn: () => mobileSessionCapturesApi.get(detail!.draft.sourceCaptureId),
    enabled: Boolean(detail?.draft.sourceCaptureId),
    retry: false,
  });
  const projectQuery = useQuery({
    queryKey: mobileCreatorQueryKeys.project(currentWorkspace.runtimeWorkspaceId, projectId || "missing"),
    queryFn: () => mobileSessionProjectsApi.get(projectId),
    enabled: Boolean(projectId),
    retry: false,
  });

  const latestRevision = useMemo(
    () => [...(detail?.revisions ?? [])].sort((a, b) => b.revisionNumber - a.revisionNumber)[0] ?? null,
    [detail?.revisions]
  );
  const latestReview = useMemo(
    () => [...(detail?.reviews ?? [])].sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt))[0] ?? null,
    [detail?.reviews]
  );
  const latestReplay = useMemo(
    () => [...(detail?.replays ?? [])]
      .filter((replay) => replay.revisionId === latestRevision?.revisionId)
      .sort((a, b) => b.finishedAt.localeCompare(a.finishedAt))[0] ?? null,
    [detail?.replays, latestRevision?.revisionId]
  );
  const latestVersion = useMemo(
    () => [...(detail?.versions ?? [])].sort((a, b) => b.sealedAt.localeCompare(a.sealedAt))[0] ?? null,
    [detail?.versions]
  );

  useEffect(() => {
    if (!latestRevision || latestRevision.revisionId === rulesSourceRevisionId) return;
    setRules(latestRevision.redactionRules);
    setRulesSourceRevisionId(latestRevision.revisionId);
  }, [latestRevision, rulesSourceRevisionId]);

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["mobile", "creator", "drafts"] }),
      queryClient.invalidateQueries({ queryKey: ["mobile", "creator", "projects"] }),
    ]);
  };

  const revisionMutation = useMutation({
    mutationFn: async () => {
      if (!detail || !captureQuery.data) throw new Error("Capture 尚未加载");
      return mobileSessionDraftsApi.createRevision(draftId, {
        expectedVersion: detail.draft.version,
        workspaceSelection: captureQuery.data.workspaceSelection,
        redactionRules: rules,
      });
    },
    onSuccess: invalidate,
  });
  const reviewMutation = useMutation({
    mutationFn: async (decision: "approved" | "changes_requested") => {
      if (!detail || !latestRevision) throw new Error("Revision 尚未生成");
      return mobileSessionDraftsApi.review(draftId, {
        expectedVersion: detail.draft.version,
        revisionId: latestRevision.revisionId,
        decision,
        note: reviewNote.trim() || null,
      });
    },
    onSuccess: invalidate,
  });
  const replayMutation = useMutation({
    mutationFn: async () => {
      if (!detail || !latestRevision) throw new Error("Revision 尚未生成");
      return mobileSessionDraftsApi.replay(draftId, {
        expectedVersion: detail.draft.version,
        revisionId: latestRevision.revisionId,
      });
    },
    onSuccess: invalidate,
  });
  const sealMutation = useMutation({
    mutationFn: async () => {
      if (!detail || !latestRevision || latestReplay?.status !== "passed") {
        throw new Error("需要通过恢复验证后才能密封");
      }
      return mobileSessionDraftsApi.seal(draftId, {
        expectedVersion: detail.draft.version,
        revisionId: latestRevision.revisionId,
        signingPolicyId: signingPolicyId.trim(),
        replayId: latestReplay.replayId,
      });
    },
    onSuccess: async () => {
      await invalidate();
      if (projectId) {
        await Taro.redirectTo({ url: `/pages/creator/publish?id=${encodeURIComponent(projectId)}` });
      }
    },
  });

  const addRule = () => {
    if (!selector.trim() || (strategy === "replace" && !replacement.trim())) {
      Taro.showToast({ title: "请完整填写脱敏规则", icon: "none" });
      return;
    }
    setRules((current) => [...current, {
      ruleId: createRuleId(),
      targetKind,
      selector: selector.trim(),
      strategy,
      ...(strategy === "replace" ? { replacement: replacement.trim() } : {}),
      ...(rationale.trim() ? { rationale: rationale.trim() } : {}),
    }]);
    setSelector("");
    setReplacement("");
    setRationale("");
  };

  const mutationError = revisionMutation.error ?? reviewMutation.error ?? replayMutation.error ?? sealMutation.error;

  if (!workspaceReady || !creatorAllowed) {
    return <View className={pageShellClass}><View className="empty-state creator-empty"><View className="section-title">当前草稿不可访问</View><Button className="send-btn" onClick={() => Taro.navigateBack()}>返回</Button></View></View>;
  }
  if (!draftId || draftQuery.isLoading) {
    return <View className={pageShellClass}><View className="empty-state creator-empty"><View className="section-title">{draftId ? "正在加载固化草稿" : "缺少 Draft ID"}</View></View></View>;
  }
  if (!detail || draftQuery.error) {
    return <View className={pageShellClass}><View className="empty-state creator-empty"><View className="section-title">草稿加载失败</View><View className="empty-copy">{draftQuery.error instanceof Error ? draftQuery.error.message : "草稿不存在"}</View><Button className="send-btn" onClick={() => draftQuery.refetch()}>重试</Button></View></View>;
  }

  const secure = latestRevision ? securityPassed(latestRevision.securityReport) : false;
  const findings = latestRevision ? reportArrayCount(latestRevision.securityReport, "findings") : 0;
  const packIssues = latestRevision ? reportArrayCount(latestRevision.securityReport, "packIssues") : 0;
  const sealed = detail.draft.status === "sealed" || Boolean(latestVersion);

  return (
    <View className={pageShellClass}>
      <View className="creator-page" data-testid="mobile-creator-draft-page">
        <View className="creator-heading">
          <View>
            <View className="page-eyebrow">Session Draft</View>
            <View className="creator-title">审核与固化</View>
            <View className="section-copy">{projectQuery.data?.name ?? detail.session?.name ?? draftId}</View>
          </View>
          <View className={`pill ${sealed ? "success" : "active"}`}>{detail.draft.status}</View>
        </View>

        <View className="creator-context-band">
          <View className="creator-context-item"><View className="summary-label">Draft 版本</View><View className="summary-value">v{detail.draft.version}</View></View>
          <View className="creator-context-item"><View className="summary-label">Capture</View><View className="summary-value mono">{detail.draft.sourceCaptureId}</View></View>
        </View>

        <View className="creator-form-section">
          <View className="creator-section-head">
            <View><View className="creator-section-title">01 脱敏规则与 Revision</View><View className="creator-note">规则直接进入 Session Pack 构建输入</View></View>
            <View className="pill">{rules.length} 条规则</View>
          </View>
          {rules.map((rule, index) => (
            <View className="creator-rule-row" key={rule.ruleId}>
              <View className="creator-row-main"><View className="file-name">{rule.targetKind} / {rule.strategy}</View><View className="file-meta mono">{rule.selector}</View></View>
              <Button className="pill" disabled={sealed} onClick={() => setRules((current) => current.filter((_, itemIndex) => itemIndex !== index))}>移除</Button>
            </View>
          ))}
          {!sealed ? <View className="creator-rule-editor">
            <View className="creator-subsection-title">新增规则</View>
            <View className="creator-choice-list">
              {(["text", "file-path", "json-path", "header", "cookie"] as const).map((value) => <Button className={`creator-choice ${targetKind === value ? "active" : ""}`} key={value} onClick={() => setTargetKind(value)}>{value}</Button>)}
            </View>
            <Input className="creator-input" value={selector} placeholder={targetKind === "json-path" ? "$.credentials.apiKey" : "匹配内容或路径"} onInput={(event) => setSelector(event.detail.value)} />
            <View className="creator-choice-list">
              {(["mask", "remove", "replace", "hash"] as const).map((value) => <Button className={`creator-choice ${strategy === value ? "active" : ""}`} key={value} onClick={() => setStrategy(value)}>{value}</Button>)}
            </View>
            {strategy === "replace" ? <Input className="creator-input" value={replacement} placeholder="替换值" onInput={(event) => setReplacement(event.detail.value)} /> : null}
            <Input className="creator-input" value={rationale} placeholder="规则说明（可选）" onInput={(event) => setRationale(event.detail.value)} />
            <Button className="creator-secondary-btn creator-full-btn" onClick={addRule}>加入规则</Button>
          </View> : null}
          <Button
            className="creator-primary-btn creator-full-btn"
            disabled={sealed || !captureQuery.data || revisionMutation.isPending}
            onClick={() => revisionMutation.mutate()}
          >{revisionMutation.isPending ? "正在构建 Revision" : latestRevision ? "按当前规则生成新 Revision" : "生成首个 Revision"}</Button>
          {captureQuery.error ? <View className="inline-error-banner">Capture 加载失败，无法生成 Revision。</View> : null}
        </View>

        <View className="creator-form-section">
          <View className="creator-section-head"><View><View className="creator-section-title">02 安全审核</View><View className="creator-note">检查敏感内容与 Pack 完整性</View></View><View className={`pill ${secure ? "success" : "warn"}`}>{latestRevision ? secure ? "PASSED" : "ACTION REQUIRED" : "WAITING"}</View></View>
          <View className="creator-record-grid">
            <View className="creator-record-cell"><View className="summary-label">Revision</View><View className="summary-value mono">{latestRevision?.revisionId ?? "--"}</View></View>
            <View className="creator-record-cell"><View className="summary-label">敏感项</View><View className="summary-value">{findings}</View></View>
            <View className="creator-record-cell"><View className="summary-label">Pack 问题</View><View className="summary-value">{packIssues}</View></View>
            <View><View className="summary-label">最近审核</View><View className="summary-value">{latestReview?.decision ?? "--"}</View></View>
          </View>
          <Textarea className="creator-textarea" value={reviewNote} maxlength={4000} placeholder="审核说明" onInput={(event) => setReviewNote(event.detail.value)} />
          <View className="creator-inline-actions">
            <Button className="creator-secondary-btn" disabled={!latestRevision || sealed || reviewMutation.isPending} onClick={() => reviewMutation.mutate("changes_requested")}>要求修改</Button>
            <Button className="creator-primary-btn" disabled={!latestRevision || !secure || sealed || reviewMutation.isPending} onClick={() => reviewMutation.mutate("approved")}>通过审核</Button>
          </View>
        </View>

        <View className="creator-form-section">
          <View className="creator-section-head"><View><View className="creator-section-title">03 恢复验证</View><View className="creator-note">重建工作区并核对文件与事件流</View></View><View className={`pill ${latestReplay?.status === "passed" ? "success" : latestReplay?.status === "failed" ? "warn" : ""}`}>{latestReplay?.status ?? "NOT RUN"}</View></View>
          {latestReplay ? <View className="creator-check-list">
            {latestReplay.checks.map((check) => <View className="creator-check-row" key={check.checkId}><View className="creator-row-main"><View className="file-name">{check.checkId}</View><View className="file-meta">{check.detail}</View></View><View className={`pill ${check.status === "passed" ? "success" : "warn"}`}>{check.status}</View></View>)}
          </View> : null}
          <Button className="creator-primary-btn creator-full-btn" disabled={detail.draft.status !== "ready_to_seal" || sealed || replayMutation.isPending} onClick={() => replayMutation.mutate()}>{replayMutation.isPending ? "正在恢复验证" : "执行恢复验证"}</Button>
        </View>

        <View className="creator-form-section">
          <View className="creator-section-head"><View><View className="creator-section-title">04 密封版本</View><View className="creator-note">生成签名且不可变的 Session Version</View></View><View className={`pill ${latestVersion ? "success" : ""}`}>{latestVersion ? "SEALED" : "WAITING"}</View></View>
          <View className="creator-field"><View className="creator-field-label">签名策略</View><Input className="creator-input" value={signingPolicyId} disabled={sealed} onInput={(event) => setSigningPolicyId(event.detail.value)} /></View>
          {latestVersion ? <View className="creator-security-note"><View className="mono">{latestVersion.sessionVersionId}</View><View>{latestVersion.signatureAlgorithm} / {latestVersion.signatureKeyId}</View></View> : null}
          <Button className="creator-primary-btn creator-full-btn" disabled={sealed || latestReplay?.status !== "passed" || !signingPolicyId.trim() || sealMutation.isPending} onClick={() => sealMutation.mutate()}>{sealMutation.isPending ? "正在密封" : "密封 Session Version"}</Button>
          {sealed && projectId ? <Button className="creator-secondary-btn creator-full-btn" onClick={() => Taro.redirectTo({ url: `/pages/creator/publish?id=${encodeURIComponent(projectId)}` })}>进入封装发布</Button> : null}
        </View>

        {mutationError ? <View className="inline-error-banner">{mutationError instanceof Error ? mutationError.message : "固化操作失败"}</View> : null}
      </View>
    </View>
  );
}
