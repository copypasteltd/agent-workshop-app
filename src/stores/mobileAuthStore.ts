import Taro from "@tarojs/taro";
import type {
  AuthSessionEnvelope,
  AuthSessionResponse,
  AuthTokenPair,
} from "@lingban/contracts";
import { create } from "zustand";

type MobileAuthMode = "unknown" | "disabled" | "required";

type PersistedMobileAuthState = {
  tokens: AuthTokenPair | null;
  user: AuthSessionEnvelope["user"] | null;
  session: AuthSessionEnvelope["session"] | null;
  currentWorkspace: AuthSessionEnvelope["currentWorkspace"] | null;
  workspaces: AuthSessionEnvelope["workspaces"];
};

type MobileAuthState = PersistedMobileAuthState & {
  authMode: MobileAuthMode;
  authenticated: boolean;
  bootstrapping: boolean;
  lastError: string | null;
  setAuthMode: (authMode: MobileAuthMode) => void;
  setBootstrapping: (bootstrapping: boolean) => void;
  setLastError: (lastError: string | null) => void;
  applySessionResponse: (response: AuthSessionResponse) => void;
  applySessionEnvelope: (envelope: AuthSessionEnvelope) => void;
  clearAuth: (lastError?: string | null) => void;
};

const AUTH_STORAGE_KEY = "lingban.mobile.auth";

const EMPTY_AUTH_STATE: PersistedMobileAuthState = {
  tokens: null,
  user: null,
  session: null,
  currentWorkspace: null,
  workspaces: [],
};

function readStorage(key: string) {
  try {
    const value = Taro.getStorageSync<string>(key);
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  } catch {
    if (typeof window !== "undefined") {
      return window.localStorage.getItem(key);
    }
  }

  return null;
}

function writeStorage(key: string, value: string) {
  try {
    Taro.setStorageSync(key, value);
    return;
  } catch {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(key, value);
    }
  }
}

function removeStorage(key: string) {
  try {
    Taro.removeStorageSync(key);
    return;
  } catch {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(key);
    }
  }
}

function readPersistedState(): PersistedMobileAuthState {
  const raw = readStorage(AUTH_STORAGE_KEY);
  if (!raw) {
    return EMPTY_AUTH_STATE;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PersistedMobileAuthState>;
    return {
      tokens: parsed.tokens ?? null,
      user: parsed.user ?? null,
      session: parsed.session ?? null,
      currentWorkspace: parsed.currentWorkspace ?? null,
      workspaces: Array.isArray(parsed.workspaces) ? parsed.workspaces : [],
    };
  } catch {
    return EMPTY_AUTH_STATE;
  }
}

function toPersistedState(input: {
  tokens: AuthTokenPair | null;
  envelope: AuthSessionEnvelope;
}): PersistedMobileAuthState {
  return {
    tokens: input.tokens,
    user: input.envelope.user,
    session: input.envelope.session,
    currentWorkspace: input.envelope.currentWorkspace,
    workspaces: input.envelope.workspaces,
  };
}

const initialState = readPersistedState();

export const useMobileAuthStore = create<MobileAuthState>((set, get) => ({
  ...initialState,
  authMode: "unknown",
  authenticated: Boolean(initialState.tokens?.accessToken && initialState.session && initialState.user),
  bootstrapping: true,
  lastError: null,
  setAuthMode: (authMode) => set({ authMode }),
  setBootstrapping: (bootstrapping) => set({ bootstrapping }),
  setLastError: (lastError) => set({ lastError }),
  applySessionResponse: (response) => {
    const persisted = toPersistedState({
      tokens: response.tokens,
      envelope: response,
    });
    writeStorage(AUTH_STORAGE_KEY, JSON.stringify(persisted));
    set({
      ...persisted,
      authMode: "required",
      authenticated: true,
      bootstrapping: false,
      lastError: null,
    });
  },
  applySessionEnvelope: (envelope) => {
    const persisted = toPersistedState({
      tokens: get().tokens,
      envelope,
    });
    writeStorage(AUTH_STORAGE_KEY, JSON.stringify(persisted));
    set({
      ...persisted,
      authMode: "required",
      authenticated: Boolean(persisted.tokens?.accessToken),
      bootstrapping: false,
      lastError: null,
    });
  },
  clearAuth: (lastError = null) => {
    removeStorage(AUTH_STORAGE_KEY);
    set({
      ...EMPTY_AUTH_STATE,
      authenticated: false,
      bootstrapping: false,
      lastError,
    });
  },
}));

export type { MobileAuthMode };
