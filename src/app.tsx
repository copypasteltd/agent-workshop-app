import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useLaunch } from "@tarojs/taro";
import type { PropsWithChildren } from "react";
import { useEffect, useMemo } from "react";
import { getWorkspaceEntry } from "./data/workspaceCatalog";
import { applyMobileTheme } from "./lib/theme";
import { useMobileUiStore } from "./stores/mobileUiStore";
import "./app.css";

function App({ children }: PropsWithChildren) {
  const theme = useMobileUiStore((state) => state.theme);
  const currentWorkspaceId = useMobileUiStore((state) => state.currentWorkspaceId);
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

    const currentWorkspace = getWorkspaceEntry(currentWorkspaceId);

    document.title = `${currentWorkspace.name} / 灵办词元`;
    document.body.dataset.theme = theme;
    applyMobileTheme(theme);
  }, [currentWorkspaceId, theme]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

export default App;
