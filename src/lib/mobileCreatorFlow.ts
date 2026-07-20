import type { CreatorReleaseGate, SessionProjectRecord } from "@lingban/contracts";

export type MobileCreatorProjectAction = {
  label: string;
  route: "run" | "draft" | "publish" | "none";
};

export function resolveMobileCreatorProjectAction(
  project: Pick<
    SessionProjectRecord,
    "status" | "sourceRunId" | "currentDraftId"
  >
): MobileCreatorProjectAction {
  if (
    project.status === "PUBLISHED" ||
    project.status === "PACKAGED" ||
    project.status === "SEALED"
  ) {
    return {
      label: project.status === "PUBLISHED" ? "查看发布" : "继续封装发布",
      route: "publish",
    };
  }
  if (project.currentDraftId) {
    return { label: "继续固化", route: "draft" };
  }
  if (project.sourceRunId) {
    return {
      label: project.status === "CAPTURED" ? "等待草稿" : "继续对话",
      route: "run",
    };
  }
  return { label: "项目待启动", route: "none" };
}

export function hydrateCreatorPublishOperationKeys<
  T extends {
    packageIdempotencyKey?: string;
    releaseIdempotencyKey?: string;
  },
>(value: T, createOperationId: (prefix: string) => string) {
  return {
    ...value,
    packageIdempotencyKey:
      value.packageIdempotencyKey || createOperationId("creator-package"),
    releaseIdempotencyKey:
      value.releaseIdempotencyKey || createOperationId("creator-release"),
  };
}

export function areCreatorReleaseGatesPassed(
  gates: Pick<CreatorReleaseGate, "status">[] | null | undefined
) {
  return Boolean(gates?.length) &&
    gates!.every((gate) => gate.status === "passed" || gate.status === "waived");
}

export type MobileCreatorPublishStage =
  | "package"
  | "release"
  | "gates"
  | "activation"
  | "complete";

export function resolveMobileCreatorPublishStage(input: {
  packageReady: boolean;
  releaseReady: boolean;
  gatesPassed: boolean;
  active: boolean;
}): MobileCreatorPublishStage {
  if (input.active) return "complete";
  if (!input.packageReady) return "package";
  if (!input.releaseReady) return "release";
  if (!input.gatesPassed) return "gates";
  return "activation";
}
