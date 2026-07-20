import type { NetworkMode } from "@tanstack/react-query";

export const MOBILE_REQUEST_TIMEOUT_MS = 20_000;

export function resolveMobileNetworkMode(taroEnv?: string): NetworkMode {
  // Taro.request owns connectivity detection in WeChat. React Query's browser
  // online manager can remain paused inside the mini-program WebView.
  return taroEnv === "weapp" ? "always" : "online";
}
