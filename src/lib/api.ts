import { createRunsApiClient } from "@lingban/api-sdk";

export const mobileApiBaseUrl =
  process.env.TARO_APP_API_BASE_URL?.trim() || "http://127.0.0.1:3100";

export const mobileRunsApi = createRunsApiClient({
  baseUrl: mobileApiBaseUrl,
});

export function buildMobileRunFileDownloadUrl(runId: string, filePath: string) {
  return `${mobileApiBaseUrl}/v1/runs/${runId}/files/download?path=${encodeURIComponent(filePath)}`;
}
