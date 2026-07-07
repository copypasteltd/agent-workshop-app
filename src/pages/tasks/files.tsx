import { matchesSearchQuery } from "@lingban/domain-models";
import { useQuery } from "@tanstack/react-query";
import { Button, Input, View } from "@tarojs/components";
import Taro, { getCurrentInstance } from "@tarojs/taro";
import { useEffect, useMemo, useState } from "react";
import {
  findVisibleTask,
  getWorkspaceEntry,
  normalizeMobileWorkspaceId,
} from "../../data/workspaceCatalog";
import { buildMobileRunFileDownloadUrl, mobileRunsApi } from "../../lib/api";
import { isLiveTaskId, mapRunSnapshotToMobileTask } from "../../lib/liveTaskAdapters";
import { useMobileRunStream } from "../../lib/runStream";
import { useMobileUiStore } from "../../stores/mobileUiStore";

export default function TaskFilesPage() {
  const id = getCurrentInstance().router?.params?.id;
  const liveTaskId = isLiveTaskId(id);
  const currentWorkspaceId = useMobileUiStore((state) => state.currentWorkspaceId);
  const currentWorkspace = getWorkspaceEntry(currentWorkspaceId);
  useMobileRunStream(liveTaskId ? id ?? null : null, liveTaskId);

  const liveRunDetailQuery = useQuery({
    enabled: liveTaskId,
    queryKey: ["mobile", "runs", id],
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
    queryKey: ["mobile", "runs", id, "files"],
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

  const task = useMemo(() => {
    if (liveTaskId && (liveRunDetailQuery.isPending || liveRunFilesQuery.isPending)) {
      return null;
    }

    if (liveRunDetailQuery.data) {
      const liveTask = mapRunSnapshotToMobileTask(liveRunDetailQuery.data, liveRunFilesQuery.data);
      if (normalizeMobileWorkspaceId(liveTask.workspaceId) === currentWorkspace.id) {
        return liveTask;
      }
    }

    return findVisibleTask(id, currentWorkspace.id);
  }, [currentWorkspace.id, id, liveRunDetailQuery.data, liveRunDetailQuery.isPending, liveRunFilesQuery.data, liveRunFilesQuery.isPending, liveTaskId]);

  useEffect(() => {
    if (!id || !task || task.id === id || (liveTaskId && (liveRunDetailQuery.isPending || liveRunFilesQuery.isPending))) {
      return;
    }

    Taro.redirectTo({ url: `/pages/tasks/files?id=${task.id}` });
  }, [id, liveRunDetailQuery.isPending, liveRunFilesQuery.isPending, liveTaskId, task]);

  const [currentPath, setCurrentPath] = useState(task?.pathOptions[0]?.path ?? task?.targetPath ?? "");
  const [inputPath, setInputPath] = useState(task?.pathOptions[0]?.path ?? task?.targetPath ?? "");
  const [selectedFilePath, setSelectedFilePath] = useState(task?.files[0]?.path ?? "");
  const [fileSearch, setFileSearch] = useState("");

  useEffect(() => {
    if (!task) {
      return;
    }

    const nextPath = task.pathOptions[0]?.path ?? task.targetPath;
    setCurrentPath(nextPath);
    setInputPath(nextPath);
    setSelectedFilePath(task.files[0]?.path ?? "");
    setFileSearch("");
  }, [task]);

  const visibleFiles = useMemo(() => {
    if (!task) {
      return [];
    }

    return task.files.filter((item) => currentPath === task.targetPath || item.path.startsWith(currentPath));
  }, [currentPath, task]);

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
      task.files.find((item) => item.path === selectedFilePath) ??
      filteredVisibleFiles[0] ??
      visibleFiles[0] ??
      task.files[0] ??
      null
    );
  }, [filteredVisibleFiles, selectedFilePath, task, visibleFiles]);

  const filePreviewQuery = useQuery({
    enabled: Boolean(task && isLiveTaskId(task.id) && selectedFile?.path),
    queryKey: ["mobile", "runs", task?.id ?? "", "files", "read", selectedFile?.path ?? ""],
    queryFn: async () => {
      if (!task || !selectedFile?.path) {
        return null;
      }

      try {
        return await mobileRunsApi.readRunFile(task.id, selectedFile.path);
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

    const url = buildMobileRunFileDownloadUrl(task.id, path);

    if (process.env.TARO_ENV === "h5") {
      if (typeof window !== "undefined") {
        window.open(url, "_blank", "noopener,noreferrer");
      }
      return;
    }

    try {
      await Taro.downloadFile({ url });
      Taro.showToast({ title: "开始下载", icon: "success" });
    } catch {
      Taro.showToast({ title: "下载失败", icon: "none" });
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

  if (!task && liveTaskId && (liveRunDetailQuery.isPending || liveRunFilesQuery.isPending)) {
    return (
      <View className="page-shell">
        <View className="hero-card">
          <View className="section-title">正在加载文件目录</View>
          <View className="section-copy">正在同步当前 run 的文件树与目标路径。</View>
        </View>
      </View>
    );
  }

  if (!task) {
    return (
      <View className="page-shell">
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
    <View className="page-shell">
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
            <View className="file-meta mono">{currentPath}</View>
          </View>
          <View className="pill active">{filteredVisibleFiles.length} 个文件</View>
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
        <View className="file-card preview-card">
          <View className="section-head">
            <View>
              <View className="section-title">文件预览</View>
              <View className="file-meta mono">{selectedFile.path}</View>
            </View>
            <View className="pill-row">
              <View className="pill active">{selectedFile.status}</View>
              <Button className="path-apply-btn" onClick={() => handleDownload(selectedFile.path)}>
                下载文件
              </Button>
            </View>
          </View>
          <View className="muted">{selectedFile.helper}</View>
          <View className="preview-code">
            {isLiveTaskId(task.id)
              ? filePreviewQuery.isPending
                ? "正在读取文件内容..."
                : filePreviewQuery.data
                  ? `${filePreviewQuery.data.content}${
                      filePreviewQuery.data.truncated ? "\n\n[内容过长，已截断，请下载完整文件。]" : ""
                    }`
                  : "当前文件更适合直接下载查看，或者后端尚未返回可预览文本。"
              : "当前为静态参照数据。接入 live run 后，这里会展示真实的文本预览内容。"}
          </View>
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
          {task.pathOptions.map((item) => (
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
          自定义路径会限制在当前工作区与当前实例目录之内，便于在移动端直接下载任意结果文件。
        </View>
      </View>
    </View>
  );
}
