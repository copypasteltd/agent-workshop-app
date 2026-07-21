import Taro, {
  useDidShow,
  useShareAppMessage,
  useShareTimeline,
} from "@tarojs/taro";
import { mobileLogoSource } from "./mobileAssets";

const pendingShareRouteStorageKey = "lingban:mobile:pending-share-route";
const shareableRoutes = new Set([
  "/pages/workshops/index",
  "/pages/workshops/detail",
  "/pages/services/detail",
]);

type MobileShareQuery = Record<string, string | null | undefined>;

type MobileShareOptions = {
  title: string;
  route: string;
  query?: MobileShareQuery;
  timelineTitle?: string;
};

type PendingMobileShareRoute = {
  route: string;
  id?: string;
};

export const mobileNativeShareEnabled = process.env.TARO_ENV === "weapp";

function normalizeRoute(route: string) {
  const normalized = route.startsWith("/") ? route : `/${route}`;
  return normalized.split("?", 1)[0];
}

export function buildMobileShareQuery(query: MobileShareQuery = {}) {
  return Object.entries(query)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}

export function buildMobileSharePath(route: string, query: MobileShareQuery = {}) {
  const normalizedRoute = normalizeRoute(route);
  const queryString = buildMobileShareQuery(query);
  return queryString ? `${normalizedRoute}?${queryString}` : normalizedRoute;
}

export function useMobileShare(options: MobileShareOptions) {
  const queryString = buildMobileShareQuery(options.query);
  const path = buildMobileSharePath(options.route, options.query);

  useShareAppMessage(() => ({
    title: options.title,
    path,
    imageUrl: mobileLogoSource,
  }));

  useShareTimeline(() => ({
    title: options.timelineTitle ?? options.title,
    query: queryString,
    imageUrl: mobileLogoSource,
  }));

  useDidShow(() => {
    if (!mobileNativeShareEnabled) {
      return;
    }

    void Taro.showShareMenu({
      withShareTicket: false,
      showShareItems: ["shareAppMessage", "shareTimeline"],
    }).catch((error) => {
      console.warn("[mobile-share] Failed to expose the WeChat share menu.", error);
    });
  });
}

export function useMobileShareDisabled() {
  useDidShow(() => {
    if (!mobileNativeShareEnabled) {
      return;
    }

    void Taro.hideShareMenu({
      menus: ["shareAppMessage", "shareTimeline"],
    }).catch((error) => {
      console.warn("[mobile-share] Failed to hide sharing on a private page.", error);
    });
  });
}

export function rememberPendingMobileShareRoute(
  route: string,
  params: Partial<Record<string, string>> = {}
) {
  const normalizedRoute = normalizeRoute(route);
  if (!shareableRoutes.has(normalizedRoute)) {
    return;
  }

  const pendingRoute: PendingMobileShareRoute = {
    route: normalizedRoute,
    ...(typeof params.id === "string" && params.id.trim().length > 0
      ? { id: params.id.trim() }
      : {}),
  };

  if (normalizedRoute !== "/pages/workshops/index" && !pendingRoute.id) {
    return;
  }

  Taro.setStorageSync(pendingShareRouteStorageKey, pendingRoute);
}

export function consumePendingMobileShareRoute() {
  const stored = Taro.getStorageSync<PendingMobileShareRoute | null>(
    pendingShareRouteStorageKey
  );
  Taro.removeStorageSync(pendingShareRouteStorageKey);

  if (!stored || typeof stored !== "object") {
    return null;
  }

  const route = normalizeRoute(stored.route ?? "");
  if (!shareableRoutes.has(route)) {
    return null;
  }

  if (route === "/pages/workshops/index") {
    return route;
  }

  if (typeof stored.id !== "string" || stored.id.trim().length === 0) {
    return null;
  }

  return buildMobileSharePath(route, { id: stored.id.trim() });
}
