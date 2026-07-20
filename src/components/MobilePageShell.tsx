import type { PropsWithChildren } from "react";
import { View } from "@tarojs/components";
import { useMobileUiStore } from "../stores/mobileUiStore";

type MobilePageShellProps = PropsWithChildren<{
  className?: string;
}>;

export function MobilePageShell({ children, className }: MobilePageShellProps) {
  const classes = useMobilePageShellClass(className);

  return <View className={classes}>{children}</View>;
}

export function useMobilePageShellClass(className?: string) {
  const theme = useMobileUiStore((state) => state.theme);

  return ["page-shell", "mobile-theme-root", `theme-${theme}`, className]
    .filter(Boolean)
    .join(" ");
}
