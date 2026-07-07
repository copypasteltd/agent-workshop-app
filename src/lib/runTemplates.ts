import type { CreateRunInput } from "@lingban/contracts";
import {
  getWorkspaceEntry,
  mobileWorkspaceRuntimeIds,
  type MobileWorkspaceId,
} from "../data/workspaceCatalog";

type MobileRunTemplate = {
  taskVersionId: string;
  sessionVersionId: string;
  title: string;
  targetDir: string;
  bindings: CreateRunInput["bindings"];
};

const mobileRunTemplates: Record<string, MobileRunTemplate> = {
  "tax-filing": {
    taskVersionId: "tsv_tax_filing",
    sessionVersionId: "sev_chrome_tax_runner",
    title: "香港有限公司季度报税",
    targetDir: "tax-filing",
    bindings: {
      firstPartyMcpIds: ["mcp.browser.playwright"],
      externalConnectorRefs: ["workspace:notion-sse"],
      credentialIds: ["cred_browser_storage_state", "cred_tax_notice_folder"],
    },
  },
  "drama-storyboard": {
    taskVersionId: "tsv_drama_storyboard",
    sessionVersionId: "sev_creator_drama_suite",
    title: "短剧分镜生成与审校",
    targetDir: "drama-storyboard",
    bindings: {
      firstPartyMcpIds: ["mcp.image.gpt-image-2"],
      externalConnectorRefs: ["workspace:seedance-api", "third-party:figma-mcp"],
      credentialIds: ["cred_openai_image_api_key", "cred_seedance_api_key", "cred_figma_pat"],
    },
  },
  "poster-batch": {
    taskVersionId: "tsv_poster_batch",
    sessionVersionId: "sev_brand_poster_suite",
    title: "品牌海报批量生成",
    targetDir: "poster-batch",
    bindings: {
      firstPartyMcpIds: ["mcp.image.gpt-image-2"],
      externalConnectorRefs: ["third-party:asset-library"],
      credentialIds: ["cred_openai_image_api_key", "cred_asset_library_api_key"],
    },
  },
};

function buildRunSuffix() {
  return new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
}

function resolveEntrySurface(): CreateRunInput["entrySurface"] {
  return process.env.TARO_ENV === "h5" ? "h5" : "mini-program";
}

export function buildMobileRunInput(
  serviceId: string,
  workspaceId: MobileWorkspaceId
): CreateRunInput | null {
  const template = mobileRunTemplates[serviceId];

  if (!template) {
    return null;
  }

  const workspace = getWorkspaceEntry(workspaceId);
  const runtimeWorkspaceId = mobileWorkspaceRuntimeIds[workspace.id];
  const root = workspace.root.endsWith("/") ? workspace.root : `${workspace.root}/`;

  return {
    workspaceId: runtimeWorkspaceId,
    taskVersionId: template.taskVersionId,
    sessionVersionId: template.sessionVersionId,
    title: template.title,
    targetPath: `${root}runs/${template.targetDir}-${buildRunSuffix()}/`,
    entrySurface: resolveEntrySurface(),
    initialMessage: null,
    bindings: template.bindings,
  };
}
