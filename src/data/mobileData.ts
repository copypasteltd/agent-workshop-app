export type MobileTask = {
  id: string;
  workspaceId?: string;
  title: string;
  workshop: string;
  status: "running" | "approval" | "done" | "failed" | "cancelled";
  statusLabel: string;
  statusClass: string;
  updatedAt: string;
  summary: string;
  tags: string[];
  targetPath: string;
  runRef: string;
  stage: string;
  eta: string;
  approvals: number;
  objective: string;
  runtimeSummary: string;
  providerSummary: string;
  messages: MobileTaskMessage[];
  files: Array<{ name: string; path: string; meta: string; status: string; helper: string }>;
  pathOptions: Array<{ label: string; path: string; helper: string }>;
};

export type MobileTaskMessageModule = {
  type: "approval" | "file" | "result" | "error";
  title: string;
  summary: string;
  status: string;
  items?: string[];
  primaryAction?: string;
  primaryDraft?: string;
  secondaryAction?: string;
  secondaryDraft?: string;
};

export type MobileTaskMessage = {
  role: string;
  time: string;
  body: string;
  kind: "system" | "user" | "agent";
  attachments?: Array<{ label: string; path: string }>;
  module?: MobileTaskMessageModule;
};

export type MobileWorkshop = {
  id: string;
  name: string;
  owner: string;
  description: string;
  badge: string;
};

export type MobileService = {
  id: string;
  workshopId: string;
  name: string;
  summary: string;
  auth: string;
  eta: string;
  outputSummary?: string;
  targetPathHint?: string;
  launchMode?: "instant-conversation" | "form-first" | "approval-first";
  requiredFirstPartyMcpIds?: string[];
  externalConnectorRefs?: string[];
  credentialIds?: string[];
};
