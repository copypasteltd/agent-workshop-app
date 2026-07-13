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
import {
  listProvidersQuerySchema,
  listWorkspaceProviderBindingsQuerySchema,
  providerProfileSchema,
  workspaceProviderBindingSchema,
  type ListProvidersQuery,
  type ListWorkspaceProviderBindingsQuery,
  type ProviderProfile,
  type WorkspaceProviderBinding,
} from "@lingban/contracts";
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

async function requestMobileJson(input: {
  path: string;
  method?: string;
  body?: unknown;
}) {
  const response = await mobileAuthFetch(new URL(input.path, mobileApiBaseUrl), {
    method: input.method ?? "GET",
    headers: input.body ? { "content-type": "application/json" } : undefined,
    body: input.body ? JSON.stringify(input.body) : undefined,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `Request failed: ${response.status}`);
  }

  return text ? JSON.parse(text) : null;
}

function buildQueryString(query?: Record<string, string | boolean | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined) {
      continue;
    }
    search.set(key, String(value));
  }

  const raw = search.toString();
  return raw.length > 0 ? `?${raw}` : "";
}

export const mobileProvidersApi = {
  async listProviders(query?: ListProvidersQuery) {
    const parsed = listProvidersQuerySchema.parse(query ?? {});
    const result = await requestMobileJson({
      path: `/v1/providers${buildQueryString({
        enabled: parsed.enabled,
      })}`,
    });
    return providerProfileSchema.array().parse(result) as ProviderProfile[];
  },
  async listBindings(query?: ListWorkspaceProviderBindingsQuery) {
    const parsed = listWorkspaceProviderBindingsQuerySchema.parse(query ?? {});
    const result = await requestMobileJson({
      path: `/v1/provider-bindings${buildQueryString({
        providerId: parsed.providerId,
        enabled: parsed.enabled,
      })}`,
    });
    return workspaceProviderBindingSchema.array().parse(result) as WorkspaceProviderBinding[];
  },
};

export function requestMobileRunFileDownloadUrl(runId: string, filePath: string) {
  return getRunFileDownloadUrl(mobileRunsApi, mobileApiBaseUrl, runId, filePath);
}
