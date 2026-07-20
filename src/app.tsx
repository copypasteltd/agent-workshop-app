import "whatwg-fetch";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Taro, { useLaunch } from "@tarojs/taro";
import type { PropsWithChildren } from "react";
import { useEffect, useMemo } from "react";
import { MobileAuthGate } from "./components/MobileAuthGate";
import { applyMobileTheme } from "./lib/theme";
import { useResolvedMobileWorkspace } from "./lib/useMobileWorkspace";
import { useMobileAuthStore } from "./stores/mobileAuthStore";
import { useMobileUiStore } from "./stores/mobileUiStore";
import "./app.css";
import "./styles/task-detail.css";
import "./styles/creator.css";

function App({ children }: PropsWithChildren) {
  const theme = useMobileUiStore((state) => state.theme);
  const authMode = useMobileAuthStore((state) => state.authMode);
  const authenticated = useMobileAuthStore((state) => state.authenticated);
  const currentWorkspace = useResolvedMobileWorkspace();
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            staleTime: 30_000,
          },
        },
      }),
    []
  );

  useLaunch(() => {
    console.log("Lingban mobile launched.");
  });

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    document.title =
      authMode !== "disabled" && !authenticated
        ? "灵办词元 / 登录"
        : `${currentWorkspace.name} / 灵办词元`;
    document.body.dataset.theme = theme;
    applyMobileTheme(theme);

    const pages = Taro.getCurrentPages();
    const currentRoute = pages[pages.length - 1]?.route ?? "";
    const isTabBarPage = [
      "pages/workshops/index",
      "pages/tasks/index",
      "pages/me/index",
    ].includes(currentRoute);

    if (
      !isTabBarPage ||
      authMode === "unknown" ||
      (authMode === "required" && !authenticated)
    ) {
      return;
    }

    void Taro.setTabBarStyle(
      theme === "light"
        ? {
            color: "#657283",
            selectedColor: "#5366eb",
            backgroundColor: "#f4f7fb",
            borderStyle: "white",
          }
        : {
            color: "#8c98ad",
            selectedColor: "#c7ffd7",
            backgroundColor: "#0e1524",
            borderStyle: "black",
        }
    );
    if (authMode === "required" && !authenticated) {
      void Taro.hideTabBar({ animation: false });
    } else {
      void Taro.showTabBar({ animation: false });
    }
  }, [authMode, authenticated, currentWorkspace.name, theme]);

  return (
    <QueryClientProvider client={queryClient}>
      <MobileAuthGate>{children}</MobileAuthGate>
    </QueryClientProvider>
  );
}

export default App;
