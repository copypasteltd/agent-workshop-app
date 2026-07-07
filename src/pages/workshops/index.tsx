import { matchesSearchQuery } from "@lingban/domain-models";
import { useQuery } from "@tanstack/react-query";
import { Button, Image, Input, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useMemo, useState } from "react";
import logoMark from "../../assets/logo.svg";
import workshopDrama from "../../assets/workshop-drama.svg";
import workshopImage from "../../assets/workshop-image.svg";
import workshopTax from "../../assets/workshop-tax.svg";
import {
  getVisibleServices,
  getVisibleTasks,
  getVisibleWorkshops,
  getWorkspaceEntry,
  getWorkspaceMetrics,
  normalizeMobileWorkspaceId,
} from "../../data/workspaceCatalog";
import { mobileRunsApi } from "../../lib/api";
import { mapRunSnapshotToMobileTask } from "../../lib/liveTaskAdapters";
import { useMobileUiStore } from "../../stores/mobileUiStore";

const workshopCoverMap: Record<string, string> = {
  "enterprise-tax": workshopTax,
  "creator-drama": workshopDrama,
  "brand-content": workshopImage,
};

export default function WorkshopsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [surfaceFilter, setSurfaceFilter] = useState<"all" | "workshops" | "services" | "tasks">(
    "all"
  );
  const currentWorkspaceId = useMobileUiStore((state) => state.currentWorkspaceId);
  const currentWorkspace = getWorkspaceEntry(currentWorkspaceId);
  const metrics = getWorkspaceMetrics(currentWorkspace.id);
  const visibleWorkshops = getVisibleWorkshops(currentWorkspace.id);
  const visibleServices = getVisibleServices(currentWorkspace.id);
  const visibleStaticTasks = getVisibleTasks(currentWorkspace.id);

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

  const staticIds = new Set(visibleStaticTasks.map((item) => item.id));
  const recentTasks = [...liveTasks.filter((item) => !staticIds.has(item.id)), ...visibleStaticTasks].slice(0, 3);

  const filteredWorkshops = useMemo(
    () =>
      visibleWorkshops.filter((item) =>
        matchesSearchQuery(searchQuery, [item.name, item.owner, item.description, item.badge])
      ),
    [searchQuery, visibleWorkshops]
  );

  const filteredServices = useMemo(
    () =>
      visibleServices.filter((item) =>
        matchesSearchQuery(searchQuery, [item.name, item.summary, item.auth, item.eta])
      ),
    [searchQuery, visibleServices]
  );

  const filteredRecentTasks = useMemo(
    () =>
      recentTasks.filter((item) =>
        matchesSearchQuery(searchQuery, [
          item.id,
          item.title,
          item.workshop,
          item.summary,
          item.statusLabel,
          item.targetPath,
          ...item.tags,
        ])
      ),
    [recentTasks, searchQuery]
  );

  const showWorkshops = surfaceFilter === "all" || surfaceFilter === "workshops";
  const showServices = surfaceFilter === "all" || surfaceFilter === "services";
  const showTasks = surfaceFilter === "all" || surfaceFilter === "tasks";

  return (
    <View className="page-shell">
      <View className="page" data-page="workshops">
        <View className="hero-card">
          <View className="section-head">
            <View className="brand-row">
              <View className="brand-mark">
                <Image src={logoMark} mode="aspectFill" />
              </View>
              <View>
                <View className="page-eyebrow">灵办词元 / 当前空间</View>
                <View className="section-title">{currentWorkspace.name}</View>
              </View>
            </View>
            <View className="pill success">{currentWorkspace.meta}</View>
          </View>
          <View className="profile-grid">
            <View className="mini-card">
              <View className="page-eyebrow">可见工坊</View>
              <View className="mini-value">{metrics.workshops}</View>
            </View>
            <View className="mini-card">
              <View className="page-eyebrow">可启服务</View>
              <View className="mini-value">{metrics.services}</View>
            </View>
            <View className="mini-card">
              <View className="page-eyebrow">可见任务</View>
              <View className="mini-value">{metrics.tasks}</View>
            </View>
          </View>
        </View>

        <View className="search-bar">
          <Input
            className="search-input"
            value={searchQuery}
            placeholder="搜索工坊、服务、标签"
            onInput={(event) => setSearchQuery(event.detail.value)}
          />
        </View>

        <View className="workshop-toolbar">
          <View className="pill-row">
            {[
              { key: "all" as const, label: "全部" },
              { key: "workshops" as const, label: "工坊" },
              { key: "services" as const, label: "服务" },
              { key: "tasks" as const, label: "最近任务" },
            ].map((item) => (
              <Button
                className={`task-chip ${surfaceFilter === item.key ? "active" : ""}`}
                key={item.key}
                onClick={() => setSurfaceFilter(item.key)}
              >
                {item.label}
              </Button>
            ))}
            <View className="task-chip">{currentWorkspace.type}</View>
          </View>
          <View className="card-row">
            <View className="muted">
              当前工作区：{currentWorkspace.name} / 默认目录 {currentWorkspace.root} / 命中
              {" "}
              {filteredWorkshops.length}
              {" "}
              个工坊，
              {" "}
              {filteredServices.length}
              {" "}
              个服务，
              {" "}
              {filteredRecentTasks.length}
              {" "}
              个任务
            </View>
            <View className="pill-row">
              <Button className="pill" onClick={() => Taro.switchTab({ url: "/pages/me/index" })}>
                去我的
              </Button>
              <View className="pill">启动后由 Codex 继续收集信息</View>
            </View>
          </View>
        </View>

        {showWorkshops ? (
          <View className="page-section">
          <View className="section-head">
            <View>
              <View className="page-eyebrow">工坊货架</View>
              <View className="section-title">当前空间可见工坊</View>
            </View>
            <View className="pill active">{filteredWorkshops.length} 个工坊</View>
          </View>
          <View className="workshop-rack">
            {filteredWorkshops.length === 0 ? (
              <View className="empty-state">
                <View className="section-title">没有匹配工坊</View>
                <View className="empty-copy">调整搜索词后再试，当前不会跨工作区返回结果。</View>
              </View>
            ) : null}
            {filteredWorkshops.map((item) => (
              <View
                className="workshop-card"
                key={item.id}
                onClick={() => Taro.navigateTo({ url: `/pages/workshops/detail?id=${item.id}` })}
              >
                <Image className="cover" src={workshopCoverMap[item.id]} mode="aspectFill" />
                <View className="pill-row">
                  <View className="pill active">{item.badge}</View>
                  <View className="pill">{item.owner}</View>
                </View>
                <View className="workshop-title">{item.name}</View>
                <View className="section-copy">{item.description}</View>
                <View className="pill-row" style={{ marginTop: "10px" }}>
                  <View className="pill active">进入工坊</View>
                </View>
              </View>
            ))}
          </View>
          </View>
        ) : null}

        {showServices ? (
          <View className="page-section">
          <View className="section-head">
            <View>
              <View className="page-eyebrow">即开服务</View>
              <View className="section-title">看到即可启动</View>
              <View className="section-copy">
                启动后直接进入任务对话，由 Codex 在消息流里继续补齐所需信息。
              </View>
            </View>
          </View>
          <View className="service-rack">
            {filteredServices.length === 0 ? (
              <View className="empty-state">
                <View className="section-title">没有匹配服务</View>
                <View className="empty-copy">可以搜索授权方式、结果类型或服务名称。</View>
              </View>
            ) : null}
            {filteredServices.map((item) => (
              <View className="file-card" key={item.id}>
                <View className="card-row">
                  <View>
                    <View className="file-name">{item.name}</View>
                    <View className="file-meta">{item.auth}</View>
                  </View>
                  <View className="pill">{item.eta}</View>
                </View>
                <View className="section-copy">{item.summary}</View>
                <Button
                  className="pill active"
                  onClick={() => Taro.navigateTo({ url: `/pages/services/detail?id=${item.id}` })}
                >
                  启动
                </Button>
              </View>
            ))}
          </View>
          </View>
        ) : null}

        {showTasks ? (
          <View className="page-section">
          <View className="section-head">
            <View>
              <View className="page-eyebrow">最近使用</View>
              <View className="section-title">继续处理中的任务</View>
            </View>
            <Button className="pill active" onClick={() => Taro.switchTab({ url: "/pages/tasks/index" })}>
              任务中心
            </Button>
          </View>
          <View className="resume-rack">
            {filteredRecentTasks.length === 0 ? (
              <View className="empty-state">
                <View className="section-title">没有匹配任务</View>
                <View className="empty-copy">可以改搜任务标题、工坊名或标签。</View>
              </View>
            ) : null}
            {filteredRecentTasks.map((item) => (
              <View className="task-card" key={item.id}>
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
                <Button
                  className="pill active"
                  onClick={() => Taro.navigateTo({ url: `/pages/tasks/detail?id=${item.id}` })}
                >
                  打开实例
                </Button>
              </View>
            ))}
          </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}
