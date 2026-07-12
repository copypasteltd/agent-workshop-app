import { createUseRunStream } from "@lingban/realtime";
import { mobileApiBaseUrl } from "./api";
import { mobileRunDetailQueryKey, mobileRunFilesQueryKey } from "./runQueryKeys";
import { useMobileAuthStore } from "../stores/mobileAuthStore";
export const useMobileRunStream = createUseRunStream({
  baseUrl: mobileApiBaseUrl,
  getAccessToken: () => useMobileAuthStore.getState().tokens?.accessToken,
  detailQueryKey: (runId) => mobileRunDetailQueryKey(runId),
  listQueryKey: ["mobile", "runs"],
  filesQueryKey: (runId) => mobileRunFilesQueryKey(runId),
});
