import type {
  EntrySurface,
  ServiceCatalogEntry,
  ServiceDetail,
  WorkshopCatalogEntry,
  WorkshopDetail,
} from "@lingban/contracts";
import type { MobileService, MobileWorkshop } from "../data/mobileData";

export function resolveMobileEntrySurface(): EntrySurface {
  return process.env.TARO_ENV === "h5" ? "h5" : "mini-program";
}

export function mapWorkshopCatalogEntryToMobileWorkshop(
  item: WorkshopCatalogEntry | WorkshopDetail
): MobileWorkshop {
  return {
    id: item.workshopId,
    name: item.displayName.zh,
    owner: item.ownerLabel.zh,
    description: item.summary.zh,
    badge: item.badge.zh,
  };
}

export function mapServiceCatalogEntryToMobileService(
  item: ServiceCatalogEntry | ServiceDetail
): MobileService {
  return {
    id: item.serviceId,
    workshopId: item.workshopId,
    name: item.displayName.zh,
    summary: item.summary.zh,
    auth: item.authRequirementText.zh,
    eta: item.estimatedDuration,
    outputSummary: item.outputContractSummary.zh,
    targetPathHint: item.targetPathHint,
    launchMode: item.launchMode,
    requiredFirstPartyMcpIds: item.requiredBindings.firstPartyMcpIds,
    externalConnectorRefs: item.requiredBindings.externalConnectorRefs,
    credentialIds: item.requiredBindings.credentialIds,
  };
}

function summarizeLaunchMode(mode: MobileService["launchMode"]) {
  switch (mode) {
    case "form-first":
      return "form-first";
    case "approval-first":
      return "approval-first";
    case "instant-conversation":
    default:
      return "conversation-first";
  }
}

export function buildMobileServiceCapabilityEntries(services: MobileService[]) {
  return services.slice(0, 5).map((service) => {
    const firstPartyCount = service.requiredFirstPartyMcpIds?.length ?? 0;
    const externalCount = service.externalConnectorRefs?.length ?? 0;
    const credentialCount = service.credentialIds?.length ?? 0;
    const capabilityParts = [
      firstPartyCount > 0 ? `${firstPartyCount} first-party MCP` : null,
      externalCount > 0 ? `${externalCount} external connector` : null,
      credentialCount > 0 ? `${credentialCount} credential mount` : null,
      summarizeLaunchMode(service.launchMode),
    ].filter((item): item is string => Boolean(item));

    const status =
      externalCount > 0
        ? "connector"
        : credentialCount > 0
          ? "credential"
          : firstPartyCount > 0
            ? "runtime"
            : "service";

    return {
      name: service.name,
      detail: [service.auth, capabilityParts.join(" / "), service.outputSummary]
        .filter((item): item is string => Boolean(item && item.trim()))
        .join(" / "),
      status,
    };
  });
}

function formatBindingLabels(prefix: string, values: string[]) {
  return values.map((value) => `${prefix} ${value}`);
}

export function buildMobileServiceConnectorLabels(detail: ServiceDetail): string[] {
  return [
    ...formatBindingLabels("MCP", detail.requiredBindings.firstPartyMcpIds),
    ...formatBindingLabels("Connector", detail.requiredBindings.externalConnectorRefs),
    ...formatBindingLabels("Credential", detail.requiredBindings.credentialIds),
  ];
}

export function buildMobileServiceRiskSummary(detail: ServiceDetail): string {
  const notes = [detail.authRequirementText.zh];

  if (detail.requiredBindings.firstPartyMcpIds.includes("mcp.browser.playwright")) {
    notes.push("敏感浏览器动作会回到当前对话流等待确认");
  }

  if (detail.requiredBindings.credentialIds.length > 0) {
    notes.push(`${detail.requiredBindings.credentialIds.length} 个私有凭证按只读绑定注入运行实例`);
  }

  if (detail.requiredBindings.externalConnectorRefs.length > 0) {
    notes.push(`${detail.requiredBindings.externalConnectorRefs.length} 个外部能力引用在运行时解析`);
  }

  return notes.join("；");
}

export function buildMobileServiceLaunchFlow(detail: ServiceDetail): string[] {
  const startStep =
    detail.launchMode === "form-first"
      ? "创建实例后先进入结构化补录，再回到任务对话"
      : detail.launchMode === "approval-first"
        ? "创建实例后先进入审批节点，再继续任务对话"
        : "创建实例后直接进入任务对话";

  const runtimeStep = detail.requiredBindings.firstPartyMcpIds.includes("mcp.browser.playwright")
    ? "浏览器接管与敏感操作保持审批回流，不会跳出当前会话"
    : "运行过程保持同一会话，能力绑定与外部引用按实例上下文加载";

  return [
    startStep,
    "系统自动插入首条信息采集消息，由 Codex 继续追问缺失输入",
    runtimeStep,
    `结果持续回写到 ${detail.targetPathHint} 及其输出子目录`,
  ];
}

export function buildMobileWorkshopLaunchFlow(detail: WorkshopDetail): string[] {
  return [
    "从当前工坊选择服务并实例化任务",
    "系统自动插入首条消息，请 Codex 主动收集缺失资料",
    "用户在同一任务对话里继续补充信息、审批或追问结果",
    detail.nextStepSummary.zh,
  ];
}
