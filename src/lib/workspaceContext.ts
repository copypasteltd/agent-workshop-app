import type { WorkspaceContextSummary, WorkspaceSummary } from "@lingban/contracts";

export type MobileWorkspaceContextKey = string;
export type MobileWorkspaceBootstrap = WorkspaceSummary | WorkspaceContextSummary;

export type MobileWorkspaceView = {
  id: string;
  name: string;
  type: string;
  meta: string;
  root: string;
  workshops: number;
  tasks: number;
  contextKey: string;
  selectionId: string;
  runtimeWorkspaceId: string;
  source: "static" | "public" | "auth";
  slug: string | null;
  role: WorkspaceSummary["role"] | null;
  membershipStatus: WorkspaceSummary["membershipStatus"] | null;
  authType: WorkspaceSummary["type"] | null;
};

export function hasAuthoritativeMobileWorkspaceContext(
  workspace: MobileWorkspaceView
) {
  return workspace.source === "auth" || workspace.source === "public";
}

function normalizeText(value?: string | null) {
  return (value ?? "").trim().toLowerCase();
}

function previewWorkspaceName() {
  return "未连接工作区";
}

function previewWorkspaceType() {
  return "未连接";
}

function previewWorkspaceMeta() {
  return "等待会话或目录上下文";
}

function buildPreviewWorkspaceRoot() {
  return "/workspace/";
}

function toWorkspaceTypeLabel(type: WorkspaceSummary["type"]) {
  switch (type) {
    case "personal":
      return "个人";
    case "team":
      return "团队";
    case "enterprise":
    default:
      return "企业";
  }
}

function toWorkspaceRoleLabel(role: WorkspaceSummary["role"]) {
  switch (role) {
    case "owner":
      return "所有者";
    case "admin":
      return "管理员";
    case "operator":
      return "操作员";
    case "creator":
      return "创作者";
    case "viewer":
    default:
      return "查看者";
  }
}

function isCatalogWorkspaceContext(
  workspace: MobileWorkspaceBootstrap
): workspace is WorkspaceContextSummary {
  return "runtimeWorkspaceId" in workspace && "displayName" in workspace;
}

function matchesWorkspaceSelection(
  workspace: MobileWorkspaceBootstrap,
  selectionId: string
) {
  if (isCatalogWorkspaceContext(workspace)) {
    return (
      workspace.contextKey === selectionId ||
      workspace.runtimeWorkspaceId === selectionId
    );
  }

  return (
    workspace.workspaceId === selectionId ||
    resolveAuthWorkspaceContextKey(workspace) === selectionId
  );
}

export function inferMobileWorkspaceContextKey(input: {
  workspaceId?: string | null;
  slug?: string | null;
  name?: string | null;
  type?: WorkspaceSummary["type"] | string | null;
}): MobileWorkspaceContextKey {
  const type = normalizeText(input.type);
  const haystack = [
    normalizeText(input.workspaceId),
    normalizeText(input.slug),
    normalizeText(input.name),
  ].join(" ");

  if (type === "personal" || haystack.includes("personal") || /个人/.test(haystack)) {
    return "personal";
  }

  if (/harbor|finance|tax|filing|财务|财税|报税/.test(haystack)) {
    return "harbor-finance";
  }

  if (/brand|content|poster|drama|creator|品牌|内容|海报|短剧/.test(haystack)) {
    return "brand-lab";
  }

  return (
    normalizeText(input.slug).replace(/[^a-z0-9-]+/g, "-") ||
    normalizeText(input.name).replace(/[^a-z0-9-]+/g, "-") ||
    input.workspaceId ||
    "workspace"
  );
}

function resolveWorkspaceRoot(workspace: WorkspaceSummary) {
  if (workspace.root) {
    return workspace.root;
  }

  const normalizedSlug =
    normalizeText(workspace.slug).replace(/[^a-z0-9-]+/g, "-") ||
    normalizeText(workspace.name).replace(/[^a-z0-9-]+/g, "-") ||
    workspace.workspaceId;

  return `/workspace/${normalizedSlug}/`;
}

