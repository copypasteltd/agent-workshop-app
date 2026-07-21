import type { RunFileEntry, RunSnapshot, RunStatus } from "@lingban/contracts";
import { resolveRunListTags } from "@lingban/domain-models";
import type { MobileTask, MobileTaskMessage } from "../data/mobileData";
import type { MobileWorkspaceView } from "./workspaceContext";

function formatClock(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function resolveWorkshop(snapshot: RunSnapshot) {
  if (snapshot.run.runPurpose === "creator_source") {
    return "Creator Source Session";
  }
  return (
    snapshot.run.catalogMetadata?.workshopName?.zh ??
    snapshot.run.catalogMetadata?.workshopId ??
    snapshot.run.taskVersionId ??
    "未标注工坊"
  );
}

function statusMeta(status: RunStatus) {
  switch (status) {
    case "WAITING_APPROVAL":
      return {
        status: "approval" as const,
        label: "待确认",
        className: "warn",
        stage: "审批等待",
      };
    case "SUCCEEDED":
      return {
        status: "done" as const,
        label: "已完成",
        className: "success",
        stage: "结果完成",
      };
    case "FAILED":
      return {
        status: "failed" as const,
        label: "失败",
        className: "warn",
        stage: "错误处理",
      };
    case "CANCELLED":
      return {
        status: "cancelled" as const,
        label: "已取消",
        className: "warn",
        stage: "任务终止",
      };
    case "CREATED":
    case "READY":
    case "QUEUED":
    case "STARTING":
    case "RUNNING":
    default:
      return {
        status: "running" as const,
        label: "运行中",
        className: "success",
        stage:
          status === "READY"
            ? "已就绪"
            : status === "QUEUED"
              ? "排队中"
              : status === "STARTING"
                ? "启动中"
                : "对话推进",
      };
  }
}

function toRelativeFileName(filePath: string, targetPath: string) {
  if (filePath.startsWith(targetPath)) {
    return filePath.slice(targetPath.length) || filePath;
  }

  return filePath;
}

function collectPathOptions(targetPath: string, files: RunFileEntry[]) {
  const dirs = files.filter((file) => file.path.endsWith("/")).map((file) => file.path);
  return Array.from(new Set([targetPath, ...dirs])).map((dirPath) => ({
    label: dirPath === targetPath ? "实例目录" : toRelativeFileName(dirPath, targetPath) || "目录",
    path: dirPath,
    helper: "当前任务 target path 内可浏览的挂载目录。",
  }));
}

function runtimeLaunchModeLabel(value: RunSnapshot["runtime"]["launchMode"]) {
  switch (value) {
    case "local-process":
      return "宿主进程";
    case "docker":
      return "容器";
    default:
      return null;
  }
}

function buildRuntimeSummary(snapshot: RunSnapshot) {
  const launchMode = runtimeLaunchModeLabel(snapshot.runtime.launchMode);
  const containerName = snapshot.runtime.containerName?.trim() || null;

  if (launchMode && containerName) {
    return `${launchMode} / ${containerName}`;
  }

  if (containerName) {
    return containerName;
  }

  if (launchMode) {
    return launchMode;
  }

  return "未上报";
}

export function isLiveTaskId(id: string | undefined) {
  return Boolean(id?.startsWith("run_"));
}

export function mapRunSnapshotToMobileTask(
  snapshot: RunSnapshot,
  liveFiles?: RunFileEntry[],
  currentWorkspace?: MobileWorkspaceView
): MobileTask {
  const files = liveFiles ?? snapshot.files;
  const status = statusMeta(snapshot.run.status);
  const normalizedWorkspaceId = currentWorkspace?.runtimeWorkspaceId === snapshot.run.workspaceId
    ? currentWorkspace.id
    : snapshot.run.catalogMetadata?.workspaceContextKey ??
      snapshot.run.workspaceId;
  const messages: MobileTaskMessage[] = snapshot.messages.map((message) => ({
    role: message.role === "agent" ? "运行实例" : message.role === "user" ? "你" : "系统引导",
    time: formatClock(message.createdAt),
    body: message.text,
    attachments: message.attachments.map((attachment) => ({
      label: attachment.label,
      path: attachment.path,
    })),
    kind: (message.role === "agent" ? "agent" : message.role === "user" ? "user" : "system") as
      | "system"
      | "user"
      | "agent",
  }));
  const lastMessage = messages[messages.length - 1];

  return {
    id: snapshot.run.runId,
    workspaceId: normalizedWorkspaceId,
    title: snapshot.run.title,
    workshop: resolveWorkshop(snapshot),
    status: status.status,
    statusLabel: status.label,
    statusClass: status.className,
    updatedAt: `更新于 ${formatClock(snapshot.run.updatedAt)}`,
    summary: lastMessage?.body ?? snapshot.run.statusReason ?? "实例已建立，等待继续推进。",
    tags: resolveRunListTags(snapshot, {
      workspaceContextKey: normalizedWorkspaceId,
    }),
    targetPath: snapshot.run.targetPath,
    runRef: snapshot.run.runId,
    stage: status.stage,
    eta: snapshot.run.status === "SUCCEEDED" ? "已完成" : "持续运行中",
    approvals: snapshot.approvals.filter((item) => item.state === "pending").length,
    objective: snapshot.run.title,
    runtimeSummary: buildRuntimeSummary(snapshot),
    providerSummary: snapshot.provider
      ? `${snapshot.provider.displayName} / ${snapshot.provider.model}`
      : "未解析 Provider",
    messages,
    files: files
      .filter((file) => !file.path.endsWith("/"))
      .map((file) => ({
        name: toRelativeFileName(file.path, snapshot.run.targetPath),
        path: file.path,
        meta: `updated ${formatClock(file.updatedAt)} / ${file.sizeBytes ?? 0}b`,
        status: file.kind,
        helper: "来自当前任务实例 target path 的文件。",
      })),
    pathOptions: collectPathOptions(snapshot.run.targetPath, files),
  };
}
