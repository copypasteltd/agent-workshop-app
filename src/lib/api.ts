import {
  createAuthApiClient,
  createBillingApiClient,
  createCredentialsApiClient,
  createMeApiClient,
  createNotificationsApiClient,
  createQuotaApiClient,
  getRunFileDownloadUrl,
  createMcpGovernanceApiClient,
  createRunsApiClient,
  createSearchApiClient,
  createSessionRefreshFetch,
  createWorkshopCatalogApiClient,
} from "@lingban/api-sdk";
import { useMobileAuthStore } from "../stores/mobileAuthStore";

export const mobileApiBaseUrl =
  process.env.TARO_APP_API_BASE_URL?.trim() || "http://127.0.0.1:3100";

function getMobileAccessToken() {
  return useMobileAuthStore.getState().tokens?.accessToken;
}

function getMobileRefreshToken() {
  return useMobileAuthStore.getState().tokens?.refreshToken;
}

export const mobileAuthFetch = createSessionRefreshFetch({
  baseUrl: mobileApiBaseUrl,
  getAccessToken: getMobileAccessToken,
  getRefreshToken: getMobileRefreshToken,
  applySessionResponse(response) {
    useMobileAuthStore.getState().applySessionResponse(response);
  },
  onAuthFailure(error) {
    useMobileAuthStore
      .getState()
      .clearAuth(error instanceof Error ? error.message : "Mobile auth expired.");
  },
});

export const mobileAuthApi = createAuthApiClient({
  baseUrl: mobileApiBaseUrl,
  fetcher: mobileAuthFetch,
  getAccessToken: getMobileAccessToken,
});

export const mobileRunsApi = createRunsApiClient({
  baseUrl: mobileApiBaseUrl,
  fetcher: mobileAuthFetch,
  getAccessToken: getMobileAccessToken,
});

export const mobileCatalogApi = createWorkshopCatalogApiClient({
  baseUrl: mobileApiBaseUrl,
  fetcher: mobileAuthFetch,
  getAccessToken: getMobileAccessToken,
});

export const mobileSearchApi = createSearchApiClient({
  baseUrl: mobileApiBaseUrl,
  fetcher: mobileAuthFetch,
  getAccessToken: getMobileAccessToken,
});

export const mobileBillingApi = createBillingApiClient({
  baseUrl: mobileApiBaseUrl,
  fetcher: mobileAuthFetch,
  getAccessToken: getMobileAccessToken,
});

export const mobileMeApi = createMeApiClient({
  baseUrl: mobileApiBaseUrl,
  fetcher: mobileAuthFetch,
  getAccessToken: getMobileAccessToken,
});

export const mobileNotificationsApi = createNotificationsApiClient({
  baseUrl: mobileApiBaseUrl,
  fetcher: mobileAuthFetch,
  getAccessToken: getMobileAccessToken,
});

export const mobileCredentialsApi = createCredentialsApiClient({
  baseUrl: mobileApiBaseUrl,
  fetcher: mobileAuthFetch,
  getAccessToken: getMobileAccessToken,
});

export const mobileMcpApi = createMcpGovernanceApiClient({
  baseUrl: mobileApiBaseUrl,
  fetcher: mobileAuthFetch,
  getAccessToken: getMobileAccessToken,
});

export const mobileQuotaApi = createQuotaApiClient({
  baseUrl: mobileApiBaseUrl,
  fetcher: mobileAuthFetch,
  getAccessToken: getMobileAccessToken,
});

export function requestMobileRunFileDownloadUrl(runId: string, filePath: string) {
  return getRunFileDownloadUrl(mobileRunsApi, mobileApiBaseUrl, runId, filePath);
}
