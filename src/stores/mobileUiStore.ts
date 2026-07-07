import Taro from "@tarojs/taro";
import { create } from "zustand";

type Theme = "dark" | "light";

const THEME_STORAGE_KEY = "lingban.mobile.theme";
const WORKSPACE_STORAGE_KEY = "lingban.mobile.workspace";
const TASK_DRAFTS_STORAGE_KEY = "lingban.mobile.taskDrafts";

function readStorage(key: string) {
  try {
    const value = Taro.getStorageSync<string>(key);
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  } catch {
    if (typeof window !== "undefined") {
      const fallback = window.localStorage.getItem(key);
      if (fallback) {
        return fallback;
      }
    }
  }

  return null;
}

function writeStorage(key: string, value: string) {
  try {
    Taro.setStorageSync(key, value);
  } catch {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(key, value);
    }
  }
}

function readJsonStorage<T>(key: string, fallback: T): T {
  const raw = readStorage(key);
  if (!raw) {
    return fallback;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function getInitialTheme(): Theme {
  return readStorage(THEME_STORAGE_KEY) === "light" ? "light" : "dark";
}

function getInitialWorkspaceId() {
  return readStorage(WORKSPACE_STORAGE_KEY) ?? "harbor-finance";
}

function getInitialTaskDrafts() {
  return readJsonStorage<Record<string, string>>(TASK_DRAFTS_STORAGE_KEY, {});
}

type MobileUiState = {
  theme: Theme;
  currentWorkspaceId: string;
  workspaceSheetOpen: boolean;
  taskDrafts: Record<string, string>;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setCurrentWorkspaceId: (id: string) => void;
  setWorkspaceSheetOpen: (open: boolean) => void;
  setTaskDraft: (taskId: string, draft: string) => void;
  clearTaskDraft: (taskId: string) => void;
};

export const useMobileUiStore = create<MobileUiState>((set) => ({
  theme: getInitialTheme(),
  currentWorkspaceId: getInitialWorkspaceId(),
  workspaceSheetOpen: false,
  taskDrafts: getInitialTaskDrafts(),
  setTheme: (theme) => {
    writeStorage(THEME_STORAGE_KEY, theme);
    set({ theme });
  },
  toggleTheme: () =>
    set((state) => {
      const nextTheme = state.theme === "dark" ? "light" : "dark";
      writeStorage(THEME_STORAGE_KEY, nextTheme);
      return { theme: nextTheme };
    }),
  setCurrentWorkspaceId: (currentWorkspaceId) => {
    writeStorage(WORKSPACE_STORAGE_KEY, currentWorkspaceId);
    set({ currentWorkspaceId });
  },
  setWorkspaceSheetOpen: (workspaceSheetOpen) => set({ workspaceSheetOpen }),
  setTaskDraft: (taskId, draft) =>
    set((state) => {
      const nextDrafts = {
        ...state.taskDrafts,
        [taskId]: draft,
      };
      writeStorage(TASK_DRAFTS_STORAGE_KEY, JSON.stringify(nextDrafts));
      return { taskDrafts: nextDrafts };
    }),
  clearTaskDraft: (taskId) =>
    set((state) => {
      const nextDrafts = { ...state.taskDrafts };
      delete nextDrafts[taskId];
      writeStorage(TASK_DRAFTS_STORAGE_KEY, JSON.stringify(nextDrafts));
      return { taskDrafts: nextDrafts };
    }),
}));
