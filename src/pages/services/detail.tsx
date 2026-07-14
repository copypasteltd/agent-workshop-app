import { ApiError } from "@lingban/api-sdk";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Input, View } from "@tarojs/components";
import Taro, { getCurrentInstance } from "@tarojs/taro";
import { useEffect, useMemo, useState } from "react";
import { mobileCatalogApi, mobileProvidersApi, mobileRunsApi } from "../../lib/api";
import {
  buildMobileServiceConnectorLabels,
  buildMobileServiceLaunchFlow,
  buildMobileServiceRiskSummary,
  mapServiceCatalogEntryToMobileService,
  resolveMobileEntrySurface,
} from "../../lib/catalog";
import { useMobileRecentRecorder } from "../../lib/recent";
import { useResolvedMobileWorkspace } from "../../lib/useMobileWorkspace";
import { hasAuthoritativeMobileWorkspaceContext } from "../../lib/workspaceContext";

function resolveMissingCredentialIds(error: unknown) {
  if (!(error instanceof ApiError) || error.code !== "CREDENTIAL_REQUIREMENT_UNMET") {
    return [];
  }

  const details =
    typeof error.details === "object" && error.details !== null
      ? (error.details as { missingCredentialIds?: unknown })
      : null;

  return Array.isArray(details?.missingCredentialIds)
    ? details.missingCredentialIds.filter((item): item is string => typeof item === "string")
    : [];
}

type LaunchProviderOption = {
  bindingId: string;
  providerId: string;
  providerLabel: string;
  isDefault: boolean;
  priority: number;
  allowUserOverride: boolean;
  allowCustomModel: boolean;
  defaultModel: string;
  models: string[];
};

