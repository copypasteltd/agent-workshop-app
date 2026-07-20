import type {
  CreateRunBinding,
  McpBindingRecord,
  McpRegistryEntry,
  RunApprovalMode,
  SessionProjectStatus,
  WorkspaceRole,
} from "@lingban/contracts";
import Taro from "@tarojs/taro";
import { hydrateCreatorPublishOperationKeys } from "./mobileCreatorFlow";

const CREATOR_ROLES = new Set<WorkspaceRole>(["owner", "admin", "creator"]);
const LAUNCH_STORAGE_PREFIX = "lingban.mobile.creator-launch";
const PUBLISH_STORAGE_PREFIX = "lingban.mobile.creator-publish";

export type MobileCreatorLaunchDraft = {
  workspaceId: string;
  creationId: string;
  projectIdempotencyKey: string;
  sourceRunIdempotencyKey: string;
  sessionProjectId: string | null;
  name: string;
  description: string;
  providerId: string;
  model: string;
  selectedMcpIds: string[];
  selectedCredentialIds: string[];
  approvalMode: RunApprovalMode;
};

export type MobileCreatorPublishDraft = {
  sessionProjectId: string;
  packageIdempotencyKey: string;
  releaseIdempotencyKey: string;
  packageId: string;
  title: string;
  description: string;
  audience: string;
  authorization: string;
  outputContract: string;
  targetPath: string;
  estimatedDuration: string;
  tagsText: string;
  scope: "personal" | "enterprise";
  releaseState: "private" | "staged" | "production";
};

function storageKey(workspaceId: string) {
  return `${LAUNCH_STORAGE_PREFIX}.${workspaceId}`;
}

