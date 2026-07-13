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
        className: "active",
        stage: "结果完成",
      };
    case "FAILED":
      return {
        status: "approval" as const,
        label: "失败",
        className: "warn",
        stage: "错误处理",
      };
    case "CREATED":
    case "READY":
    case "QUEUED":
    case "STARTING":
    case "RUNNING":
    case "CANCELLED":
    default:
      return {
        status: "running" as const,
        label: status === "CANCELLED" ? "已取消" : "运行中",
        className: status === "CANCELLED" ? "warn" : "success",
        stage:
          status === "READY"
            ? "已就绪"
            : status === "QUEUED"
              ? "排队中"
              : status === "STARTING"
                ? "启动中"
                : status === "CANCELLED"
                  ? "任务终止"
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

function buildModuleMessages(
  snapshot: RunSnapshot,
  files: RunFileEntry[],
  status: ReturnType<typeof statusMeta>
): MobileTaskMessage[] {
  const nextMessages: MobileTaskMessage[] = [];
  const pendingApprovals = snapshot.approvals.filter((item) => item.state === "pending");
  const visibleFiles = files.filter((file) => !file.path.endsWith("/"));

  if (pendingApprovals.length > 0) {
    nextMessages.push({
      role: "系统引导",
      time: formatClock(snapshot.run.updatedAt),
      body: "当前实例有待确认动作，请直接在这条消息流里处理。",
      kind: "system",
      module: {
        type: "approval",
        title: "当前实例等待确认",
        summary: "敏感动作和预算相关动作会直接回到当前任务对话，不会脱离同一实例上下文。",
        status: "待确认",
        items: pendingApprovals
          .slice(0, 3)
          .map((item) => item.note?.trim() || item.prompt.trim()),
        primaryAction: "继续执行",
        primaryDraft: "我已确认当前待审批动作，请继续执行这一轮实例。",
        secondaryAction: "先解释原因",
        secondaryDraft: "请先解释当前审批动作为什么需要我确认，再决定是否继续执行。",
      },
    });
  }

  if (visibleFiles.length > 0) {
    const topFiles = visibleFiles.slice(0, 3).map((file) => toRelativeFileName(file.path, snapshot.run.targetPath));
    nextMessages.push({
      role: "运行实例",
      time: formatClock(snapshot.run.updatedAt),
      body:
        snapshot.run.status === "SUCCEEDED"
          ? "结果文件已经整理完成，可直接打开文件页查看或继续追问。"
          : "当前已有中间结果文件，可直接打开文件页继续检查。",
      kind: "agent",
      module: {
        type: snapshot.run.status === "FAILED" ? "error" : snapshot.run.status === "SUCCEEDED" ? "result" : "file",
        title:
          snapshot.run.status === "FAILED"
            ? "实例输出包含错误线索"
            : snapshot.run.status === "SUCCEEDED"
              ? "结果文件已生成"
              : "已有可查看文件",
        summary:
          snapshot.run.status === "FAILED"
            ? "先查看当前目录下的错误摘要和中间结果，再决定是否继续重试。"
            : snapshot.run.status === "SUCCEEDED"
              ? "结果包和关键摘要已经写回任务目录，可继续下载或在对话中派生下一轮动作。"
              : "当前实例已经把中间结果写到任务目录，你可以直接打开文件页检查。",
        status: status.label,
        items: topFiles,
        primaryAction: "查看文件",
        secondaryAction: "继续追问",
        secondaryDraft:
          snapshot.run.status === "FAILED"
            ? "请结合当前错误输出解释失败原因，并告诉我恢复执行需要我补充什么。"
            : "请基于当前结果继续概括关键信息，并告诉我下一步最值得处理的动作。",
      },
    });
  }

  if (snapshot.run.status === "FAILED") {
    nextMessages.push({
      role: "系统引导",
      time: formatClock(snapshot.run.updatedAt),
      body: "当前实例进入错误处理阶段，请先确认恢复路径。",
      kind: "system",
      module: {
        type: "error",
        title: "实例需要恢复建议",
        summary: "失败状态不会自动重置上下文，建议先让 Codex 解释原因，再决定是否继续重试。",
        status: "错误处理",
        items: ["保留当前会话上下文", "先读取错误摘要", "确认是否重新执行上一阶段"],
        primaryAction: "解释失败原因",
        primaryDraft: "请先解释当前实例失败原因，并给出最稳妥的恢复执行建议。",
        secondaryAction: "继续重试",
        secondaryDraft: "请基于当前上下文继续重试上一阶段，并告诉我是否还需要新的输入。",
      },
    });
  }

  return nextMessages;
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
  messages.push(...buildModuleMessages(snapshot, files, status));
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
