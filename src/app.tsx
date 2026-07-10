import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useLaunch } from "@tarojs/taro";
import type { PropsWithChildren } from "react";
import { useEffect, useMemo } from "react";
import { MobileAuthGate } from "./components/MobileAuthGate";
import { applyMobileTheme } from "./lib/theme";
import { useResolvedMobileWorkspace } from "./lib/useMobileWorkspace";
import { useMobileAuthStore } from "./stores/mobileAuthStore";
import { useMobileUiStore } from "./stores/mobileUiStore";
import "./app.css";

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
  }, [authMode, authenticated, currentWorkspace.name, theme]);

  return (
    <QueryClientProvider client={queryClient}>
      <MobileAuthGate>{children}</MobileAuthGate>
    </QueryClientProvider>
  );
}

export default App;