export function createMobileOperationId(prefix: string) {
  const random = globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

export function createDefaultCreatorLaunchDraft(workspaceId: string): MobileCreatorLaunchDraft {
  const creationId = createMobileOperationId("creator-launch");
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");

  return {
    workspaceId,
    creationId,
    projectIdempotencyKey: `${creationId}-project`,
    sourceRunIdempotencyKey: `${creationId}-source-run`,
    sessionProjectId: null,
    name: `新工作流 ${month}-${day} ${hour}:${minute}`,
    description: "",
    providerId: "",
    model: "",
    selectedMcpIds: [],
    selectedCredentialIds: [],
    approvalMode: "manual",
  };
}

export function readCreatorLaunchDraft(workspaceId: string) {
  try {
    const value = Taro.getStorageSync<MobileCreatorLaunchDraft>(storageKey(workspaceId));
    if (value && value.workspaceId === workspaceId && value.creationId) {
      return value;
    }
  } catch {
    return null;
  }
  return null;
}

export function writeCreatorLaunchDraft(draft: MobileCreatorLaunchDraft) {
  Taro.setStorageSync(storageKey(draft.workspaceId), draft);
}

export function clearCreatorLaunchDraft(workspaceId: string) {
  Taro.removeStorageSync(storageKey(workspaceId));
}

function publishStorageKey(sessionProjectId: string) {
  return `${PUBLISH_STORAGE_PREFIX}.${sessionProjectId}`;
}

export function createDefaultCreatorPublishDraft(input: {
  sessionProjectId: string;
  name: string;
  description: string;
  targetPath: string;
  personal: boolean;
}): MobileCreatorPublishDraft {
  const suffix = input.sessionProjectId.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(-28);
  return {
    sessionProjectId: input.sessionProjectId,
    packageIdempotencyKey: createMobileOperationId("creator-package"),
    releaseIdempotencyKey: createMobileOperationId("creator-release"),
    packageId: `workflow-${suffix}`,
    title: input.name,
    description: input.description || input.name,
    audience: "当前工作区成员",
    authorization: "使用工作区已绑定的 MCP 与凭证",
    outputContract: "输出文件写入实例 Target Path，并保留任务回执。",
    targetPath: input.targetPath || "/workspace/",
    estimatedDuration: "05-15 min",
    tagsText: "agent,workflow",
    scope: input.personal ? "personal" : "enterprise",
    releaseState: "private",
  };
}

export function readCreatorPublishDraft(sessionProjectId: string) {
  try {
    const value = Taro.getStorageSync<MobileCreatorPublishDraft>(publishStorageKey(sessionProjectId));
    if (value?.sessionProjectId !== sessionProjectId) return null;
    const hydrated = hydrateCreatorPublishOperationKeys(value, createMobileOperationId);
    if (
      hydrated.packageIdempotencyKey !== value.packageIdempotencyKey ||
      hydrated.releaseIdempotencyKey !== value.releaseIdempotencyKey
    ) {
      writeCreatorPublishDraft(hydrated);
    }
    return hydrated;
  } catch {
    return null;
  }
}

export function writeCreatorPublishDraft(draft: MobileCreatorPublishDraft) {
  Taro.setStorageSync(publishStorageKey(draft.sessionProjectId), draft);
}

export function clearCreatorPublishDraft(sessionProjectId: string) {
  Taro.removeStorageSync(publishStorageKey(sessionProjectId));
}

export function canCreateMobileSourceRun(role?: WorkspaceRole | null) {
  return role ? CREATOR_ROLES.has(role) : false;
}

export function resolveAutoAttachedCapabilities(
  mcps: McpRegistryEntry[],
  bindings: McpBindingRecord[]
) {
  const activeMcpIds = new Set(
    mcps.filter((entry) => entry.status === "active").map((entry) => entry.mcpId)
  );
  const autoBindings = bindings.filter(
    (binding) =>
      binding.status === "active" &&
      binding.autoAttach &&
      activeMcpIds.has(binding.mcpId)
  );

  return {
    mcpIds: [...new Set(autoBindings.map((binding) => binding.mcpId))],
    credentialIds: [
      ...new Set(
        autoBindings
          .map((binding) => binding.credentialId)
          .filter((credentialId): credentialId is string => Boolean(credentialId))
      ),
    ],
  };
}

export function buildCreatorRunBindings(
  mcps: McpRegistryEntry[],
  selectedMcpIds: string[],
  selectedCredentialIds: string[]
): CreateRunBinding {
  const selected = new Set(selectedMcpIds);
  const entries = mcps.filter((entry) => selected.has(entry.mcpId));

  return {
    firstPartyMcpIds: entries
      .filter((entry) => entry.source === "first-party")
      .map((entry) => entry.mcpId),
    externalConnectorRefs: entries
      .filter((entry) => entry.source !== "first-party")
      .map((entry) => entry.ref),
    credentialIds: [...new Set(selectedCredentialIds)],
  };
}

export function creatorProjectStatusLabel(status: SessionProjectStatus) {
  switch (status) {
    case "DRAFT": return "待启动";
    case "RECORDING": return "录制中";
    case "CAPTURED": return "已固化";
    case "EDITING": return "编辑中";
    case "REPLAYING": return "回放中";
    case "READY_TO_SEAL": return "待密封";
    case "SEALED": return "已密封";
    case "PACKAGED": return "已封装";
    case "PUBLISHED": return "已发布";
    case "ARCHIVED": return "已归档";
  }
}

export function creatorProjectStatusTone(status: SessionProjectStatus) {
  if (status === "PUBLISHED" || status === "SEALED" || status === "PACKAGED") {
    return "success";
  }
  if (status === "ARCHIVED") {
    return "warn";
  }
  return "active";
}

export const mobileCreatorQueryKeys = {
  projects: (workspaceId: string) => ["mobile", "creator", "projects", workspaceId] as const,
  project: (workspaceId: string, projectId: string) =>
    ["mobile", "creator", "projects", workspaceId, projectId] as const,
  drafts: (workspaceId: string) => ["mobile", "creator", "drafts", workspaceId] as const,
  draft: (workspaceId: string, draftId: string) =>
    ["mobile", "creator", "drafts", workspaceId, draftId] as const,
  packages: (workspaceId: string) => ["mobile", "creator", "packages", workspaceId] as const,
};
