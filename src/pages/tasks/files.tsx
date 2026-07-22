import type { RunFileEntry } from "@lingban/contracts";
import { matchesSearchQuery } from "@lingban/domain-models";
import { useMobileQuery as useQuery } from "../../lib/useMobileQuery";
import { Button, Image, Input, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useMemo, useState } from "react";
import { mobileRunsApi, requestMobileRunFileDownloadUrl } from "../../lib/api";
import { isLiveTaskId, mapRunSnapshotToMobileTask } from "../../lib/liveTaskAdapters";
import {
  mobileRunDetailQueryKey,
  mobileRunFilesQueryKey,
  mobileRunPreviewQueryKey,
} from "../../lib/runQueryKeys";
import { useMobileRecentRecorder } from "../../lib/recent";
import { useMobileRunStream } from "../../lib/runStream";
import { useResolvedMobileWorkspace } from "../../lib/useMobileWorkspace";
import { useMobileRouteParams } from "../../lib/useMobileRouteParams";
import { useMobilePageShellClass } from "../../components/MobilePageShell";
import { useMobileShareDisabled } from "../../lib/mobileShare";
import { normalizeAgentImagePath } from "../../lib/agentMessageImages";

function ensureTrailingSlash(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}

function formatFileSize(sizeBytes: number | null | undefined) {
  if (sizeBytes == null) {
    return "--";
  }

  if (sizeBytes < 1024) {
    return `${sizeBytes}b`;
  }

  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)}kb`;
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)}mb`;
}

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function toRelativePath(filePath: string, targetPath: string) {
  return filePath.startsWith(targetPath) ? filePath.slice(targetPath.length) || filePath : filePath;
}

function toLiveFileStatus(kind: RunFileEntry["kind"]) {
  switch (kind) {
    case "receipt":
      return "回执";
    case "archive":
      return "归档";
    case "log":
      return "日志";
    case "screenshot":
      return "预览";
    case "output":
    default:
      return "结果";
  }
}

function toLiveFileHelper(kind: RunFileEntry["kind"]) {
  switch (kind) {
    case "receipt":
      return "来自当前实例目录的回执或交付文件。";
    case "archive":
      return "来自当前实例目录的归档与审计材料。";
    case "log":
      return "来自当前实例目录的运行日志。";
    case "screenshot":
      return "来自当前实例目录的截图或可视化预览文件。";
    case "output":
    default:
      return "来自当前任务实例 target path 的结果文件。";
  }
}

function buildLivePathOptions(targetPath: string, entries: RunFileEntry[]) {
  const targetRoot = ensureTrailingSlash(targetPath);
  const directoryPaths = new Set<string>([targetRoot]);

  for (const entry of entries) {
    const normalizedPath = entry.path.endsWith("/") ? entry.path : ensureTrailingSlash(entry.path.split("/").slice(0, -1).join("/"));
    if (normalizedPath && normalizedPath.startsWith(targetRoot)) {
      directoryPaths.add(normalizedPath);
    }
  }

  return [...directoryPaths]
    .sort((left, right) => left.localeCompare(right))
    .map((dirPath, index) => ({
      label:
        dirPath === targetRoot
          ? "实例目录"
          : toRelativePath(dirPath, targetRoot).replace(/\/+$/, "") || `目录 ${index}`,
      path: dirPath,
      helper: "当前任务 target path 内可浏览的挂载目录。",
    }));
}

function toTestIdSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "item";
}

export default function TaskFilesPage() {
  useMobileShareDisabled();
  const params = useMobileRouteParams<{ id?: string; path?: string }>();
  const pageShellClass = useMobilePageShellClass();
  if (!params) {
    return <View className={pageShellClass}><View className="section-copy">正在加载文件路由</View></View>;
  }
  return <TaskFilesContent id={params.id} initialFilePath={params.path} />;
}

