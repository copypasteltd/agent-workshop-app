import type { BillingSource } from "@lingban/contracts";

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
    ? value.toLocaleString("en-US")
    : value.toLocaleString("en-US", {
        maximumFractionDigits: 4,
      });
}

export function billingSourceLabel(source: BillingSource) {
  switch (source) {
    case "run-message":
      return "Run message";
    case "run-upload":
      return "Run upload";
    case "file-read":
      return "File read";
    case "file-preview":
      return "File preview";
    case "download-ticket":
      return "Download ticket";
    case "file-download":
      return "Direct download";
    case "mcp-call":
      return "MCP call";
    case "audit-export":
      return "Audit export";
    case "runtime-estimate":
    default:
      return "Runtime estimate";
  }
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
