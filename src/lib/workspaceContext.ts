import type { WorkspaceSummary } from "@lingban/contracts";
import {
  workspaceEntries,
  type MobileWorkspaceEntry,
} from "../data/mobileData";

export type MobileWorkspacePresetKey = "harbor-finance" | "personal" | "brand-lab";
export type MobileWorkspaceContextKey = string;

export type MobileWorkspaceView = MobileWorkspaceEntry & {
  contextKey: string;
  selectionId: string;
  runtimeWorkspaceId: string;
  source: "static" | "auth";
  slug: string | null;
  role: WorkspaceSummary["role"] | null;
  membershipStatus: WorkspaceSummary["membershipStatus"] | null;
  authType: WorkspaceSummary["type"] | null;
};

const staticRuntimeWorkspaceIds: Record<MobileWorkspacePresetKey, string> = {
  "harbor-finance": "wsp_harbor_finance",
  "personal": "wsp_personal",
  "brand-lab": "wsp_brand_content",
};

const workspacePresetMap = new Map(
  workspaceEntries.map((workspace) => [workspace.id, workspace])
);

function normalizeText(value?: string | null) {
  return (value ?? "").trim().toLowerCase();
}

function resolveWorkspacePreset(contextKey: string) {
  return workspacePresetMap.get(contextKey) ?? null;
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
  workspace: WorkspaceSummary,
  preset?: MobileWorkspaceEntry | null
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

  return preset?.root ?? `/workspace/${normalizedSlug}/`;
}

function resolveAuthWorkspaceContextKey(workspace: WorkspaceSummary) {
  return workspace.contextKey || inferMobileWorkspaceContextKey({
    workspaceId: workspace.workspaceId,
    slug: workspace.slug,
    name: workspace.name,
    type: workspace.type,
  });
}

export function buildStaticMobileWorkspaceView(
  contextKey: MobileWorkspacePresetKey
): MobileWorkspaceView {
  const preset = resolveWorkspacePreset(contextKey);
  if (!preset) {
    throw new Error(`Unknown static mobile workspace preset: ${contextKey}`);
  }

  return {
    ...preset,
    contextKey: preset.id,
    selectionId: preset.id,
    runtimeWorkspaceId: staticRuntimeWorkspaceIds[contextKey],
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
  const preset = resolveWorkspacePreset(contextKey);
  const roleLabel = toWorkspaceRoleLabel(workspace.role);
  const meta = preset
    ? `${roleLabel} / ${preset.meta}`
    : `${roleLabel} / ${workspace.slug || workspace.workspaceId}`;

  return {
    ...(preset ?? {
      id: contextKey,
      name: workspace.name,
      type: toWorkspaceTypeLabel(workspace.type),
      meta,
      root: resolveWorkspaceRoot(workspace, null),
      workshops: 0,
      tasks: 0,
    }),
    id: contextKey,
    contextKey,
    name: workspace.name,
    type: toWorkspaceTypeLabel(workspace.type),
    meta,
    root: resolveWorkspaceRoot(workspace, preset),
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

  return workspaceEntries.map((workspace) =>
    buildStaticMobileWorkspaceView(workspace.id as MobileWorkspacePresetKey)
  );
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

  if (selectionId && workspacePresetMap.has(selectionId)) {
    return buildStaticMobileWorkspaceView(selectionId as MobileWorkspacePresetKey);
  }

  return buildStaticMobileWorkspaceView("harbor-finance");
}
