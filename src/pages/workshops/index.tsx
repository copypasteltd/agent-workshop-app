import type { SearchResourceType, SearchResultRecord } from "@lingban/contracts";
import { matchesSearchQuery } from "@lingban/domain-models";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Image, Input, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useDeferredValue, useMemo, useState } from "react";
import logoMark from "../../assets/logo.svg";
import workshopDrama from "../../assets/workshop-drama.svg";
import workshopImage from "../../assets/workshop-image.svg";
import workshopTax from "../../assets/workshop-tax.svg";
import { mobileMeApi, mobileSearchApi } from "../../lib/api";
import { useResolvedMobileWorkspace } from "../../lib/useMobileWorkspace";
import { useMobileWorkspaceCatalog } from "../../lib/useMobileWorkspaceCatalog";

const workshopCoverMap: Record<string, string> = {
  "enterprise-tax": workshopTax,
  "creator-drama": workshopDrama,
  "brand-poster-suite": workshopImage,
};

type WorkshopSurfaceFilter = "all" | "workshops" | "services" | "tasks";

function getLocalizedText(value: { zh: string; en: string } | null | undefined) {
  return value?.zh?.trim() || value?.en?.trim() || "";
}

function buildMobileSearchTypes(surfaceFilter: WorkshopSurfaceFilter): SearchResourceType[] {
  switch (surfaceFilter) {
    case "workshops":
      return ["workshop"];
    case "services":
      return ["service"];
    case "tasks":
      return ["run"];
    default:
      return ["workshop", "service", "run"];
  }
}

function buildMobileSearchRoute(target: SearchResultRecord["target"]) {
  switch (target.resource) {
    case "workshop":
      return `/pages/workshops/detail?id=${encodeURIComponent(target.workshopId)}`;
    case "service":
      return `/pages/services/detail?id=${encodeURIComponent(target.serviceId)}`;
    case "run":
      return target.view === "files"
        ? `/pages/tasks/files?id=${encodeURIComponent(target.runId)}`
        : `/pages/tasks/detail?id=${encodeURIComponent(target.runId)}`;
    case "package":
      return "/pages/me/index";
  }
}

function buildMobileSearchTypeLabel(resourceType: SearchResultRecord["resourceType"]) {
  switch (resourceType) {
    case "workshop":
      return "工坊";
    case "service":
      return "服务";
    case "run":
      return "任务";
    case "package":
      return "工坊包";
  }
}

