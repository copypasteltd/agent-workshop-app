export function mobileRunDetailQueryKey(runId: string) {
  return ["mobile", "runs", runId] as const;
}

export function mobileRunFilesQueryKey(runId: string) {
  return ["mobile", "runs", runId, "files"] as const;
}

export function mobileRunPreviewQueryKey(runId: string, filePath: string) {
  return ["mobile", "runs", runId, "files", "preview", filePath] as const;
}
