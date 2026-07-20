import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Image, Input, Switch, Textarea, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useMemo, useState } from "react";
import { useMobilePageShellClass } from "../../components/MobilePageShell";
import chevronDownIcon from "../../assets/chevron-down.svg";
import {
  mobileCredentialsApi,
  mobileMcpApi,
  mobileProvidersApi,
  mobileSessionProjectsApi,
} from "../../lib/api";
import { resolveMobileEntrySurface } from "../../lib/catalog";
import {
  buildCreatorRunBindings,
  canCreateMobileSourceRun,
  clearCreatorLaunchDraft,
  createDefaultCreatorLaunchDraft,
  readCreatorLaunchDraft,
  resolveAutoAttachedCapabilities,
  writeCreatorLaunchDraft,
  type MobileCreatorLaunchDraft,
} from "../../lib/mobileCreator";
import { useResolvedMobileWorkspace } from "../../lib/useMobileWorkspace";
import { hasAuthoritativeMobileWorkspaceContext } from "../../lib/workspaceContext";

export default function NewTaskPage() {
  const pageShellClass = useMobilePageShellClass("creator-page-shell");
  const queryClient = useQueryClient();
  const currentWorkspace = useResolvedMobileWorkspace();
  const workspaceReady = hasAuthoritativeMobileWorkspaceContext(currentWorkspace);
  const creatorAllowed =
    currentWorkspace.source === "auth" && canCreateMobileSourceRun(currentWorkspace.role);
  const [draft, setDraft] = useState<MobileCreatorLaunchDraft>(() =>
    readCreatorLaunchDraft(currentWorkspace.runtimeWorkspaceId) ??
    createDefaultCreatorLaunchDraft(currentWorkspace.runtimeWorkspaceId)
  );
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [defaultsApplied, setDefaultsApplied] = useState(false);
  const [createStage, setCreateStage] = useState<"idle" | "project" | "run">("idle");

  useEffect(() => {
    const workspaceId = currentWorkspace.runtimeWorkspaceId;
    setDraft(
      readCreatorLaunchDraft(workspaceId) ?? createDefaultCreatorLaunchDraft(workspaceId)
    );
    setDefaultsApplied(false);
    setCreateStage("idle");
  }, [currentWorkspace.runtimeWorkspaceId]);

  useEffect(() => {
    if (draft.workspaceId === currentWorkspace.runtimeWorkspaceId) {
      writeCreatorLaunchDraft(draft);
    }
  }, [currentWorkspace.runtimeWorkspaceId, draft]);

  const providersQuery = useQuery({
    queryKey: ["mobile", "creator-launch", "providers", currentWorkspace.selectionId],
    queryFn: () => mobileProvidersApi.listProviders({ enabled: true }),
    enabled: workspaceReady && creatorAllowed,
    retry: false,
  });
  const providerBindingsQuery = useQuery({
    queryKey: ["mobile", "creator-launch", "provider-bindings", currentWorkspace.selectionId],
    queryFn: () => mobileProvidersApi.listBindings({ enabled: true }),
    enabled: workspaceReady && creatorAllowed,
    retry: false,
  });
  const mcpsQuery = useQuery({
    queryKey: ["mobile", "creator-launch", "mcps", currentWorkspace.selectionId],
    queryFn: () => mobileMcpApi.listMcps({ status: "active" }),
    enabled: workspaceReady && creatorAllowed,
    retry: false,
  });
  const mcpBindingsQuery = useQuery({
    queryKey: ["mobile", "creator-launch", "mcp-bindings", currentWorkspace.selectionId],
    queryFn: () => mobileMcpApi.listBindings({ status: "active" }),
    enabled: workspaceReady && creatorAllowed,
    retry: false,
  });
  const credentialsQuery = useQuery({
    queryKey: ["mobile", "creator-launch", "credentials", currentWorkspace.selectionId],
    queryFn: () => mobileCredentialsApi.listCredentials({ status: "active" }),
    enabled: workspaceReady && creatorAllowed,
    retry: false,
  });

  const providerOptions = useMemo(() => {
    const providerById = new Map(
      (providersQuery.data ?? []).map((provider) => [provider.providerId, provider])
    );
    return [...new Map(
      (providerBindingsQuery.data ?? [])
        .filter((binding) => binding.enabled)
        .sort((left, right) => {
          if (left.isDefault !== right.isDefault) return left.isDefault ? -1 : 1;
          return left.priority - right.priority;
        })
        .map((binding) => [binding.providerId, {
          binding,
          provider: providerById.get(binding.providerId),
        }])
    ).values()].filter((item) => Boolean(item.provider));
  }, [providerBindingsQuery.data, providersQuery.data]);
  const selectedProvider =
    providersQuery.data?.find((provider) => provider.providerId === draft.providerId) ?? null;
  const enabledModels = selectedProvider?.models.filter((model) => model.enabled) ?? [];

  useEffect(() => {
    if (defaultsApplied || !mcpsQuery.data || !mcpBindingsQuery.data) return;
    const defaults = resolveAutoAttachedCapabilities(mcpsQuery.data, mcpBindingsQuery.data);
    setDraft((current) => ({
      ...current,
      selectedMcpIds: current.selectedMcpIds.length > 0
        ? current.selectedMcpIds
        : defaults.mcpIds,
      selectedCredentialIds: current.selectedCredentialIds.length > 0
        ? current.selectedCredentialIds
        : defaults.credentialIds,
    }));
    setDefaultsApplied(true);
  }, [defaultsApplied, mcpBindingsQuery.data, mcpsQuery.data]);

  const capabilityError =
    providersQuery.error ?? providerBindingsQuery.error ?? mcpsQuery.error ??
    mcpBindingsQuery.error ?? credentialsQuery.error;
  const capabilityLoading =
    providersQuery.isPending || providerBindingsQuery.isPending || mcpsQuery.isPending ||
    mcpBindingsQuery.isPending || credentialsQuery.isPending;
  const capabilityReady =
    providersQuery.isSuccess && providerBindingsQuery.isSuccess && mcpsQuery.isSuccess &&
    mcpBindingsQuery.isSuccess && credentialsQuery.isSuccess;
  const providerReady = providerOptions.length > 0;
  const reloadCapabilities = () => {
    void Promise.all([
      providersQuery.refetch(),
      providerBindingsQuery.refetch(),
      mcpsQuery.refetch(),
      mcpBindingsQuery.refetch(),
      credentialsQuery.refetch(),
    ]);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      let sessionProjectId = draft.sessionProjectId;
      if (!sessionProjectId) {
        setCreateStage("project");
        const project = await mobileSessionProjectsApi.create(
          {
            name: draft.name.trim(),
            description: draft.description.trim(),
          },
          { idempotencyKey: draft.projectIdempotencyKey }
        );
        sessionProjectId = project.sessionProjectId;
        setDraft((current) => {
          const next = { ...current, sessionProjectId: project.sessionProjectId };
          writeCreatorLaunchDraft(next);
          return next;
        });
      }

      setCreateStage("run");
      const bindings = buildCreatorRunBindings(
        mcpsQuery.data ?? [],
        draft.selectedMcpIds,
        draft.selectedCredentialIds
      );
      return mobileSessionProjectsApi.createSourceRun(
        {
          sessionProjectId,
          title: draft.name.trim(),
          entrySurface: resolveMobileEntrySurface(),
          approvalMode: draft.approvalMode,
          providerSelection: draft.providerId
            ? { providerId: draft.providerId, ...(draft.model.trim() ? { model: draft.model.trim() } : {}) }
            : null,
          bindings,
        },
        { idempotencyKey: draft.sourceRunIdempotencyKey }
      );
    },
    onSuccess: async (result) => {
      clearCreatorLaunchDraft(currentWorkspace.runtimeWorkspaceId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["mobile", "runs"] }),
        queryClient.invalidateQueries({ queryKey: ["mobile", "creator"] }),
        queryClient.invalidateQueries({ queryKey: ["mobile", "me"] }),
      ]);
      await Taro.redirectTo({
        url: `/pages/tasks/detail?id=${encodeURIComponent(result.run.runId)}`,
      });
    },
    onSettled: () => setCreateStage("idle"),
  });

  const toggleMcp = (mcpId: string, checked: boolean) => {
    setDraft((current) => ({
      ...current,
      selectedMcpIds: checked
        ? [...new Set([...current.selectedMcpIds, mcpId])]
        : current.selectedMcpIds.filter((id) => id !== mcpId),
    }));
  };
  const toggleCredential = (credentialId: string, checked: boolean) => {
    setDraft((current) => ({
      ...current,
      selectedCredentialIds: checked
        ? [...new Set([...current.selectedCredentialIds, credentialId])]
        : current.selectedCredentialIds.filter((id) => id !== credentialId),
    }));
  };

  if (!workspaceReady || !creatorAllowed) {
    return <View className={pageShellClass}>
      <View className="creator-page">
        <View className="empty-state creator-empty">
          <View className="section-title">
            {!workspaceReady ? "正在恢复工作区" : "当前账户没有创作权限"}
          </View>
          <View className="empty-copy">
            {!workspaceReady
              ? "工作区恢复完成后才能创建隔离的空白实例。"
              : "个人工作区所有者，或企业工作区 owner、admin、creator 可以创建 Source Run。"}
          </View>
          <Button className="send-btn" onClick={() => Taro.navigateBack()}>返回</Button>
        </View>
      </View>
    </View>;
  }

  const canSubmit =
    draft.name.trim().length > 0 && capabilityReady && providerReady && !createMutation.isPending;
  const submitLabel = createMutation.isPending
    ? createStage === "project" ? "正在创建项目" : "正在启动 Codex"
    : capabilityError ? "运行能力加载失败"
    : capabilityLoading ? "正在加载运行能力"
    : !capabilityReady ? "运行能力不可用"
    : !providerReady ? "需要 Provider 路由"
    : "启动空白 Codex";

  return <View className={pageShellClass}>
    <View className="creator-page" data-testid="mobile-new-instance-page">
      <View className="creator-heading">
        <View>
          <View className="page-eyebrow">CREATOR SOURCE RUN</View>
          <View className="creator-title">新建空白 Codex</View>
          <View className="section-copy">创建独立运行实例，完成工作流后固化为可发布服务。</View>
        </View>
        <View className="pill active">blank</View>
      </View>

      <View className="creator-context-band">
        <View className="creator-context-item"><View className="summary-label">工作区</View><View className="summary-value">{currentWorkspace.name}</View></View>
        <View className="creator-context-item"><View className="summary-label">默认目录</View><View className="summary-value mono">{currentWorkspace.root}</View></View>
      </View>

      <View className="creator-form-section">
        <View className="creator-section-title">基本信息</View>
        <View className="creator-field">
          <View className="creator-field-label">实例名称</View>
          <Input
            className="creator-input"
            value={draft.name}
            maxlength={160}
            onInput={(event) => setDraft((current) => ({ ...current, name: event.detail.value }))}
          />
        </View>
        <View className="creator-field">
          <View className="creator-field-label">项目说明（可选）</View>
          <Textarea
            className="creator-textarea"
            value={draft.description}
            maxlength={4000}
            placeholder="记录本次工作流目标"
            onInput={(event) => setDraft((current) => ({ ...current, description: event.detail.value }))}
          />
        </View>
        <View className="creator-note">业务资料和执行参数将在实例对话中提供。</View>
      </View>

      <View className="creator-form-section">
        <View className="creator-section-head">
          <View>
            <View className="creator-section-title">Provider</View>
            <View className="creator-note">默认路由支持一键启动</View>
          </View>
          <View className={`pill ${providerReady ? "success" : "warn"}`}>
            {providerReady
              ? `${providerOptions.length} 条路由`
              : capabilityError
                ? "加载失败"
                : capabilityLoading
                  ? "加载中"
                  : "未配置"}
          </View>
        </View>
        <View className="creator-choice-list">
          <Button
            className={`creator-choice ${draft.providerId === "" ? "active" : ""}`}
            onClick={() => setDraft((current) => ({ ...current, providerId: "", model: "" }))}
          >工作区默认</Button>
          {providerOptions.map(({ provider }) => provider ? <Button
            className={`creator-choice ${draft.providerId === provider.providerId ? "active" : ""}`}
            key={provider.providerId}
            onClick={() => setDraft((current) => ({ ...current, providerId: provider.providerId, model: "" }))}
          >{provider.displayName}</Button> : null)}
        </View>
        {selectedProvider ? <View className="creator-model-list">
          <Button
            className={`creator-model ${draft.model === "" ? "active" : ""}`}
            onClick={() => setDraft((current) => ({ ...current, model: "" }))}
          >{selectedProvider.defaultModel} / 默认</Button>
          {enabledModels.map((item) => <Button
            className={`creator-model ${draft.model === item.model ? "active" : ""}`}
            key={item.model}
            onClick={() => setDraft((current) => ({ ...current, model: item.model }))}
          >{item.label ?? item.model}</Button>)}
        </View> : null}
      </View>

      <View className={`creator-advanced ${advancedOpen ? "open" : ""}`}>
        <Button className="creator-advanced-trigger" onClick={() => setAdvancedOpen((value) => !value)}>
          <View><View className="creator-section-title">运行能力</View><View className="creator-note">MCP、凭证和审批策略</View></View>
          <View className="creator-chevron">
            <Image
              className={`creator-chevron-image ${advancedOpen ? "open" : ""}`}
              src={chevronDownIcon}
              mode="aspectFit"
            />
          </View>
        </Button>
        {advancedOpen ? <View className="creator-advanced-body">
          <View className="creator-toggle-row">
            <View className="creator-toggle-content"><View className="creator-field-label">全自动审批</View><View className="creator-note">实例中的审批请求自动通过</View></View>
            <Switch
              checked={draft.approvalMode === "auto_all"}
              color="#5366eb"
              onChange={(event) => setDraft((current) => ({
                ...current,
                approvalMode: event.detail.value ? "auto_all" : "manual",
              }))}
            />
          </View>
          <View className="creator-subsection-title">MCP</View>
          {mcpsQuery.isPending ? <View className="creator-note">正在加载 MCP...</View> : null}
          {(mcpsQuery.data ?? []).map((entry) => <View className="creator-toggle-row" key={entry.mcpId}>
            <View className="creator-toggle-content"><View className="creator-field-label">{entry.displayName}</View><View className="creator-note">{entry.source} / {entry.transport} / {entry.riskLevel}</View></View>
            <Switch
              checked={draft.selectedMcpIds.includes(entry.mcpId)}
              color="#5366eb"
              onChange={(event) => toggleMcp(entry.mcpId, event.detail.value)}
            />
          </View>)}
          {!mcpsQuery.isPending && !mcpsQuery.error && !mcpsQuery.data?.length ? <View className="creator-note">当前工作区没有可用 MCP。</View> : null}
          {mcpBindingsQuery.isPending ? <View className="creator-note">正在加载默认能力绑定...</View> : null}
          <View className="creator-subsection-title">Credential 引用</View>
          {credentialsQuery.isPending ? <View className="creator-note">正在加载 Credential 引用...</View> : null}
          {(credentialsQuery.data ?? []).map((credential) => <View className="creator-toggle-row" key={credential.credentialId}>
            <View className="creator-toggle-content"><View className="creator-field-label">{credential.displayName}</View><View className="creator-note">{credential.provider} / {credential.mountMode}</View></View>
            <Switch
              checked={draft.selectedCredentialIds.includes(credential.credentialId)}
              color="#5366eb"
              onChange={(event) => toggleCredential(credential.credentialId, event.detail.value)}
            />
          </View>)}
          {!credentialsQuery.isPending && !credentialsQuery.error && !credentialsQuery.data?.length ? <View className="creator-note">当前工作区没有可选凭证。</View> : null}
          <View className="creator-security-note">仅保存能力和凭证引用，Secret 明文由 Credential Broker 注入实例。</View>
        </View> : null}
      </View>

      {draft.sessionProjectId ? <View className="creator-resume-note">已创建 Session Project：{draft.sessionProjectId}。重试将继续启动同一个 Source Run。</View> : null}
      {capabilityError ? <View className="inline-error-banner creator-capability-error">
        <View>运行能力配置加载失败。请检查网络后重新加载。</View>
        <Button className="creator-inline-retry" onClick={reloadCapabilities}>重新加载</Button>
      </View> : null}
      {!providerReady && capabilityReady ? <View className="inline-error-banner">当前工作区没有有效 Provider 路由，请先在管理端完成绑定。</View> : null}
      {createMutation.error ? <View className="inline-error-banner">{createMutation.error instanceof Error ? createMutation.error.message : "实例创建失败"}</View> : null}

      <View className="creator-footer-actions">
        <Button className="creator-secondary-btn" onClick={() => Taro.navigateBack()}>取消</Button>
        <Button
          className="creator-primary-btn"
          data-testid="mobile-create-blank-instance"
          disabled={!canSubmit}
          onClick={() => createMutation.mutate()}
        >{submitLabel}</Button>
      </View>
    </View>
  </View>;
}