function TaskFilesContent({ id, initialFilePath }: { id?: string; initialFilePath?: string }) {
  const pageShellClass = useMobilePageShellClass();
  const liveTaskId = isLiveTaskId(id);
  const currentWorkspace = useResolvedMobileWorkspace();
  useMobileRunStream(liveTaskId ? id ?? null : null, liveTaskId);

  const liveRunDetailQuery = useQuery({
    enabled: liveTaskId,
    queryKey: id ? mobileRunDetailQueryKey(id) : ["mobile", "runs", "missing-detail"],
    queryFn: async () => {
      const runId = id;
      if (!runId || !isLiveTaskId(runId)) {
        return null;
      }

      try {
        return await mobileRunsApi.getRun(runId);
      } catch {
        return null;
      }
    },
    refetchInterval: 10_000,
  });

  const liveRunFilesQuery = useQuery({
    enabled: liveTaskId,
    queryKey: id ? mobileRunFilesQueryKey(id) : ["mobile", "runs", "missing-files"],
    queryFn: async () => {
      const runId = id;
      if (!runId || !isLiveTaskId(runId)) {
        return [];
      }

      try {
        return await mobileRunsApi.listRunFileTree(runId);
      } catch {
        return [];
      }
    },
    refetchInterval: 10_000,
  });

  const mappedLiveTask = useMemo(() => {
    if (!liveRunDetailQuery.data) {
      return null;
    }

    return mapRunSnapshotToMobileTask(
      liveRunDetailQuery.data,
      liveRunFilesQuery.data,
      currentWorkspace
    );
  }, [currentWorkspace, liveRunDetailQuery.data, liveRunFilesQuery.data]);
  const routeLiveTaskOutOfScope = Boolean(
    liveTaskId &&
      !(liveRunDetailQuery.isPending || liveRunFilesQuery.isPending) &&
      mappedLiveTask &&
      mappedLiveTask.workspaceId !== currentWorkspace.id
  );
  const routeTaskOutOfScope = routeLiveTaskOutOfScope;

  const task = useMemo(() => {
    if (liveTaskId && (liveRunDetailQuery.isPending || liveRunFilesQuery.isPending)) {
      return null;
    }

    if (mappedLiveTask) {
      if (mappedLiveTask.workspaceId === currentWorkspace.id) {
        return mappedLiveTask;
      }
    }

    return null;
  }, [
    currentWorkspace.id,
    liveRunDetailQuery.isPending,
    liveRunFilesQuery.isPending,
    liveTaskId,
    mappedLiveTask,
  ]);

  const [currentPath, setCurrentPath] = useState(task?.pathOptions[0]?.path ?? task?.targetPath ?? "");
  const [inputPath, setInputPath] = useState(task?.pathOptions[0]?.path ?? task?.targetPath ?? "");
  const [selectedFilePath, setSelectedFilePath] = useState(task?.files[0]?.path ?? "");
  const [fileSearch, setFileSearch] = useState("");
  const [downloadingPath, setDownloadingPath] = useState("");
  const liveMode = Boolean(task);
  useMobileRecentRecorder(
    task && liveMode && currentWorkspace.source === "auth"
      ? {
          resourceType: "run",
          runId: task.id,
          interaction: "resume",
          sourceSurface: "h5",
        }
      : null,
    currentWorkspace.source === "auth"
  );

  const liveFileItems = useMemo(() => {
    if (!task || !liveMode) {
      return [];
    }

    return (liveRunFilesQuery.data ?? [])
      .filter((entry) => !entry.path.endsWith("/"))
      .map((entry) => ({
        name: toRelativePath(entry.path, ensureTrailingSlash(task.targetPath)),
        path: entry.path,
        meta: `updated ${formatUpdatedAt(entry.updatedAt)} / ${formatFileSize(entry.sizeBytes)}`,
        status: toLiveFileStatus(entry.kind),
        helper: toLiveFileHelper(entry.kind),
      }));
  }, [liveMode, liveRunFilesQuery.data, task]);

  const pathOptions = useMemo(() => {
    if (!task) {
      return [];
    }

    return buildLivePathOptions(task.targetPath, liveRunFilesQuery.data ?? []);
  }, [liveMode, liveRunFilesQuery.data, task]);

  const fileItems = useMemo(() => {
    if (!task) {
      return [];
    }

    return liveFileItems;
  }, [liveFileItems, liveMode, task]);

  useEffect(() => {
    if (!task) {
      return;
    }

    const nextPath = pathOptions[0]?.path ?? task.targetPath;
    setCurrentPath(nextPath);
    setInputPath(nextPath);
    const requestedRelativePath = initialFilePath
      ? normalizeAgentImagePath(initialFilePath, task.targetPath)
      : null;
    const requestedAbsolutePath = requestedRelativePath
      ? `${ensureTrailingSlash(task.targetPath)}${requestedRelativePath}`
      : null;
    setSelectedFilePath(
      fileItems.find(
        (item) => item.path === initialFilePath || item.path === requestedAbsolutePath
      )?.path ?? fileItems[0]?.path ?? ""
    );
    setFileSearch("");
  }, [fileItems, initialFilePath, pathOptions, task]);

  const visibleFiles = useMemo(() => {
    if (!task) {
      return [];
    }

    const normalizedCurrentPath = ensureTrailingSlash(currentPath);

    return fileItems.filter(
      (item) =>
        normalizedCurrentPath === ensureTrailingSlash(task.targetPath) ||
        item.path.startsWith(normalizedCurrentPath)
    );
  }, [currentPath, fileItems, task]);

  const filteredVisibleFiles = useMemo(() => {
    return visibleFiles.filter((item) =>
      matchesSearchQuery(fileSearch, [item.name, item.path, item.meta, item.status, item.helper])
    );
  }, [fileSearch, visibleFiles]);

  const breadcrumbItems = useMemo(() => {
    if (!task) {
      return [];
    }

    const normalized = currentPath.replace(/\/+$/, "");
    const parts = normalized.split("/").filter(Boolean);

    return parts.map((_, index) => {
      const path = `/${parts.slice(0, index + 1).join("/")}/`;
      return {
        label: index === 0 ? parts[index] : parts[index],
        path,
      };
    });
  }, [currentPath, task]);

  useEffect(() => {
    if (!filteredVisibleFiles.length) {
      return;
    }

    setSelectedFilePath((current) =>
      filteredVisibleFiles.some((item) => item.path === current)
        ? current
        : filteredVisibleFiles[0]?.path ?? current
    );
  }, [filteredVisibleFiles]);

  const selectedFile = useMemo(() => {
    if (!task) {
      return null;
    }

    return (
      filteredVisibleFiles.find((item) => item.path === selectedFilePath) ??
      visibleFiles.find((item) => item.path === selectedFilePath) ??
      fileItems.find((item) => item.path === selectedFilePath) ??
      filteredVisibleFiles[0] ??
      visibleFiles[0] ??
      fileItems[0] ??
      null
    );
  }, [fileItems, filteredVisibleFiles, selectedFilePath, task, visibleFiles]);

  const filePreviewQuery = useQuery({
    enabled: Boolean(task && isLiveTaskId(task.id) && selectedFile?.path),
    queryKey:
      task && selectedFile?.path
        ? mobileRunPreviewQueryKey(task.id, selectedFile.path)
        : ["mobile", "runs", "missing-preview"],
    queryFn: async () => {
      if (!task || !selectedFile?.path) {
        return null;
      }

      try {
        return await mobileRunsApi.previewRunFile(task.id, selectedFile.path);
      } catch {
        return null;
      }
    },
    refetchInterval: 10_000,
  });

  async function handleDownload(path: string) {
    if (!task) {
      return;
    }

    try {
      setDownloadingPath(path);
      const url = await requestMobileRunFileDownloadUrl(task.id, path);

      if (process.env.TARO_ENV === "h5") {
        if (typeof window !== "undefined") {
          window.open(url, "_blank", "noopener,noreferrer");
        }
        return;
      }

      await Taro.downloadFile({ url });
      Taro.showToast({ title: "开始下载", icon: "success" });
    } catch {
      Taro.showToast({ title: "下载失败", icon: "none" });
    } finally {
      setDownloadingPath("");
    }
  }

  function openInlinePreview(url: string) {
    if (process.env.TARO_ENV === "h5" && typeof window !== "undefined") {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }

  function handleApplyPath() {
    if (!task) {
      return;
    }

    const normalized = inputPath.trim();
    const allowed =
      normalized.startsWith(task.targetPath) || normalized.startsWith(currentWorkspace.root);

    if (!allowed) {
      Taro.showToast({ title: "路径需位于当前工作区内", icon: "none" });
      return;
    }

    setCurrentPath(normalized);
  }

  if (!task && routeTaskOutOfScope) {
    return (
      <View className={pageShellClass}>
        <View className="hero-card">
          <View className="section-title">当前任务文件不属于这个工作区</View>
          <View className="section-copy">
            这个文件页链接已经越过当前工作区边界。请先返回任务列表重新选择，或切换到对应工作区后再查看文件。
          </View>
          <View className="task-row">
            <Button className="pill active" onClick={() => Taro.navigateBack()}>
              返回任务列表
            </Button>
            <Button className="pill" onClick={() => Taro.switchTab({ url: "/pages/me/index" })}>
              切换工作区
            </Button>
          </View>
        </View>
      </View>
    );
  }

  if (!task && liveTaskId && (liveRunDetailQuery.isPending || liveRunFilesQuery.isPending)) {
    return (
      <View className={pageShellClass}>
        <View className="hero-card">
          <View className="section-title">正在加载文件目录</View>
          <View className="section-copy">正在同步当前 run 的文件树与目标路径。</View>
        </View>
      </View>
    );
  }

  if (!task) {
    return (
      <View className={pageShellClass}>
        <View className="hero-card">
          <View className="section-title">当前工作区暂无可查看文件的任务</View>
          <View className="section-copy">先回到工坊启动实例，或者切换到有任务的工作区。</View>
          <Button className="pill active" onClick={() => Taro.switchTab({ url: "/pages/workshops/index" })}>
            返回工坊
          </Button>
        </View>
      </View>
    );
  }

  return (
    <View className={pageShellClass} data-testid="mobile-task-files-page">
      <View className="crumb-row">
        <Button className="crumb-btn" onClick={() => Taro.navigateBack()}>
          返回会话
        </Button>
        <Button className="tab-btn active">文件</Button>
      </View>

      <View className="file-card">
        <View className="section-head">
          <View>
            <View className="file-name">当前路径</View>
            <View className="file-meta mono" data-testid="mobile-task-files-current-path">
              {currentPath}
            </View>
          </View>
          <View className="pill active">
            {filteredVisibleFiles.length} 个文件
          </View>
        </View>
        <View className="pill-row">
          {breadcrumbItems.map((item) => (
            <Button
              className={`crumb-btn ${currentPath === item.path ? "active" : ""}`}
              key={item.path}
              onClick={() => {
                setCurrentPath(item.path);
                setInputPath(item.path);
              }}
            >
              {item.label}
            </Button>
          ))}
        </View>
        <View className="path-input-shell">
          <Input
            className="path-input mono"
            data-testid="mobile-task-files-search"
            value={fileSearch}
            placeholder="按文件名 / 路径搜索当前目录"
            onInput={(event) => setFileSearch(event.detail.value)}
          />
        </View>
        {filteredVisibleFiles.length === 0 ? (
          <View className="empty-state">
            <View className="section-title">当前目录没有匹配文件</View>
            <View className="empty-copy">可以切换目录，或者清空文件搜索词后再试。</View>
          </View>
        ) : null}
        {filteredVisibleFiles.map((item) => (
          <Button
            className={`file-select ${selectedFile?.path === item.path ? "active" : ""}`}
            data-testid={`mobile-task-file-select-${toTestIdSegment(item.name)}`}
            key={item.path}
            onClick={() => setSelectedFilePath(item.path)}
          >
            <View>
              <View className="file-name">{item.name}</View>
              <View className="file-meta">{item.meta}</View>
              <View className="muted">{item.helper}</View>
            </View>
            <View className="pill active">{item.status}</View>
          </Button>
        ))}
      </View>

      {selectedFile ? (
        <View className="file-card preview-card" data-testid="mobile-task-file-preview">
          <View className="section-head">
            <View>
              <View className="section-title">文件预览</View>
              <View className="file-meta mono">{selectedFile.path}</View>
            </View>
            <View className="pill-row">
              <View className="pill active">{selectedFile.status}</View>
              <Button
                className="path-apply-btn"
                data-testid="mobile-task-file-download"
                disabled={downloadingPath === selectedFile.path}
                onClick={() => handleDownload(selectedFile.path)}
              >
                {downloadingPath === selectedFile.path ? "准备下载中" : "下载文件"}
              </Button>
            </View>
          </View>
          <View className="muted">{selectedFile.helper}</View>
          {filePreviewQuery.isPending ? (
            <View className="preview-code">正在读取文件内容...</View>
          ) : filePreviewQuery.data ? (
            filePreviewQuery.data.mode === "text" ? (
              <View className="preview-code">
                {`${filePreviewQuery.data.content ?? ""}${
                  filePreviewQuery.data.truncated ? "\n\n[内容过长，已截断，请下载完整文件。]" : ""
                }`}
              </View>
            ) : filePreviewQuery.data.mode === "image" && filePreviewQuery.data.downloadUrl ? (
              <View className="preview-media-shell">
                <Image
                  className="preview-image"
                  src={filePreviewQuery.data.downloadUrl}
                  mode="widthFix"
                />
              </View>
            ) : filePreviewQuery.data.mode === "pdf" && filePreviewQuery.data.downloadUrl ? (
              <View className="preview-link-shell">
                <View className="path-helper">当前文件为 PDF，建议在独立窗口中预览或下载。</View>
                <Button
                  className="path-apply-btn"
                  onClick={() => openInlinePreview(filePreviewQuery.data?.downloadUrl ?? "")}
                >
                  打开 PDF 预览
                </Button>
              </View>
            ) : (
              <View className="preview-code">当前文件更适合直接下载查看，或者后端尚未返回可预览内容。</View>
            )
          ) : (
            <View className="preview-code">当前文件更适合直接下载查看，或者后端尚未返回可预览内容。</View>
          )}
        </View>
      ) : null}

      <View className="file-card path-switcher-card">
        <View className="section-head">
          <View>
            <View className="section-title">路径切换</View>
            <View className="section-copy">
              你可以直接选择已挂载路径，也可以手动输入当前工作区内的任意目录。
            </View>
          </View>
          <View className="pill">{currentWorkspace.name}</View>
        </View>

        <View className="path-option-list">
          {pathOptions.map((item) => (
            <Button
              className={`path-option ${currentPath === item.path ? "active" : ""}`}
              key={item.path}
              onClick={() => {
                setCurrentPath(item.path);
                setInputPath(item.path);
              }}
            >
              <View>
                <View className="file-name">{item.label}</View>
                <View className="file-meta mono">{item.path}</View>
                <View className="muted">{item.helper}</View>
              </View>
            </Button>
          ))}
        </View>

        <View className="path-input-row">
          <Input className="path-input mono" value={inputPath} onInput={(event) => setInputPath(event.detail.value)} />
          <Button className="path-apply-btn" onClick={handleApplyPath}>
            切换路径
          </Button>
        </View>
        <View className="path-helper">
          自定义路径会限制在当前工作区与当前实例目录之内。进入真实实例后，可以在这里直接下载当前 target path 下的结果文件。
        </View>
      </View>
    </View>
  );
}