function resolveAuthWorkspaceContextKey(workspace: WorkspaceSummary) {
  return workspace.contextKey || inferMobileWorkspaceContextKey({
    workspaceId: workspace.workspaceId,
    slug: workspace.slug,
    name: workspace.name,
    type: workspace.type,
  });
}

export function buildPreviewMobileWorkspaceView(
  selectionId?: string | null
): MobileWorkspaceView {
  const normalizedSelection =
    normalizeText(selectionId).replace(/[^a-z0-9-]+/g, "-") || "workspace";

  return {
    id: normalizedSelection,
    name: previewWorkspaceName(),
    type: previewWorkspaceType(),
    meta: previewWorkspaceMeta(),
    root: buildPreviewWorkspaceRoot(),
    workshops: 0,
    tasks: 0,
    contextKey: normalizedSelection,
    selectionId: selectionId?.trim() || normalizedSelection,
    runtimeWorkspaceId: selectionId?.trim() || normalizedSelection,
    source: "static",
    slug: null,
    role: null,
    membershipStatus: null,
    authType: null,
  };
}

export function buildMobileWorkspaceViewFromCatalogContext(
  workspace: WorkspaceContextSummary
): MobileWorkspaceView {
  return {
    id: workspace.contextKey,
    name: workspace.displayName.zh,
    type: toWorkspaceTypeLabel(workspace.type),
    meta: workspace.meta.zh,
    root: workspace.root,
    workshops: 0,
    tasks: 0,
    contextKey: workspace.contextKey,
    selectionId: workspace.contextKey,
    runtimeWorkspaceId: workspace.runtimeWorkspaceId,
    source: "public",
    slug: workspace.contextKey,
    role: null,
    membershipStatus: null,
    authType: workspace.type,
  };
}

export function buildMobileWorkspaceViewFromAuth(
  workspace: WorkspaceSummary
): MobileWorkspaceView {
  const contextKey = resolveAuthWorkspaceContextKey(workspace);
  const roleLabel = toWorkspaceRoleLabel(workspace.role);
  const meta = `${roleLabel} / ${workspace.slug || workspace.workspaceId}`;

  return {
    id: contextKey,
    contextKey,
    name: workspace.name,
    type: toWorkspaceTypeLabel(workspace.type),
    meta,
    root: resolveWorkspaceRoot(workspace),
    workshops: 0,
    tasks: 0,
    selectionId: workspace.workspaceId,
    runtimeWorkspaceId: workspace.workspaceId,
    source: "auth",
    slug: workspace.slug,
    role: workspace.role,
    membershipStatus: workspace.membershipStatus,
    authType: workspace.type,
  };
}

function buildMobileWorkspaceView(workspace: MobileWorkspaceBootstrap) {
  return isCatalogWorkspaceContext(workspace)
    ? buildMobileWorkspaceViewFromCatalogContext(workspace)
    : buildMobileWorkspaceViewFromAuth(workspace);
}

export function listMobileWorkspaceViews(workspaces?: MobileWorkspaceBootstrap[]) {
  if (workspaces && workspaces.length > 0) {
    return workspaces.map(buildMobileWorkspaceView);
  }

  return [];
}

export function resolveMobileWorkspaceView(input: {
  selectionId?: string | null;
  workspaces?: MobileWorkspaceBootstrap[];
  fallbackWorkspace?: MobileWorkspaceBootstrap | null;
}) {
  const { selectionId, workspaces, fallbackWorkspace } = input;

  if (workspaces && workspaces.length > 0) {
    const exactMatch = selectionId
      ? workspaces.find((workspace) =>
          matchesWorkspaceSelection(workspace, selectionId)
        )
      : null;
    if (exactMatch) {
      return buildMobileWorkspaceView(exactMatch);
    }

    if (fallbackWorkspace) {
      return buildMobileWorkspaceView(fallbackWorkspace);
    }

    return buildMobileWorkspaceView(workspaces[0]);
  }

  return buildPreviewMobileWorkspaceView(selectionId ?? null);
}
