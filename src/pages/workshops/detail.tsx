import { matchesSearchQuery } from "@lingban/domain-models";
import { Button, Image, Input, View } from "@tarojs/components";
import Taro, { getCurrentInstance } from "@tarojs/taro";
import { useEffect, useMemo, useState } from "react";
import workshopDrama from "../../assets/workshop-drama.svg";
import workshopImage from "../../assets/workshop-image.svg";
import workshopTax from "../../assets/workshop-tax.svg";
import { mobileWorkshopDetailContent } from "../../data/mobileDetailContent";
import {
  findVisibleWorkshop,
  getVisibleServicesForWorkshop,
  getWorkspaceEntry,
} from "../../data/workspaceCatalog";
import { useMobileUiStore } from "../../stores/mobileUiStore";

const workshopCoverMap: Record<string, string> = {
  "enterprise-tax": workshopTax,
  "creator-drama": workshopDrama,
  "brand-content": workshopImage,
};

export default function WorkshopDetailPage() {
  const id = getCurrentInstance().router?.params?.id;
  const [searchQuery, setSearchQuery] = useState("");
  const currentWorkspaceId = useMobileUiStore((state) => state.currentWorkspaceId);
  const currentWorkspace = getWorkspaceEntry(currentWorkspaceId);
  const workshop = useMemo(() => findVisibleWorkshop(id, currentWorkspace.id), [currentWorkspace.id, id]);
  const services = useMemo(
    () => (workshop ? getVisibleServicesForWorkshop(workshop.id, currentWorkspace.id) : []),
    [currentWorkspace.id, workshop]
  );
  const detailContent = workshop ? mobileWorkshopDetailContent[workshop.id] : null;
  const filteredServices = useMemo(() => {
    return services.filter((service) =>
      matchesSearchQuery(searchQuery, [service.name, service.summary, service.auth, service.eta])
    );
  }, [searchQuery, services]);

  useEffect(() => {
    if (!id || !workshop || workshop.id === id) {
      return;
    }

    Taro.redirectTo({ url: `/pages/workshops/detail?id=${workshop.id}` });
  }, [id, workshop]);

  if (!workshop) {
    return (
      <View className="page-shell">
        <View className="hero-card">
          <View className="section-title">当前工作区暂无可见工坊</View>
          <View className="section-copy">切换工作区后再回来，或直接回到工坊首页选择其他入口。</View>
          <Button className="pill active" onClick={() => Taro.switchTab({ url: "/pages/workshops/index" })}>
            返回工坊
          </Button>
        </View>
      </View>
    );
  }

  return (
    <View className="page-shell">
      <View className="crumb-row">
        <Button className="crumb-btn" onClick={() => Taro.navigateBack()}>
          返回工坊
        </Button>
        <Button className="tab-btn active">工坊详情</Button>
      </View>

      <View className="page-section">
        <View className="hero-card">
          <Image className="cover" src={workshopCoverMap[workshop.id]} mode="aspectFill" />
          <View className="section-head" style={{ marginTop: "14px" }}>
            <View>
              <View className="page-eyebrow">当前工坊</View>
              <View className="section-title">{workshop.name}</View>
            </View>
            <View className="pill active">{workshop.badge}</View>
          </View>
          <View className="section-copy">{workshop.description}</View>
          <View className="pill-row">
            <View className="pill">{workshop.owner}</View>
            <View className="pill success">{currentWorkspace.name}</View>
            <View className="pill">{services.length} 个可启服务</View>
            {detailContent?.highlights.map((item) => (
              <View className="pill active" key={item}>
                {item}
              </View>
            ))}
          </View>
          <View className="file-row" style={{ marginTop: "14px" }}>
            <View>
              <View className="file-name">默认工作区目录</View>
              <View className="file-meta mono">{currentWorkspace.root}</View>
            </View>
          </View>
          {detailContent ? (
            <View className="summary-grid">
              <View className="summary-card">
                <View className="summary-label">适用对象</View>
                <View className="summary-value">{detailContent.audience}</View>
              </View>
              <View className="summary-card">
                <View className="summary-label">使用边界</View>
                <View className="summary-value">{detailContent.boundary}</View>
              </View>
            </View>
          ) : null}
        </View>
      </View>

      <View className="page-section">
        <View className="section-head">
          <View>
            <View className="page-eyebrow">服务列表</View>
            <View className="section-title">从当前工坊启动任务</View>
          </View>
          <View className="pill active">{filteredServices.length} 个服务</View>
        </View>
        <View className="search-bar">
          <Input
            className="search-input"
            value={searchQuery}
            placeholder="搜索服务名 / 授权方式 / 结果类型"
            onInput={(event) => setSearchQuery(event.detail.value)}
          />
        </View>
        <View className="service-rack">
          {filteredServices.length === 0 ? (
            <View className="empty-state">
              <View className="section-title">没有匹配服务</View>
              <View className="empty-copy">可按服务名称、授权方式或结果类型搜索。</View>
            </View>
          ) : null}
          {filteredServices.map((service) => (
            <View className="file-card" key={service.id}>
              <View className="card-row">
                <View>
                  <View className="file-name">{service.name}</View>
                  <View className="file-meta">{service.auth}</View>
                </View>
                <View className="pill">{service.eta}</View>
              </View>
              <View className="section-copy">{service.summary}</View>
              <Button
                className="pill active"
                onClick={() => Taro.navigateTo({ url: `/pages/services/detail?id=${service.id}` })}
              >
                打开服务
              </Button>
            </View>
          ))}
        </View>
      </View>

      {detailContent ? (
        <View className="page-section">
          <View className="section-head">
            <View>
              <View className="page-eyebrow">结果与流程</View>
              <View className="section-title">启动前需要理解的内容</View>
            </View>
          </View>
          <View className="file-card">
            <View className="file-name">当前工坊常见结果</View>
            <View className="pill-row">
              {detailContent.outputs.map((item) => (
                <View className="pill" key={item}>
                  {item}
                </View>
              ))}
            </View>
          </View>
          <View className="file-card">
            <View className="file-name">标准启动流程</View>
            {detailContent.flow.map((item, index) => (
              <View className="file-row" key={`${index + 1}-${item}`}>
                <View>
                  <View className="file-name">步骤 {index + 1}</View>
                  <View className="file-meta">{item}</View>
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}
