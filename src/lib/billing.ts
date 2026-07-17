import type { BillingCostBasis, BillingSource } from "@lingban/contracts";

export function formatBillingUsd(value: number) {
  if (value >= 100) {
    return `$${value.toFixed(2)}`;
  }

  if (value >= 1) {
    return `$${value.toFixed(3)}`;
  }

  return `$${value.toFixed(4)}`;
}

export function formatBillingQuantity(value: number) {
  return Number.isInteger(value)
    ? value.toLocaleString("zh-CN")
    : value.toLocaleString("zh-CN", {
        maximumFractionDigits: 4,
      });
}

export function billingSourceLabel(source: BillingSource) {
  switch (source) {
    case "run-message":
      return "运行消息";
    case "run-upload":
      return "运行附件上传";
    case "file-read":
      return "文件读取";
    case "file-preview":
      return "文件预览";
    case "download-ticket":
      return "下载凭证";
    case "file-download":
      return "文件下载";
    case "mcp-call":
      return "MCP 调用";
    case "audit-export":
      return "审计导出";
    case "runtime-estimate":
    default:
      return "运行时长估算";
  }
}

export function billingCostBasisLabel(costBasis: BillingCostBasis) {
  return costBasis === "actual" ? "实际计量" : "预估计量";
}

export function billingSourceTone(source: BillingSource): "" | "active" | "warn" | "success" {
  switch (source) {
    case "mcp-call":
      return "active";
    case "runtime-estimate":
      return "success";
    case "audit-export":
    case "download-ticket":
      return "warn";
    case "file-download":
    case "file-preview":
    case "file-read":
      return "";
    case "run-message":
    case "run-upload":
    default:
      return "active";
  }
}
