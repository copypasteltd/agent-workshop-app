import type { WorkspaceSummary } from "@lingban/contracts";

export type MobileWorkspaceContextKey = string;

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
  source: "static" | "auth";
  slug: string | null;
  role: WorkspaceSummary["role"] | null;
  membershipStatus: WorkspaceSummary["membershipStatus"] | null;
  authType: WorkspaceSummary["type"] | null;
};

function normalizeText(value?: string | null) {
  return (value ?? "").trim().toLowerCase();
}

function previewWorkspaceName(contextKey: string) {
  switch (contextKey) {
    case "personal":
      return "个人空间";
    case "harbor-finance":
      return "华港财务组";
    case "brand-lab":
      return "品牌内容组";
    default:
      return "预览工作区";
  }
}

function previewWorkspaceType(contextKey: string) {
  return contextKey === "personal" ? "个人" : "企业";
}

function previewWorkspaceMeta() {
  return "预览工作区 / 登录后加载真实数据";
}

function buildPreviewWorkspaceRoot(contextKey: string) {
  const normalized =
    normalizeText(contextKey).replace(/[^a-z0-9-]+/g, "-") || "preview";
  return `/workspace/${normalized}/`;
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
    "harbor-finance"
  );
}

function resolveWorkspaceRoot(
  workspace: WorkspaceSummary
) {
  if (workspace.root) {
    return workspace.root;
  }

  const normalizedSlug =
    normalizeText(workspace.slug).replace(/[^a-z0-9-]+/g, "-") ||
    normalizeText(workspace.name).replace(/[^a-z0-9-]+/g, "-") ||
    workspace.workspaceId;

  if (workspace.type === "personal") {
    return `/workspace/${normalizedSlug}/`;
  }

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
  const contextKey = inferMobileWorkspaceContextKey({
    workspaceId: selectionId,
    slug: selectionId,
    name: selectionId,
  });
  const effectiveSelectionId = selectionId?.trim() || contextKey;
  return {
    id: contextKey,
    name: previewWorkspaceName(contextKey),
    type: previewWorkspaceType(contextKey),
    meta: previewWorkspaceMeta(),
    root: buildPreviewWorkspaceRoot(contextKey),
    workshops: 0,
    tasks: 0,
    contextKey,
    selectionId: effectiveSelectionId,
    runtimeWorkspaceId: effectiveSelectionId,
    source: "static",
    slug: null,
    role: null,
    membershipStatus: null,
    authType: null,
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

export function listMobileWorkspaceViews(workspaces?: WorkspaceSummary[]) {
  if (workspaces && workspaces.length > 0) {
    return workspaces.map(buildMobileWorkspaceViewFromAuth);
  }

  return [];
}

export function resolveMobileWorkspaceView(input: {
  selectionId?: string | null;
  workspaces?: WorkspaceSummary[];
  fallbackWorkspaceId?: string | null;
}) {
  const { selectionId, workspaces, fallbackWorkspaceId } = input;

  if (workspaces && workspaces.length > 0) {
    const exactMatch = selectionId
      ? workspaces.find((workspace) => workspace.workspaceId === selectionId)
      : null;
    if (exactMatch) {
      return buildMobileWorkspaceViewFromAuth(exactMatch);
    }

    const contextMatch = selectionId
      ? workspaces.find(
          (workspace) => resolveAuthWorkspaceContextKey(workspace) === selectionId
        )
      : null;
    if (contextMatch) {
      return buildMobileWorkspaceViewFromAuth(contextMatch);
    }

    const fallbackMatch = fallbackWorkspaceId
      ? workspaces.find((workspace) => workspace.workspaceId === fallbackWorkspaceId)
      : null;
    if (fallbackMatch) {
      return buildMobileWorkspaceViewFromAuth(fallbackMatch);
    }

    return buildMobileWorkspaceViewFromAuth(workspaces[0]);
  }

  return buildPreviewMobileWorkspaceView(
    selectionId ?? fallbackWorkspaceId ?? "harbor-finance"
  );
}
