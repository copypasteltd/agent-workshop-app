import type {
  QuotaCounter,
  QuotaEvent,
  QuotaEventDecision,
  QuotaMetric,
  QuotaOverrideRecord,
  QuotaOverrideStatus,
  QuotaPolicy,
  QuotaScopeType,
  QuotaWindowType,
} from "@lingban/contracts";

function formatCompactNumber(value: number) {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }

  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}k`;
  }

  return `${Math.round(value)}`;
}

function formatBytes(value: number) {
  if (value >= 1024 * 1024 * 1024) {
    return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }

  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (value >= 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${Math.round(value)} B`;
}

export function quotaMetricLabel(metric: QuotaMetric) {
  switch (metric) {
    case "active_runs":
      return "Active runs";
    case "daily_runs":
      return "Daily runs";
    case "browser_minutes":
      return "Browser minutes";
    case "model_tokens":
      return "Model tokens";
    case "image_credits":
      return "Image credits";
    case "mcp_calls":
      return "MCP calls";
    case "storage_bytes":
      return "Storage";
    case "download_bytes":
      return "Downloads";
    case "audit_exports":
      return "Audit exports";
    case "replays":
      return "Replays";
    case "ws_connections":
      return "WS connections";
    default:
      return metric;
  }
}

export function quotaWindowLabel(windowType: QuotaWindowType) {
  switch (windowType) {
    case "instant":
      return "Instant";
    case "daily":
      return "Daily";
    case "monthly":
      return "Monthly";
    default:
      return windowType;
  }
}

export function quotaScopeLabel(scopeType: QuotaScopeType) {
  switch (scopeType) {
    case "workspace":
      return "Workspace";
    case "workspace-context":
      return "Workspace context";
    case "service":
      return "Service";
    case "task-version":
      return "Task version";
    case "session-version":
      return "Session version";
    case "package":
      return "Creator package";
    case "entry-surface":
      return "Entry surface";
    case "user":
    default:
      return "User";
  }
}

export function quotaDecisionLabel(decision: QuotaEventDecision) {
  switch (decision) {
    case "healthy":
      return "Healthy";
    case "warned":
      return "Warned";
    case "blocked":
      return "Blocked";
    case "approval_pending":
      return "Approval pending";
    case "approved_override":
      return "Override approved";
    case "rejected_override":
      return "Override rejected";
    default:
      return decision;
  }
}

export function quotaOverrideStatusLabel(status: QuotaOverrideStatus) {
  switch (status) {
    case "pending":
      return "Pending";
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "expired":
      return "Expired";
    default:
      return status;
  }
}

export function quotaDecisionTone(decision: QuotaEventDecision | QuotaOverrideStatus) {
  switch (decision) {
    case "healthy":
    case "approved":
    case "approved_override":
      return "success";
    case "warned":
    case "approval_pending":
    case "pending":
    case "blocked":
    case "rejected":
    case "rejected_override":
    case "expired":
      return "warn";
    default:
      return "active";
  }
}

export function formatQuotaValue(metric: QuotaMetric, value: number) {
  switch (metric) {
    case "browser_minutes":
      return `${Math.round(value)} min`;
    case "storage_bytes":
    case "download_bytes":
      return formatBytes(value);
    case "model_tokens":
      return `${formatCompactNumber(value)} tok`;
    default:
      return formatCompactNumber(value);
  }
}

export function quotaUsageRatio(
  counter: Pick<QuotaCounter, "currentValue">,
  policy: Pick<QuotaPolicy, "limitValue">
) {
  if (policy.limitValue <= 0) {
    return 0;
  }

  return counter.currentValue / policy.limitValue;
}

export function describeQuotaUsage(
  counter: Pick<QuotaCounter, "metric" | "currentValue" | "windowType">,
  policy: Pick<QuotaPolicy, "limitValue">
) {
  return `${formatQuotaValue(counter.metric, counter.currentValue)} / ${formatQuotaValue(
    counter.metric,
    policy.limitValue
  )} · ${quotaWindowLabel(counter.windowType)}`;
}

export function summarizeQuotaOverride(
  overrideRecord: Pick<
    QuotaOverrideRecord,
    "metric" | "currentValue" | "limitValue" | "requestedDelta"
  >
) {
  return `${formatQuotaValue(overrideRecord.metric, overrideRecord.currentValue)} / ${formatQuotaValue(
    overrideRecord.metric,
    overrideRecord.limitValue
  )} + ${formatQuotaValue(overrideRecord.metric, overrideRecord.requestedDelta)}`;
}

export function latestQuotaEventNote(event: QuotaEvent | null | undefined) {
  if (!event) {
    return "";
  }

  return event.note?.trim() || `${quotaDecisionLabel(event.decision)} · ${formatQuotaValue(event.metric, event.currentValue)}`;
}
