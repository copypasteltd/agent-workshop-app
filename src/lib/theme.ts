import { lingbanThemeVars } from "@lingban/ui-tokens";

export type MobileThemeMode = keyof typeof lingbanThemeVars.mobile;

export function applyMobileTheme(theme: MobileThemeMode) {
  if (typeof document === "undefined") {
    return;
  }

  const vars = lingbanThemeVars.mobile[theme] as Record<string, string>;
  for (const [token, value] of Object.entries(vars)) {
    document.body.style.setProperty(`--${token}`, value);
  }
}
