import { useQuery } from "@tanstack/react-query";
import { Button, Image, View } from "@tarojs/components";
import { useMemo } from "react";
import logoMark from "../../assets/logo.svg";
import { workspaceEntries } from "../../data/mobileData";
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

export default function MePage() {
  const theme = useMobileUiStore((state) => state.theme);
  const currentWorkspaceId = useMobileUiStore((state) => state.currentWorkspaceId);
  const workspaceSheetOpen = useMobileUiStore((state) => state.workspaceSheetOpen);
  const toggleTheme = useMobileUiStore((state) => state.toggleTheme);
  const setCurrentWorkspaceId = useMobileUiStore((state) => state.setCurrentWorkspaceId);
  const setWorkspaceSheetOpen = useMobileUiStore((state) => state.setWorkspaceSheetOpen);
  const currentWorkspace = getWorkspaceEntry(currentWorkspaceId);
  const metrics = getWorkspaceMetrics(currentWorkspace.id);
  const visibleWorkshops = getVisibleWorkshops(currentWorkspace.id);
  const visibleServices = getVisibleServices(currentWorkspace.id);
  const staticTasks = getVisibleTasks(currentWorkspace.id);

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

  const staticIds = new Set(staticTasks.map((item) => item.id));
  const combinedTasks = [...liveTasks.filter((item) => !staticIds.has(item.id)), ...staticTasks];

  const assetEntries = useMemo(() => {
    const entries = combinedTasks.flatMap((task) =>
      task.files.map((file) => ({
        key: `${task.id}:${file.path}`,
        title: file.name,
        meta: `${task.title} / ${file.helper}`,
      }))
    );

    return entries.slice(0, 4);
  }, [combinedTasks]);

  const authEntries = useMemo(() => {
    const entries: Array<{ name: string; detail: string; status: string }> = [];

    if (visibleServices.some((item) => item.id === "tax-filing")) {
      entries.push({
        name: "企业邮箱 OTP",
        detail: "浏览器敏感动作会先回到当前任务对话请求确认。",
        status: "已连接",
      });
      entries.push({
        name: "财务共享目录",
        detail: "目录以只读方式挂载到实例，不在移动端暴露原始文件内容。",
        status: "只读",
      });
    }

    if (visibleServices.some((item) => item.id === "drama-storyboard")) {
      entries.push({
        name: "Seedance API",
        detail: "导演意见和外部素材继续通过当前任务对话回流。",
        status: "可用",
      });
    }

    if (visibleServices.some((item) => item.id === "poster-batch")) {
      entries.push({
        name: "Image Gen Key",
        detail: "图像额度按工作区或账户绑定，实例中以只读方式注入。",
        status: "可用",
      });
    }

    return entries.slice(0, 4);
  }, [visibleServices]);

  const noticeEntries = useMemo(() => {
    const approvalCount = combinedTasks.filter((item) => item.status === "approval").length;
    const runningCount = combinedTasks.filter((item) => item.status === "running").length;
    const doneCount = combinedTasks.filter((item) => item.status === "done").length;
    const entries: Array<{ title: string; detail: string }> = [];

    if (approvalCount > 0) {
      entries.push({
        title: `有 ${approvalCount} 个任务待确认`,
        detail: "处理动作会继续回到对应任务对话里执行，不会重新初始化实例。",
      });
    }

    if (runningCount > 0) {
      entries.push({
        title: `有 ${runningCount} 个任务继续运行中`,
        detail: "可以直接回到任务页追问进度、补充材料或继续给 Codex 下指令。",
      });
    }

    if (doneCount > 0) {
      entries.push({
        title: `最近完成 ${doneCount} 个任务`,
        detail: "结果文件和回执已经同步沉淀到任务目录与我的资产入口。",
      });
    }

    return entries.slice(0, 3);
  }, [combinedTasks]);

  const profileStats = useMemo(() => {
    const totalFiles = combinedTasks.reduce((sum, task) => sum + task.files.length, 0);
    const resultFiles = combinedTasks.reduce(
      (sum, task) => sum + task.files.filter((file) => file.status === "结果" || file.status === "完成").length,
      0
    );
    const pendingActions = combinedTasks.filter((item) => item.status === "running" || item.status === "approval").length;

    return {
      files: totalFiles,
      receipts: resultFiles,
      workshops: visibleWorkshops.length,
      pending: pendingActions,
    };
  }, [combinedTasks, visibleWorkshops.length]);

  return (
    <View className="page-shell">
      <View className="page" data-page="profile">
        <View className="hero-card profile-hero">
          <View className="card-row">
            <View className="brand-row">
              <View className="brand-mark">
                <Image src={logoMark} mode="aspectFill" />
              </View>
              <View>
                <View className="section-title">当前账号</View>
                <View className="profile-note">
                  {currentWorkspace.name} / {currentWorkspace.type} / {combinedTasks.length} 个可继续任务
                </View>
              </View>
            </View>
            <View className="pill-row">
              <View className="pill success">已连接</View>
              <Button className="pill" onClick={toggleTheme}>
                {theme === "dark" ? "深色" : "浅色"}
              </Button>
            </View>
          </View>
          <View className="section-copy">
            这里长期沉淀结果文件、回执、收藏工坊和账户授权。任务运行中断后，也可以从这里直接回到对应任务或文件页。
          </View>
          <View className="profile-grid">
            <View className="mini-card">
              <View className="page-eyebrow">文件</View>
              <View className="mini-value">{profileStats.files}</View>
            </View>
            <View className="mini-card">
              <View className="page-eyebrow">回执</View>
              <View className="mini-value">{profileStats.receipts}</View>
            </View>
            <View className="mini-card">
              <View className="page-eyebrow">收藏工坊</View>
              <View className="mini-value">{profileStats.workshops}</View>
            </View>
            <View className="mini-card">
              <View className="page-eyebrow">待处理</View>
              <View className="mini-value">{profileStats.pending}</View>
            </View>
          </View>
        </View>

        <View className="page-section">
          <View className="section-head">
            <View>
              <View className="page-eyebrow">工作区</View>
              <View className="section-title">当前工作区</View>
            </View>
            <Button className="pill active" onClick={() => setWorkspaceSheetOpen(true)}>
              切换工作区
            </Button>
          </View>
          <View className="profile-card workspace-current-card">
            <View className="card-row">
              <View>
                <View className="file-name">{currentWorkspace.name}</View>
                <View className="profile-note">{currentWorkspace.meta}</View>
              </View>
              <View className="pill success">{currentWorkspace.type}</View>
            </View>
            <View className="entry-metrics">
              <View className="metric-box">
                <View className="page-eyebrow">角色</View>
                <View className="mini-value">{currentWorkspace.meta.split(" / ")[0]}</View>
              </View>
              <View className="metric-box">
                <View className="page-eyebrow">可见工坊</View>
                <View className="mini-value">{metrics.workshops}</View>
              </View>
              <View className="metric-box">
                <View className="page-eyebrow">可见任务</View>
                <View className="mini-value">{metrics.tasks}</View>
              </View>
            </View>
            <View className="file-row">
              <View>
                <View className="file-name">默认目录</View>
                <View className="file-meta mono">{currentWorkspace.root}</View>
              </View>
              <Button className="pill active" onClick={() => setWorkspaceSheetOpen(true)}>
                选择
              </Button>
            </View>
          </View>
        </View>

        <View className="page-section">
          <View className="section-head">
            <View>
              <View className="page-eyebrow">我的资产</View>
              <View className="section-title">结果与下载</View>
            </View>
            <View className="pill active">{assetEntries.length} 项最近资产</View>
          </View>
          <View className="asset-rack">
            {assetEntries.map((item) => (
              <View className="file-card" key={item.key}>
                <View className="file-name">{item.title}</View>
                <View className="file-meta">{item.meta}</View>
              </View>
            ))}
          </View>
        </View>

        <View className="page-section">
          <View className="section-head">
            <View>
              <View className="page-eyebrow">授权中心</View>
              <View className="section-title">连接与凭证</View>
            </View>
            <View className="pill">{visibleServices.length} 项能力可见</View>
          </View>
          <View className="auth-rack">
            {authEntries.map((item) => (
              <View className="file-card" key={item.name}>
                <View className="card-row">
                  <View>
                    <View className="file-name">{item.name}</View>
                    <View className="file-meta">{item.detail}</View>
                  </View>
                  <View className="pill active">{item.status}</View>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View className="page-section">
          <View className="section-head">
            <View>
              <View className="page-eyebrow">通知与待办</View>
              <View className="section-title">需要你处理的动作</View>
            </View>
            <View className="pill warn">{noticeEntries.length} 条联动提醒</View>
          </View>
          <View className="notice-rack">
            {noticeEntries.map((item) => (
              <View className="file-card" key={item.title}>
                <View className="file-name">{item.title}</View>
                <View className="file-meta">{item.detail}</View>
              </View>
            ))}
          </View>
        </View>
      </View>

      {workspaceSheetOpen ? (
        <>
          <View className="sheet-backdrop is-open" onClick={() => setWorkspaceSheetOpen(false)} />
          <View className="workspace-sheet is-open">
            <View className="sheet-handle" />
            <View className="card-row">
              <View>
                <View className="page-eyebrow">工作区切换</View>
                <View className="section-title">选择当前工作区</View>
              </View>
              <Button className="pill" onClick={() => setWorkspaceSheetOpen(false)}>
                关闭
              </Button>
            </View>
            <View className="workspace-option-list">
              {workspaceEntries.map((item) => (
                <Button
                  className={`workspace-option ${item.id === currentWorkspaceId ? "active" : ""}`}
                  key={item.id}
                  onClick={() => {
                    setCurrentWorkspaceId(item.id);
                    setWorkspaceSheetOpen(false);
                  }}
                >
                  <View className="workspace-option-top">
                    <View>
                      <View className="workspace-option-title">{item.name}</View>
                      <View className="workspace-option-meta">{item.meta}</View>
                    </View>
                    <View className={`pill ${item.id === currentWorkspaceId ? "active" : ""}`}>
                      {item.type}
                    </View>
                  </View>
                  <View className="workspace-option-note mono">{item.root}</View>
                  <View className="pill-row">
                    <View className="pill">工坊 {item.workshops}</View>
                    <View className="pill">任务 {item.tasks}</View>
                  </View>
                </Button>
              ))}
            </View>
          </View>
        </>
      ) : null}
    </View>
  );
}