export default function WorkshopsPage() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [surfaceFilter, setSurfaceFilter] = useState<WorkshopSurfaceFilter>("all");
  const currentWorkspace = useResolvedMobileWorkspace();
  const favoritesEnabled = currentWorkspace.source === "auth";
  const trimmedSearchQuery = searchQuery.trim();
  const deferredSearchQuery = useDeferredValue(trimmedSearchQuery);
  const searchTypes = useMemo(() => buildMobileSearchTypes(surfaceFilter), [surfaceFilter]);
  const {
    visibleWorkshops,
    visibleServices,
    recentTasks,
    metrics,
    workspaceDataReady,
    workshopsQuery,
    servicesQuery,
  } = useMobileWorkspaceCatalog(currentWorkspace);
  const catalogError = workshopsQuery.error ?? servicesQuery.error;
  const remoteSearchEnabled =
    workspaceDataReady && currentWorkspace.source === "auth" && deferredSearchQuery.length > 0;
  const remoteSearchExperience =
    workspaceDataReady && currentWorkspace.source === "auth" && trimmedSearchQuery.length > 0;

  const favoriteWorkshopsQuery = useQuery({
    queryKey: ["mobile", "me", "favorites", currentWorkspace.selectionId, currentWorkspace.id],
    queryFn: async () => {
      try {
        return await mobileMeApi.listFavoriteWorkshops({
          limit: 50,
        });
      } catch {
        return null;
      }
    },
    enabled: favoritesEnabled,
    retry: false,
    staleTime: 30_000,
  });

  const favoriteMutation = useMutation({
    mutationFn: async (input: { workshopId: string; favorited: boolean }) =>
      mobileMeApi.setFavoriteWorkshop(input.workshopId, {
        favorited: input.favorited,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["mobile", "me", "favorites"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["mobile", "me", "summary"],
        }),
      ]);
    },
    onError: (error) => {
      Taro.showToast({
        title:
          error instanceof Error && error.message
            ? error.message
            : "收藏状态更新失败",
        icon: "none",
      });
    },
  });

  const favoritedWorkshopIds = useMemo(
    () => new Set(favoriteWorkshopsQuery.data?.items.map((item) => item.workshopId) ?? []),
    [favoriteWorkshopsQuery.data]
  );

  const searchResultsQuery = useQuery({
    queryKey: [
      "mobile",
      "search",
      currentWorkspace.selectionId,
      currentWorkspace.id,
      deferredSearchQuery,
      surfaceFilter,
    ],
    queryFn: () =>
      mobileSearchApi.listSearchResults({
        q: deferredSearchQuery,
        types: searchTypes,
        limit: 12,
        entrySurface: "h5",
      }),
    enabled: remoteSearchEnabled,
    retry: false,
    staleTime: 15_000,
  });

  const searchSuggestionsQuery = useQuery({
    queryKey: [
      "mobile",
      "search",
      "suggestions",
      currentWorkspace.selectionId,
      currentWorkspace.id,
      deferredSearchQuery,
      surfaceFilter,
    ],
    queryFn: () =>
      mobileSearchApi.listSearchSuggestions({
        q: deferredSearchQuery,
        types: searchTypes,
        limit: 6,
        entrySurface: "h5",
      }),
    enabled: remoteSearchEnabled,
    retry: false,
    staleTime: 15_000,
  });
  const searchHistoryQuery = useQuery({
    queryKey: [
      "mobile",
      "search",
      "history",
      currentWorkspace.selectionId,
      currentWorkspace.id,
    ],
    queryFn: () =>
      mobileSearchApi.listSearchHistory({
        limit: 6,
      }),
    enabled: currentWorkspace.source === "auth",
    retry: false,
    staleTime: 15_000,
  });
  const recordSearchClickMutation = useMutation({
    mutationFn: async (input: { query: string; documentId: string }) =>
      mobileSearchApi.recordSearchClick({
        query: input.query,
        documentId: input.documentId,
        entrySurface: "h5",
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["mobile", "search"],
      });
    },
  });

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

  const workshopById = useMemo(
    () => new Map(visibleWorkshops.map((item) => [item.id, item])),
    [visibleWorkshops]
  );

  const serviceById = useMemo(
    () => new Map(visibleServices.map((item) => [item.id, item])),
    [visibleServices]
  );

  const recentTaskById = useMemo(
    () => new Map(recentTasks.map((item) => [item.id, item])),
    [recentTasks]
  );

  const remoteSearchResults = searchResultsQuery.data?.items ?? [];
  const remoteWorkshopResults = useMemo(
    () => remoteSearchResults.filter((item) => item.resourceType === "workshop"),
    [remoteSearchResults]
  );
  const remoteServiceResults = useMemo(
    () => remoteSearchResults.filter((item) => item.resourceType === "service"),
    [remoteSearchResults]
  );
  const remoteTaskResults = useMemo(
    () => remoteSearchResults.filter((item) => item.resourceType === "run"),
    [remoteSearchResults]
  );
  const searchHistoryItems = searchHistoryQuery.data?.items ?? [];
  const remoteSuggestions = searchSuggestionsQuery.data?.items ?? [];
  const usingRemoteSearchResults = remoteSearchExperience && searchResultsQuery.isSuccess;

  function handleRemoteSearchOpen(item: SearchResultRecord) {
    recordSearchClickMutation
      .mutateAsync({
        query: trimmedSearchQuery,
        documentId: item.documentId,
      })
      .catch(() => undefined);
    Taro.navigateTo({ url: buildMobileSearchRoute(item.target) });
  }

  const showWorkshops = surfaceFilter === "all" || surfaceFilter === "workshops";
  const showServices = surfaceFilter === "all" || surfaceFilter === "services";
  const showTasks = surfaceFilter === "all" || surfaceFilter === "tasks";
  const toolbarSummary = !workspaceDataReady
    ? "Waiting for the current workspace context before loading the workshop catalog."
    : remoteSearchExperience
    ? searchResultsQuery.isLoading && !searchResultsQuery.data
      ? "正在查询当前工作区内的工坊、服务与任务。"
      : searchResultsQuery.error
        ? "统一搜索暂时不可用，当前回退为页面内本地过滤。"
        : `统一搜索返回 ${searchResultsQuery.data?.totalCount ?? 0} 条结果，当前展示前 ${
            remoteSearchResults.length
          } 条。`
    : trimmedSearchQuery.length > 0
      ? "当前为本地预览搜索，仅过滤本页已加载内容。"
      : `当前工作区：${currentWorkspace.name} / 默认目录 ${currentWorkspace.root} / 命中 ${filteredWorkshops.length} 个工坊，${filteredServices.length} 个服务，${filteredRecentTasks.length} 个任务`;

  return (
    <View className="page-shell">
      <View className="page" data-page="workshops" data-testid="mobile-workshops-page">
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
              <View className="page-eyebrow">最近任务</View>
              <View className="mini-value">{metrics.tasks}</View>
            </View>
            <View className="mini-card">
              <View className="page-eyebrow">已收藏</View>
              <View className="mini-value">
                {favoriteWorkshopsQuery.data?.totalCount ?? 0}
              </View>
            </View>
          </View>
        </View>

        <View className="search-bar">
          <Input
            className="search-input"
            value={searchQuery}
            placeholder="搜索工坊、服务、任务"
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
            <View className="muted">{toolbarSummary}</View>
            <View className="pill-row">
              <Button
                className="pill"
                data-testid="mobile-workshops-to-me"
                onClick={() => Taro.switchTab({ url: "/pages/me/index" })}
              >
                去我的
              </Button>
              <View className="pill">实例启动后由 Codex 继续追问信息</View>
            </View>
          </View>
        </View>

        {!workspaceDataReady ? (
          <View className="page-section">
            <View className="empty-state">
              <View className="section-title">Waiting for workspace context</View>
              <View className="empty-copy">
                The workshop shelf stays paused until the app restores an authoritative workspace
                context from the backend session.
              </View>
            </View>
          </View>
        ) : null}

        {!trimmedSearchQuery && searchHistoryItems.length > 0 ? (
          <View className="page-section">
            <View className="section-head">
              <View>
                <View className="page-eyebrow">最近搜索</View>
                <View className="section-title">复用你最近用过的查询</View>
              </View>
            </View>
            <View className="search-suggestion-row">
              {searchHistoryItems.map((item) => (
                <Button
                  className="search-suggestion-chip"
                  key={item.historyId}
                  onClick={() => setSearchQuery(item.query)}
                >
                  {item.query}
                </Button>
              ))}
            </View>
          </View>
        ) : null}

        {remoteSearchExperience ? (
          <View className="page-section">
            <View className="section-head">
              <View>
                <View className="page-eyebrow">统一搜索</View>
                <View className="section-title">当前空间搜索结果</View>
                <View className="section-copy">
                  命中结果来自同一套 `/v1/search` 聚合接口，打开后继续进入真实对话或启动页。
                </View>
              </View>
              <View className="pill active">{searchTypes.length} 类资源</View>
            </View>
            {remoteSuggestions.length > 0 ? (
              <View className="search-suggestion-row">
                {remoteSuggestions.map((item) => (
                  <Button
                    className="search-suggestion-chip"
                    key={item.suggestionId}
                    onClick={() => setSearchQuery(getLocalizedText(item.text))}
                  >
                    {getLocalizedText(item.text)}
                  </Button>
                ))}
              </View>
            ) : null}
            {searchResultsQuery.isLoading && !searchResultsQuery.data ? (
              <View className="empty-state">
                <View className="section-title">正在查询统一搜索</View>
                <View className="empty-copy">
                  正在合并当前工作区可见的工坊、服务与任务结果。
                </View>
              </View>
            ) : null}
            {searchResultsQuery.error ? (
              <View className="empty-state">
                <View className="section-title">统一搜索暂时不可用</View>
                <View className="empty-copy">
                  {searchResultsQuery.error.message}
                </View>
              </View>
            ) : null}
          </View>
        ) : null}

        {catalogError ? (
          <View className="page-section">
            <View className="empty-state">
              <View className="section-title">工坊目录暂时不可用</View>
              <View className="empty-copy">{catalogError.message}</View>
            </View>
          </View>
        ) : null}

        {showWorkshops ? (
          <View className="page-section">
            <View className="section-head">
              <View>
                <View className="page-eyebrow">工坊货架</View>
                <View className="section-title">
                  {usingRemoteSearchResults ? "搜索命中的工坊" : "当前空间可见工坊"}
                </View>
              </View>
              <View className="pill active">
                {usingRemoteSearchResults ? remoteWorkshopResults.length : filteredWorkshops.length} 个工坊
              </View>
            </View>
            <View className="workshop-rack">
              {(usingRemoteSearchResults ? remoteWorkshopResults.length : filteredWorkshops.length) === 0 ? (
                <View className="empty-state">
                  <View className="section-title">
                    {usingRemoteSearchResults ? "统一搜索未命中工坊" : "没有匹配工坊"}
                  </View>
                  <View className="empty-copy">
                    {usingRemoteSearchResults
                      ? "可以继续改写搜索词，或者切换到服务、任务筛选。"
                      : "调整搜索词后再试，当前不会跨工作区返回结果。"}
                  </View>
                </View>
              ) : null}
              {usingRemoteSearchResults
                ? remoteWorkshopResults.map((item) => {
                    const workshop = workshopById.get(item.resourceId);
                    const workshopId =
                      item.target.resource === "workshop"
                        ? item.target.workshopId
                        : item.resourceId;

                    return (
                      <View
                        className="workshop-card"
                        key={item.documentId}
                        onClick={() => handleRemoteSearchOpen(item)}
                      >
                        <Image
                          className="cover"
                          src={workshopCoverMap[workshopId] ?? workshopImage}
                          mode="aspectFill"
                        />
                        <View className="workshop-body">
                          <View className="card-row">
                            <View className="pill-row">
                              <View className="pill active">
                                {workshop?.badge || getLocalizedText(item.badge) || "工坊"}
                              </View>
                              <View className="pill">
                                {workshop?.owner || getLocalizedText(item.subtitle) || "统一搜索"}
                              </View>
                              {item.recent ? <View className="pill success">最近</View> : null}
                              {item.favorited ? <View className="pill warn">已收藏</View> : null}
                            </View>
                          </View>
                          <View className="workshop-title">
                            {workshop?.name || getLocalizedText(item.title)}
                          </View>
                          <View className="section-copy">
                            {workshop?.description || getLocalizedText(item.summary)}
                          </View>
                          <View className="pill-row" style={{ marginTop: "10px" }}>
                            <View className="pill active">进入工坊</View>
                            <View className={`pill ${item.tone}`}>
                              {buildMobileSearchTypeLabel(item.resourceType)}
                            </View>
                          </View>
                        </View>
                      </View>
                    );
                  })
                : filteredWorkshops.map((item) => (
                    <View
                      className="workshop-card"
                      key={item.id}
                      onClick={() =>
                        Taro.navigateTo({ url: `/pages/workshops/detail?id=${item.id}` })
                      }
                    >
                      <Image className="cover" src={workshopCoverMap[item.id]} mode="aspectFill" />
                      <View className="workshop-body">
                        <View className="card-row">
                          <View className="pill-row">
                            <View className="pill active">{item.badge}</View>
                            <View className="pill">{item.owner}</View>
                          </View>
                          {favoritesEnabled ? (
                            <Button
                              className={`pill ${
                                favoritedWorkshopIds.has(item.id) ? "active" : ""
                              }`}
                              disabled={
                                favoriteMutation.isPending &&
                                favoriteMutation.variables?.workshopId === item.id
                              }
                              onClick={(event) => {
                                event.stopPropagation();
                                favoriteMutation.mutate({
                                  workshopId: item.id,
                                  favorited: !favoritedWorkshopIds.has(item.id),
                                });
                              }}
                            >
                              {favoritedWorkshopIds.has(item.id) ? "已收藏" : "收藏"}
                            </Button>
                          ) : null}
                        </View>
                        <View className="workshop-title">{item.name}</View>
                        <View className="section-copy">{item.description}</View>
                        <View className="pill-row" style={{ marginTop: "10px" }}>
                          <View className="pill active">进入工坊</View>
                        </View>
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
                <View className="section-title">
                  {usingRemoteSearchResults ? "搜索命中的服务" : "看到即可启动"}
                </View>
                <View className="section-copy">
                  {usingRemoteSearchResults
                    ? "结果来自统一搜索，打开后仍然进入真实服务启动与对话链路。"
                    : "启动后直接进入任务对话，由 Codex 在消息流里继续补齐所需信息。"}
                </View>
              </View>
            </View>
            <View className="service-rack">
              {(usingRemoteSearchResults ? remoteServiceResults.length : filteredServices.length) === 0 ? (
                <View className="empty-state">
                  <View className="section-title">
                    {usingRemoteSearchResults ? "统一搜索未命中服务" : "没有匹配服务"}
                  </View>
                  <View className="empty-copy">
                    {usingRemoteSearchResults
                      ? "可以尝试服务名称、结果类型或工坊名。"
                      : "可以搜索授权方式、结果类型或服务名称。"}
                  </View>
                </View>
              ) : null}
              {usingRemoteSearchResults
                ? remoteServiceResults.map((item) => {
                    const service = serviceById.get(item.resourceId);

                    return (
                      <View className="file-card" key={item.documentId}>
                        <View className="card-row">
                          <View>
                            <View className="file-name">
                              {service?.name || getLocalizedText(item.title)}
                            </View>
                            <View className="file-meta">
                              {service?.auth || getLocalizedText(item.subtitle) || "统一搜索结果"}
                            </View>
                          </View>
                          <View className={`pill ${item.tone}`}>
                            {service?.eta || getLocalizedText(item.badge) || "服务"}
                          </View>
                        </View>
                        <View className="section-copy">
                          {service?.summary || getLocalizedText(item.summary)}
                        </View>
                        <View className="pill-row">
                          {item.recent ? <View className="pill success">最近</View> : null}
                          {item.favorited ? <View className="pill warn">已收藏工坊</View> : null}
                          <View className="pill">{buildMobileSearchTypeLabel(item.resourceType)}</View>
                        </View>
                        <Button
                          className="pill active"
                          onClick={() => handleRemoteSearchOpen(item)}
                        >
                          启动
                        </Button>
                      </View>
                    );
                  })
                : filteredServices.map((item) => (
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
                        data-testid={`mobile-service-open-${item.id}`}
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
                <View className="section-title">
                  {usingRemoteSearchResults ? "搜索命中的任务" : "继续处理中的任务"}
                </View>
              </View>
              <Button
                className="pill active"
                data-testid="mobile-workshops-to-tasks"
                onClick={() => Taro.switchTab({ url: "/pages/tasks/index" })}
              >
                任务中心
              </Button>
            </View>
            <View className="resume-rack">
              {(usingRemoteSearchResults ? remoteTaskResults.length : filteredRecentTasks.length) === 0 ? (
                <View className="empty-state">
                  <View className="section-title">
                    {usingRemoteSearchResults ? "统一搜索未命中任务" : "没有匹配任务"}
                  </View>
                  <View className="empty-copy">
                    {usingRemoteSearchResults
                      ? "可以改搜任务标题、工坊名、路径或标签。"
                      : "可以改搜任务标题、工坊名或标签。"}
                  </View>
                </View>
              ) : null}
              {usingRemoteSearchResults
                ? remoteTaskResults.map((item) => {
                    const task = recentTaskById.get(item.resourceId);

                    return (
                      <View className="task-card" key={item.documentId}>
                        <View className="card-row">
                          <View>
                            <View className="task-title">
                              {task?.title || getLocalizedText(item.title)}
                            </View>
                            <View className="task-meta">
                              {task
                                ? `工坊：${task.workshop} / ${task.updatedAt}`
                                : getLocalizedText(item.subtitle) || item.updatedAt || "统一搜索结果"}
                            </View>
                          </View>
                          <View className={`pill ${task?.statusClass || item.tone}`}>
                            {task?.statusLabel || getLocalizedText(item.badge) || "任务"}
                          </View>
                        </View>
                        <View className="muted">{task?.summary || getLocalizedText(item.summary)}</View>
                        <View className="pill-row">
                          {item.recent ? <View className="pill success">最近</View> : null}
                          {item.favorited ? <View className="pill warn">来自收藏工坊</View> : null}
                          <View className="pill">{buildMobileSearchTypeLabel(item.resourceType)}</View>
                        </View>
                        <Button
                          className="pill active"
                          data-testid={`mobile-workshops-open-task-${item.resourceId}`}
                          onClick={() => handleRemoteSearchOpen(item)}
                        >
                          {item.target.resource === "run" && item.target.view === "files"
                            ? "打开文件"
                            : "打开实例"}
                        </Button>
                      </View>
                    );
                  })
                : filteredRecentTasks.map((item) => (
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
                        data-testid={`mobile-workshops-open-task-${item.id}`}
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
