import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, View } from "@tarojs/components";
import Taro, { getCurrentInstance } from "@tarojs/taro";
import { useEffect, useMemo } from "react";
import { mobileServiceDetailContent } from "../../data/mobileDetailContent";
import { findVisibleService, getWorkspaceEntry, type MobileWorkspaceId } from "../../data/workspaceCatalog";
import { mobileRunsApi } from "../../lib/api";
import { buildMobileRunInput } from "../../lib/runTemplates";
import { useMobileUiStore } from "../../stores/mobileUiStore";

export default function ServiceDetailPage() {
  const queryClient = useQueryClient();
  const id = getCurrentInstance().router?.params?.id;
  const currentWorkspaceId = useMobileUiStore((state) => state.currentWorkspaceId) as MobileWorkspaceId;
  const currentWorkspace = getWorkspaceEntry(currentWorkspaceId);
  const service = useMemo(() => findVisibleService(id, currentWorkspace.id), [currentWorkspace.id, id]);
  const detailContent = service ? mobileServiceDetailContent[service.id] : null;

  useEffect(() => {
    if (!id || !service || service.id === id) {
      return;
    }

    Taro.redirectTo({ url: `/pages/services/detail?id=${service.id}` });
  }, [id, service]);

  const launchRunMutation = useMutation({
    mutationFn: async () => {
      if (!service) {
        throw new Error("No visible service for current workspace.");
      }

      const input = buildMobileRunInput(service.id, currentWorkspaceId);

      if (!input) {
        throw new Error(`Missing run template for service ${service.id}`);
      }

      return mobileRunsApi.createRun(input);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["mobile", "runs"] });
    },
  });

  if (!service) {
    return (
      <View className="page-shell">
        <View className="page-section">
          <View className="hero-card">
            <View className="section-title">当前工作区暂无可启动服务</View>
            <View className="section-copy">切换工作区后再回来，或者回到工坊页选择其他可见服务。</View>
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
            <View className="pill success">{currentWorkspace.type}</View>
          </View>
          <View className="file-row">
            <View>
              <View className="file-name">授权要求</View>
              <View className="file-meta">{service.auth}</View>
            </View>
            <View className="pill">启动后补充资料</View>
          </View>
          <View className="summary-grid">
            <View className="summary-card">
              <View className="summary-label">当前空间</View>
              <View className="summary-value">{currentWorkspace.name}</View>
            </View>
            <View className="summary-card">
              <View className="summary-label">工作目录</View>
              <View className="summary-value mono">{currentWorkspace.root}</View>
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
                } catch {
                  Taro.showToast({ title: "创建实例失败", icon: "none" });
                }
              }}
            >
              {launchRunMutation.isPending ? "启动中" : "立即启动"}
            </Button>
          </View>
        </View>
      </View>

      {detailContent ? (
        <>
          <View className="page-section">
            <View className="file-card">
              <View className="file-name">Creator 与能力挂载</View>
              <View className="file-meta">{detailContent.creator}</View>
              <View className="pill-row">
                {detailContent.connectors.map((item) => (
                  <View className="pill" key={item}>
                    {item}
                  </View>
                ))}
              </View>
            </View>
          </View>

          <View className="page-section">
            <View className="file-card">
              <View className="file-name">结果样例</View>
              <View className="pill-row">
                {detailContent.outputs.map((item) => (
                  <View className="pill active" key={item}>
                    {item}
                  </View>
                ))}
              </View>
            </View>
            <View className="file-card">
              <View className="file-name">授权与风险边界</View>
              <View className="section-copy">{detailContent.risk}</View>
            </View>
          </View>

          <View className="page-section">
            <View className="file-card">
              <View className="file-name">启动后流程</View>
              {detailContent.launchFlow.map((item, index) => (
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
