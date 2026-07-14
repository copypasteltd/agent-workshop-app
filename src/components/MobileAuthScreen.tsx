import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Image, Input, View } from "@tarojs/components";
import logoMark from "../assets/logo-ui.png";
import { mobileAuthApi } from "../lib/api";
import { useMobileAuthStore } from "../stores/mobileAuthStore";
import { useMobileUiStore } from "../stores/mobileUiStore";

type AuthMode = "login" | "register";

type AuthFormState = {
  displayName: string;
  workspaceName: string;
  email: string;
  password: string;
};

const initialFormState: AuthFormState = {
  displayName: "",
  workspaceName: "",
  email: "",
  password: "",
};

export function MobileAuthScreen() {
  const theme = useMobileUiStore((state) => state.theme);
  const setCurrentWorkspaceId = useMobileUiStore(
    (state) => state.setCurrentWorkspaceId
  );
  const bootstrapError = useMobileAuthStore((state) => state.lastError);
  const applySessionResponse = useMobileAuthStore(
    (state) => state.applySessionResponse
  );
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<AuthMode>("login");
  const [form, setForm] = useState<AuthFormState>(initialFormState);

  const authMutation = useMutation({
    mutationFn: async () => {
      if (mode === "register") {
        return mobileAuthApi.register({
          email: form.email.trim(),
          password: form.password,
          displayName: form.displayName.trim(),
          workspaceName: form.workspaceName.trim() || undefined,
        });
      }

      return mobileAuthApi.login({
        email: form.email.trim(),
        password: form.password,
      });
    },
    onSuccess: async (response) => {
      applySessionResponse(response);
      setCurrentWorkspaceId(response.currentWorkspace.workspaceId);
      await queryClient.removeQueries({
        queryKey: ["mobile"],
      });
    },
  });

  const disabled = useMemo(() => {
    if (!form.email.trim() || !form.password) {
      return true;
    }

    if (mode === "register") {
      return form.displayName.trim().length === 0 || form.password.length < 12;
    }

    return false;
  }, [form.displayName, form.email, form.password, mode]);

  const errorText =
    authMutation.error instanceof Error
      ? authMutation.error.message
      : bootstrapError;

  return (
    <View className="auth-screen-overlay">
      <View className="page-shell auth-screen-shell">
        <View className="page auth-screen-page active">
          <View className="hero-card auth-screen-card">
            <View className="card-row">
              <View className="brand-row">
                <View className="brand-mark auth-brand-mark">
                  <Image src={logoMark} mode="aspectFit" />
                </View>
                <View>
                  <View className="page-eyebrow">灵办词元 / 账户登录</View>
                  <View className="section-title">进入你的当前空间</View>
                  <View className="section-copy">
                    登录后即可在 H5 中直接启动实例、持续对话、浏览任务文件，并切换到你的个人或企业工作区。
                  </View>
                </View>
              </View>
              <Button className="pill" onClick={() => useMobileUiStore.getState().toggleTheme()}>
                {theme === "dark" ? "深色" : "浅色"}
              </Button>
            </View>

            <View className="pill-row auth-toggle-row">
              <Button
                className={`task-chip ${mode === "login" ? "active" : ""}`}
                onClick={() => setMode("login")}
              >
                登录
              </Button>
              <Button
                className={`task-chip ${mode === "register" ? "active" : ""}`}
                onClick={() => setMode("register")}
              >
                注册
              </Button>
            </View>

            {mode === "register" ? (
              <>
                <View className="search-bar">
                  <Input
                    className="search-input"
                    value={form.displayName}
                    placeholder="显示名称，例如：内容运营组 / 张宁"
                    onInput={(event) =>
                      setForm((current) => ({
                        ...current,
                        displayName: event.detail.value,
                      }))
                    }
                  />
                </View>
                <View className="search-bar">
                  <Input
                    className="search-input"
                    value={form.workspaceName}
                    placeholder="个人工作区名称，可留空自动生成"
                    onInput={(event) =>
                      setForm((current) => ({
                        ...current,
                        workspaceName: event.detail.value,
                      }))
                    }
                  />
                </View>
              </>
            ) : null}

            <View className="search-bar">
              <Input
                className="search-input"
                type="text"
                value={form.email}
                placeholder="邮箱"
                onInput={(event) =>
                  setForm((current) => ({
                    ...current,
                    email: event.detail.value,
                  }))
                }
              />
            </View>
            <View className="search-bar">
              <Input
                className="search-input"
                password
                value={form.password}
                placeholder={mode === "register" ? "密码，至少 12 位" : "密码"}
                onInput={(event) =>
                  setForm((current) => ({
                    ...current,
                    password: event.detail.value,
                  }))
                }
              />
            </View>

            {errorText ? <View className="auth-error-banner">{errorText}</View> : null}

            <Button
              className="auth-submit-btn"
              disabled={disabled || authMutation.isPending}
              onClick={() => authMutation.mutate()}
            >
              {authMutation.isPending
                ? "处理中"
                : mode === "register"
                  ? "创建工作区并进入"
                  : "进入灵办词元"}
            </Button>
          </View>

          <View className="profile-grid auth-helper-grid">
            {[
              {
                title: "实例隔离",
                note: "每个任务实例进入独立运行环境，关闭后自动销毁。",
              },
              {
                title: "完整对话",
                note: "任务运行期间可以持续追问、补材料、继续给 Codex 下指令。",
              },
              {
                title: "文件边界",
                note: "结果文件、下载路径和工作目录全部受当前工作区控制。",
              },
            ].map((item) => (
              <View className="mini-card auth-helper-card" key={item.title}>
                <View className="page-eyebrow">{item.title}</View>
                <View className="muted">{item.note}</View>
              </View>
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}