export default function ServiceDetailPage() {
  const queryClient = useQueryClient();
  const id = getCurrentInstance().router?.params?.id;
  const currentWorkspace = useResolvedMobileWorkspace();
  const workspaceDataReady = hasAuthoritativeMobileWorkspaceContext(currentWorkspace);
  const entrySurface = resolveMobileEntrySurface();
  const [launchProviderBindingId, setLaunchProviderBindingId] = useState("__default__");
  const [launchProviderModel, setLaunchProviderModel] = useState("");
  const serviceQuery = useQuery({
    queryKey: [
      "mobile",
      "catalog",
      "service",
      currentWorkspace.selectionId,
      currentWorkspace.id,
      entrySurface,
      id,
    ],
    queryFn: async () => {
      if (!id) {
        return null;
      }

      return mobileCatalogApi.getService(id, {
        workspaceContextKey: currentWorkspace.id,
        entrySurface,
      });
    },
    enabled: workspaceDataReady && Boolean(id),
    retry: false,
    staleTime: 30_000,
  });
  const providerBindingsQuery = useQuery({
    queryKey: ["mobile", "launch-provider-bindings", currentWorkspace.selectionId, currentWorkspace.id],
    queryFn: async () => mobileProvidersApi.listBindings(),
    enabled: workspaceDataReady,
    retry: false,
    staleTime: 30_000,
  });
  const providerProfilesQuery = useQuery({
    queryKey: ["mobile", "launch-provider-profiles", currentWorkspace.selectionId, currentWorkspace.id],
    queryFn: async () => mobileProvidersApi.listProviders(),
    enabled: workspaceDataReady,
    retry: false,
    staleTime: 30_000,
  });

  const service = useMemo(
    () => (serviceQuery.data ? mapServiceCatalogEntryToMobileService(serviceQuery.data) : null),
    [serviceQuery.data]
  );
  const providerProfileLookup = useMemo(
    () => new Map((providerProfilesQuery.data ?? []).map((provider) => [provider.providerId, provider])),
    [providerProfilesQuery.data]
  );
  const launchProviderOptions = useMemo<LaunchProviderOption[]>(
    () =>
      (providerBindingsQuery.data ?? [])
        .map((binding) => {
          const provider = providerProfileLookup.get(binding.providerId);
          if (!provider || !binding.enabled || !provider.enabled) {
            return null;
          }

          return {
            bindingId: binding.bindingId,
            providerId: provider.providerId,
            providerLabel: provider.displayName,
            isDefault: binding.isDefault,
            priority: binding.priority,
            allowUserOverride: binding.allowUserOverride,
            allowCustomModel: provider.allowCustomModel,
            defaultModel: provider.defaultModel,
            models: provider.models.filter((item) => item.enabled).map((item) => item.model),
          } satisfies LaunchProviderOption;
        })
        .filter((item): item is LaunchProviderOption => item != null)
        .sort((left, right) => {
          if (left.isDefault !== right.isDefault) {
            return left.isDefault ? -1 : 1;
          }
          if (left.priority !== right.priority) {
            return left.priority - right.priority;
          }
          return left.providerLabel.localeCompare(right.providerLabel);
        }),
    [providerBindingsQuery.data, providerProfileLookup]
  );
  const defaultLaunchProvider = useMemo(
    () => launchProviderOptions.find((option) => option.isDefault) ?? launchProviderOptions[0] ?? null,
    [launchProviderOptions]
  );
  const selectedLaunchProvider = useMemo(() => {
    if (launchProviderBindingId === "__default__") {
      return defaultLaunchProvider;
    }

    return launchProviderOptions.find((option) => option.bindingId === launchProviderBindingId) ?? null;
  }, [defaultLaunchProvider, launchProviderBindingId, launchProviderOptions]);
  const launchProviderSummary = useMemo(() => {
    if (!selectedLaunchProvider) {
      return "";
    }

    const allowedModels =
      selectedLaunchProvider.models.length > 0
        ? selectedLaunchProvider.models.join(", ")
        : selectedLaunchProvider.defaultModel;
    return `当前路由 ${selectedLaunchProvider.providerLabel} / 默认模型 ${selectedLaunchProvider.defaultModel} / 优先级 ${selectedLaunchProvider.priority} / 可选模型 ${allowedModels}`;
  }, [selectedLaunchProvider]);
  const launchProviderOverrideHelp = useMemo(() => {
    if (!selectedLaunchProvider || !selectedLaunchProvider.allowUserOverride) {
      return "";
    }

    if (selectedLaunchProvider.allowCustomModel) {
      return "该路由允许直接输入任意模型名，留空则继续使用默认模型。";
    }

    return `该路由仅允许以下模型：${selectedLaunchProvider.models.join(", ") || selectedLaunchProvider.defaultModel}`;
  }, [selectedLaunchProvider]);

  useEffect(() => {
    setLaunchProviderBindingId("__default__");
    setLaunchProviderModel("");
  }, [currentWorkspace.id, service?.id]);

  const connectorLabels = useMemo(
    () => (serviceQuery.data ? buildMobileServiceConnectorLabels(serviceQuery.data) : []),
    [serviceQuery.data]
  );

  const launchFlow = useMemo(
    () => (serviceQuery.data ? buildMobileServiceLaunchFlow(serviceQuery.data) : []),
    [serviceQuery.data]
  );

  const riskSummary = useMemo(
    () => (serviceQuery.data ? buildMobileServiceRiskSummary(serviceQuery.data) : ""),
    [serviceQuery.data]
  );

  useMobileRecentRecorder(
    service && currentWorkspace.source === "auth"
      ? {
          resourceType: "service",
          serviceId: service.id,
          interaction: "open",
          sourceSurface: entrySurface,
        }
      : null,
    currentWorkspace.source === "auth"
  );

  const launchRunMutation = useMutation({
    mutationFn: async () => {
      if (!service) {
        throw new Error("No visible service for current workspace.");
      }
      if (!workspaceDataReady) {
        throw new Error("Workspace context is not ready yet.");
      }

      const template = await mobileCatalogApi.createLaunchTemplate(service.id, {
        workspaceContextKey: currentWorkspace.id,
        workspaceId:
          currentWorkspace.source === "auth" ? currentWorkspace.runtimeWorkspaceId : undefined,
        entrySurface,
      });

      const trimmedModel = launchProviderModel.trim();
      const shouldPinExplicitProvider = launchProviderBindingId !== "__default__" && selectedLaunchProvider;
      const shouldOverrideModel = Boolean(trimmedModel && selectedLaunchProvider?.allowUserOverride);

      return mobileRunsApi.createRun({
        ...template.createRunInput,
        providerSelection:
          shouldPinExplicitProvider || shouldOverrideModel
            ? {
                providerId: selectedLaunchProvider!.providerId,
                ...(shouldOverrideModel ? { model: trimmedModel } : {}),
              }
            : null,
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["mobile", "runs"] }),
        queryClient.invalidateQueries({ queryKey: ["mobile", "me", "recent"] }),
      ]);
    },
  });
  const launchMissingCredentialIds = resolveMissingCredentialIds(launchRunMutation.error);

  if (!workspaceDataReady) {
    return (
      <View className="page-shell">
        <View className="page-section">
          <View className="hero-card">
            <View className="section-title">Waiting for workspace context</View>
            <View className="section-copy">
              Restore the current workspace session first, then reopen this service to load only
              formal catalog data.
            </View>
            <Button className="pill active" onClick={() => Taro.switchTab({ url: "/pages/workshops/index" })}>
              Return to Workshop
            </Button>
          </View>
        </View>
      </View>
    );
  }

  if (!service) {
    return (
      <View className="page-shell">
        <View className="page-section">
          <View className="hero-card">
            <View className="section-title">当前工作区暂无可启动服务</View>
            <View className="section-copy">
              切换工作区后再回来，或者回到工坊页选择其他可见服务。
            </View>
            <Button className="pill active" onClick={() => Taro.switchTab({ url: "/pages/workshops/index" })}>
              返回工坊
            </Button>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View className="page-shell">
      <View className="page-section">
        <View className="hero-card">
          <View className="section-head">
            <View>
              <View className="page-eyebrow">服务详情</View>
              <View className="section-title">{service.name}</View>
            </View>
            <View className="pill active">{service.eta}</View>
          </View>
          <View className="section-copy">{service.summary}</View>
          <View className="file-row service-auth-row">
            <View>
              <View className="file-name">当前工作区</View>
              <View className="file-meta">
                {currentWorkspace.name} / 默认目录 {currentWorkspace.root}
              </View>
            </View>
            <View className="pill success">
              {currentWorkspace.type}
              {currentWorkspace.source === "auth" ? " / 已登录" : ""}
            </View>
          </View>
          <View className="file-row">
            <View>
              <View className="file-name">授权要求</View>
              <View className="file-meta">{service.auth}</View>
            </View>
            <View className="pill service-info-pill">启动后补全资料</View>
          </View>
          <View className="file-card" style={{ marginTop: "14px" }}>
            <View className="file-name">Provider 路由</View>
            {launchProviderOptions.length > 0 ? (
              <>
                <View className="pill-row" style={{ marginTop: "10px" }}>
                  <Button
                    className={launchProviderBindingId === "__default__" ? "pill active" : "pill"}
                    onClick={() => setLaunchProviderBindingId("__default__")}
                  >
                    {defaultLaunchProvider
                      ? `工作区默认 / ${defaultLaunchProvider.providerLabel}`
                      : "工作区默认"}
                  </Button>
                  {launchProviderOptions.map((option) => (
                    <Button
                      key={option.bindingId}
                      className={launchProviderBindingId === option.bindingId ? "pill active" : "pill"}
                      onClick={() => setLaunchProviderBindingId(option.bindingId)}
                    >
                      {option.providerLabel}
                    </Button>
                  ))}
                </View>
                {launchProviderSummary ? (
                  <View className="section-copy" style={{ marginTop: "10px" }}>
                    {launchProviderSummary}
                  </View>
                ) : null}
                {selectedLaunchProvider?.allowUserOverride ? (
                  <>
                    <Input
                      className="composer-input provider-model-input"
                      style={{ marginTop: "10px" }}
                      value={launchProviderModel}
                      onInput={(event) => setLaunchProviderModel(event.detail.value)}
                      placeholder="可选：覆盖默认模型"
                    />
                    {launchProviderOverrideHelp ? (
                      <View className="section-copy" style={{ marginTop: "8px" }}>
                        {launchProviderOverrideHelp}
                      </View>
                    ) : null}
                  </>
                ) : (
                  <View className="section-copy" style={{ marginTop: "10px" }}>
                    当前路由锁定默认模型，启动时不会接受模型覆盖。
                  </View>
                )}
              </>
            ) : (
              <View className="section-copy" style={{ marginTop: "10px" }}>
                当前工作区尚未绑定任何 Provider。实例会继续按既有默认运行时配置启动。
              </View>
            )}
          </View>
          <View className="summary-grid">
            <View className="summary-card">
              <View className="summary-label">当前空间</View>
              <View className="summary-value">{currentWorkspace.name}</View>
            </View>
            <View className="summary-card">
              <View className="summary-label">工作目录</View>
              <View className="summary-value mono">
                {serviceQuery.data?.targetPathHint ?? currentWorkspace.root}
              </View>
            </View>
          </View>
          <View className="card-row">
            <Button className="pill" onClick={() => Taro.navigateBack()}>
              返回工坊
            </Button>
            <Button
              className="pill active"
              data-testid="mobile-service-launch-button"
              onClick={async () => {
                try {
                  const created = await launchRunMutation.mutateAsync();
                  Taro.navigateTo({ url: `/pages/tasks/detail?id=${created.run.runId}` });
                } catch (error) {
                  const missingCredentialIds = resolveMissingCredentialIds(error);
                  const message =
                    missingCredentialIds.length > 0
                      ? "缺少凭证配置"
                      : error instanceof Error
                        ? error.message
                        : "启动失败";
                  Taro.showToast({
                    title: message.slice(0, 20),
                    icon: "none",
                  });
                }
              }}
            >
              {launchRunMutation.isPending ? "启动中" : "立即启动"}
            </Button>
          </View>
          {launchRunMutation.error instanceof Error ? (
            launchMissingCredentialIds.length > 0 ? (
              <View className="section-copy" style={{ marginTop: "12px" }}>
                缺少必需凭证：
                {launchMissingCredentialIds.join(" / ")}
              </View>
            ) : (
              <View className="section-copy" style={{ marginTop: "12px" }}>
                {launchRunMutation.error.message}
              </View>
            )
          ) : null}
        </View>
      </View>

      {serviceQuery.data ? (
        <>
          <View className="page-section">
            <View className="file-card">
              <View className="file-name">Creator 与能力挂载</View>
              <View className="file-meta">
                {serviceQuery.data.workshop.ownerLabel.zh} / {serviceQuery.data.displayName.zh}
              </View>
              <View className="pill-row">
                {connectorLabels.map((item) => (
                  <View className="pill" key={item}>
                    {item}
                  </View>
                ))}
              </View>
            </View>
          </View>

          <View className="page-section">
            <View className="file-card">
              <View className="file-name">结果输出契约</View>
              <View className="section-copy">{serviceQuery.data.outputContractSummary.zh}</View>
            </View>
            <View className="file-card">
              <View className="file-name">授权与风险边界</View>
              <View className="section-copy">{riskSummary}</View>
            </View>
          </View>

          <View className="page-section">
            <View className="file-card">
              <View className="file-name">启动后流程</View>
              {launchFlow.map((item, index) => (
                <View className="file-row" key={`${index + 1}-${item}`}>
                  <View>
                    <View className="file-name">步骤 {index + 1}</View>
                    <View className="file-meta">{item}</View>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </>
      ) : null}
    </View>
  );
}
