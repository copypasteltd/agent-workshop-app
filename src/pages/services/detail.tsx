import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, View } from "@tarojs/components";
import Taro, { getCurrentInstance } from "@tarojs/taro";
import { useEffect, useMemo } from "react";
import { mobileCatalogApi, mobileRunsApi } from "../../lib/api";
import {
  buildMobileServiceConnectorLabels,
  buildMobileServiceLaunchFlow,
  buildMobileServiceRiskSummary,
  mapServiceCatalogEntryToMobileService,
  resolveMobileEntrySurface,
} from "../../lib/catalog";
import { useMobileRecentRecorder } from "../../lib/recent";
import { useMobileWorkspaceCatalog } from "../../lib/useMobileWorkspaceCatalog";
import { useResolvedMobileWorkspace } from "../../lib/useMobileWorkspace";

export default function ServiceDetailPage() {
  const queryClient = useQueryClient();
  const id = getCurrentInstance().router?.params?.id;
  const currentWorkspace = useResolvedMobileWorkspace();
  const { visibleServices } = useMobileWorkspaceCatalog(currentWorkspace);
  const entrySurface = resolveMobileEntrySurface();
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
    enabled: Boolean(id),
    retry: false,
    staleTime: 30_000,
  });

  const fallbackService = useMemo(
    () => {
      const matched = visibleServices.find((item) => item.id === id) ?? null;
      if (matched) {
        return matched;
      }

      return currentWorkspace.source === "static" ? visibleServices[0] ?? null : null;
    },
    [currentWorkspace.source, id, visibleServices]
  );

  const service = useMemo(
    () =>
      serviceQuery.data
        ? mapServiceCatalogEntryToMobileService(serviceQuery.data)
        : fallbackService,
    [fallbackService, serviceQuery.data]
  );

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

  useEffect(() => {
    if (!id || !service || service.id === id) {
      return;
    }

    Taro.redirectTo({ url: `/pages/services/detail?id=${service.id}` });
  }, [id, service]);

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

      const template = await mobileCatalogApi.createLaunchTemplate(service.id, {
        workspaceContextKey: currentWorkspace.id,
        workspaceId:
          currentWorkspace.source === "auth" ? currentWorkspace.runtimeWorkspaceId : undefined,
        entrySurface,
      });

      return mobileRunsApi.createRun(template.createRunInput);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["mobile", "runs"] }),
        queryClient.invalidateQueries({ queryKey: ["mobile", "me", "recent"] }),
      ]);
    },
  });

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
          <View className="file-row">
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
            <View className="pill">启动后补全资料</View>
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
              onClick={async () => {
                try {
                  const created = await launchRunMutation.mutateAsync();
                  Taro.navigateTo({ url: `/pages/tasks/detail?id=${created.run.runId}` });
                } catch (error) {
                  Taro.showToast({
                    title: error instanceof Error ? "启动失败" : "启动失败",
                    icon: "none",
                  });
                }
              }}
            >
              {launchRunMutation.isPending ? "启动中" : "立即启动"}
            </Button>
          </View>
          {launchRunMutation.error instanceof Error ? (
            <View className="section-copy" style={{ marginTop: "12px" }}>
              {launchRunMutation.error.message}
            </View>
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
