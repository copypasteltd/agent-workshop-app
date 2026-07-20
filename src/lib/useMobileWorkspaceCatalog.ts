import { useMemo } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import type { MobileService, MobileTask, MobileWorkshop } from "../data/mobileData";
import { mobileCatalogApi, mobileMeApi, mobileRunsApi } from "./api";
import {
  mapServiceCatalogEntryToMobileService,
  mapWorkshopCatalogEntryToMobileWorkshop,
  resolveMobileEntrySurface,
} from "./catalog";
import { mapRunSnapshotToMobileTask } from "./liveTaskAdapters";
import { useMobileQuery as useQuery } from "./useMobileQuery";
import {
  hasAuthoritativeMobileWorkspaceContext,
  type MobileWorkspaceView,
} from "./workspaceContext";

type MobileWorkspaceCatalogResult = {
  entrySurface: ReturnType<typeof resolveMobileEntrySurface>;
  visibleWorkshops: MobileWorkshop[];
  visibleServices: MobileService[];
  liveTasks: MobileTask[];
  combinedTasks: MobileTask[];
  recentTasks: MobileTask[];
  availableTaskTags: string[];
  taskDataMode: "waiting" | "live" | "empty";
  workspaceDataReady: boolean;
  metrics: {
    workshops: number;
    services: number;
    tasks: number;
  };
  workshopsQuery: UseQueryResult<MobileWorkshop[], Error>;
  servicesQuery: UseQueryResult<MobileService[], Error>;
  runsQuery: UseQueryResult<Awaited<ReturnType<typeof mobileRunsApi.listRuns>>, Error>;
  runsSummaryQuery: UseQueryResult<
    Awaited<ReturnType<typeof mobileRunsApi.getRunsSummary>> | null,
    Error
  >;
};

export function useMobileWorkspaceCatalog(
  currentWorkspace: MobileWorkspaceView
): MobileWorkspaceCatalogResult {
  const entrySurface = resolveMobileEntrySurface();
  const workspaceDataReady = hasAuthoritativeMobileWorkspaceContext(currentWorkspace);
  const workshopsQuery = useQuery({
    queryKey: [
      "mobile",
      "catalog",
      "workshops",
      currentWorkspace.selectionId,
      currentWorkspace.id,
      entrySurface,
    ],
    queryFn: async () =>
      mobileCatalogApi.listWorkshops({
        workspaceContextKey: currentWorkspace.id,
        workspaceId: currentWorkspace.runtimeWorkspaceId,
        entrySurface,
      }),
    enabled: workspaceDataReady,
    retry: false,
    staleTime: 30_000,
    select: (items) => items.map(mapWorkshopCatalogEntryToMobileWorkshop),
  });

  const servicesQuery = useQuery({
    queryKey: [
      "mobile",
      "catalog",
      "services",
      currentWorkspace.selectionId,
      currentWorkspace.id,
      entrySurface,
    ],
    queryFn: async () =>
      mobileCatalogApi.listServices({
        workspaceContextKey: currentWorkspace.id,
        workspaceId: currentWorkspace.runtimeWorkspaceId,
        entrySurface,
      }),
    enabled: workspaceDataReady,
    retry: false,
    staleTime: 30_000,
    select: (items) => items.map(mapServiceCatalogEntryToMobileService),
  });

  const runsQuery = useQuery({
    queryKey: ["mobile", "runs", currentWorkspace.selectionId, currentWorkspace.id],
    queryFn: async () => {
      try {
        return await mobileRunsApi.listRuns();
      } catch {
        return [];
      }
    },
    enabled: workspaceDataReady,
    refetchInterval: 10_000,
    retry: false,
  });

  const runsSummaryQuery = useQuery({
    queryKey: ["mobile", "runs", "summary", currentWorkspace.selectionId, currentWorkspace.id],
    queryFn: async () => {
      try {
        return await mobileRunsApi.getRunsSummary();
      } catch {
        return null;
      }
    },
    enabled: workspaceDataReady,
    refetchInterval: 10_000,
    retry: false,
  });
  const recentActivitiesQuery = useQuery({
    queryKey: ["mobile", "me", "recent", currentWorkspace.selectionId, currentWorkspace.id],
    queryFn: async () => {
      try {
        return await mobileMeApi.listRecentActivities({
          limit: 3,
          types: ["run"],
        });
      } catch {
        return null;
      }
    },
    enabled: workspaceDataReady && currentWorkspace.source === "auth",
    retry: false,
    staleTime: 15_000,
  });

  const visibleWorkshops = workshopsQuery.data ?? [];
  const visibleServices = servicesQuery.data ?? [];
  const liveTasks = useMemo(
    () =>
      [...(runsQuery.data ?? [])]
        .sort((left, right) => right.run.updatedAt.localeCompare(left.run.updatedAt))
        .map((snapshot) =>
          mapRunSnapshotToMobileTask(snapshot, undefined, currentWorkspace)
        )
        .filter((item) => item.workspaceId === currentWorkspace.id),
    [currentWorkspace, runsQuery.data]
  );
  const hasLiveTaskData =
    runsSummaryQuery.data != null
      ? runsSummaryQuery.data.total > 0
      : liveTasks.length > 0;
  const taskDataMode: MobileWorkspaceCatalogResult["taskDataMode"] = !workspaceDataReady
    ? "waiting"
    : hasLiveTaskData
      ? "live"
      : "empty";
  const availableTaskTags = useMemo(() => {
    if (!workspaceDataReady) {
      return [];
    }

    if (taskDataMode === "live" && runsSummaryQuery.data) {
      return runsSummaryQuery.data.byTag
        .map((item) => item.key)
        .filter((tag) => tag.startsWith("#"))
        .slice(0, 4);
    }

    return Array.from(
      new Set(liveTasks.flatMap((item) => item.tags).filter((tag) => tag.startsWith("#")))
    ).slice(0, 4);
  }, [liveTasks, runsSummaryQuery.data, taskDataMode, workspaceDataReady]);
  const combinedTasks = useMemo(
    () => (taskDataMode === "live" ? liveTasks : []),
    [liveTasks, taskDataMode]
  );
  const recentTasks = useMemo(() => {
    if (!workspaceDataReady) {
      return [];
    }

    const recentRunIds =
      recentActivitiesQuery.data?.items
        .map((item) => item.runId)
        .filter((item): item is string => typeof item === "string" && item.length > 0) ?? [];

    if (recentRunIds.length === 0) {
      return combinedTasks.slice(0, 3);
    }

    const taskById = new Map(combinedTasks.map((item) => [item.id, item] as const));
    const ordered = recentRunIds
      .map((runId) => taskById.get(runId))
      .filter((item): item is MobileTask => item != null);
    const seen = new Set(ordered.map((item) => item.id));

    return [...ordered, ...combinedTasks.filter((item) => !seen.has(item.id))].slice(0, 3);
  }, [combinedTasks, recentActivitiesQuery.data, workspaceDataReady]);
  const metrics = useMemo(
    () => ({
      workshops: visibleWorkshops.length,
      services: visibleServices.length,
      tasks: runsSummaryQuery.data?.total ?? combinedTasks.length,
    }),
    [combinedTasks.length, runsSummaryQuery.data?.total, visibleServices.length, visibleWorkshops.length]
  );

  return {
    entrySurface,
    visibleWorkshops,
    visibleServices,
    liveTasks,
    combinedTasks,
    recentTasks,
    availableTaskTags,
    taskDataMode,
    workspaceDataReady,
    metrics,
    workshopsQuery,
    servicesQuery,
    runsQuery,
    runsSummaryQuery,
  };
}
