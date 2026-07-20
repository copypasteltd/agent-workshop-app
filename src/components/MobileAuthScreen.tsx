import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Image, Input, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { mobileApiConfigured, mobileAuthApi } from "../lib/api";
import { mobileLogoSource } from "../lib/mobileAssets";
import { useMobileAuthStore } from "../stores/mobileAuthStore";
import { useMobileUiStore } from "../stores/mobileUiStore";
import { MobilePageShell } from "./MobilePageShell";

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

const isWechatMiniProgram = process.env.TARO_ENV === "weapp";

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

  const applyAuthenticatedSession = async (
    response: Awaited<ReturnType<typeof mobileAuthApi.login>>
  ) => {
    applySessionResponse(response);
    setCurrentWorkspaceId(response.currentWorkspace.workspaceId);
    await queryClient.removeQueries({
      queryKey: ["mobile"],
    });
    await Taro.switchTab({ url: "/pages/workshops/index" });
    await Taro.showTabBar({ animation: false });
  };

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
    onSuccess: applyAuthenticatedSession,
  });

  const wechatAuthMutation = useMutation({
    mutationFn: async () => {
      if (!mobileApiConfigured) {
        throw new Error("小程序服务地址尚未配置");
      }

      let loginResult: Taro.login.SuccessCallbackResult;
      try {
        loginResult = await Taro.login({ timeout: 10_000 });
      } catch (error) {
        console.error("[wechat-auth] Failed to obtain a WeChat login code.", error);
        throw error;
      }
      if (!loginResult.code) {
        throw new Error("微信未返回有效登录凭证");
      }

      try {
        return await mobileAuthApi.loginWithWechatMiniProgram({
          code: loginResult.code,
        });
      } catch (error) {
        console.error("[wechat-auth] Failed to exchange the WeChat login code.", error);
        throw error;
      }
    },
    onSuccess: applyAuthenticatedSession,
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
    wechatAuthMutation.error instanceof Error
      ? wechatAuthMutation.error.message
      : authMutation.error instanceof Error
      ? authMutation.error.message
      : bootstrapError;

  return (
    <View className={`auth-screen-overlay theme-${theme}`}>
      <MobilePageShell className="auth-screen-shell">
        <View className="page auth-screen-page active">
          <View className="hero-card auth-screen-card">
            <View className="auth-brand-row">
              <View className="brand-row">
                <View className="brand-mark auth-brand-mark">
                  <Image
                    className="brand-logo-image"
                    src={mobileLogoSource}
                    mode="aspectFit"
                    style={{ width: "100%", height: "100%" }}
                  />
                </View>
                <View>
                  <View className="page-eyebrow">灵办词元</View>
                  <View className="auth-product-line">Agent 工作流工坊</View>
                </View>
              </View>
              <Button
                className="auth-theme-button"
                data-testid="mobile-auth-theme-toggle"
                aria-label={theme === "dark" ? "切换浅色模式" : "切换深色模式"}
                onClick={() => useMobileUiStore.getState().toggleTheme()}
              >
                {theme === "dark" ? "☀" : "☾"}
              </Button>
            </View>

            {isWechatMiniProgram ? (
              <>
                <View className="auth-heading-block">
                  <View className="auth-title">进入你的 Agent 工作台</View>
                  <View className="section-copy">
                    浏览工坊、启动云端实例，并在任务对话中持续补充信息和接收文件。
                  </View>
                </View>
                <Button
                  className="wechat-login-btn"
                  data-testid="mobile-wechat-login"
                  disabled={
                    !mobileApiConfigured ||
                    wechatAuthMutation.isPending ||
                    authMutation.isPending
                  }
                  onClick={() => wechatAuthMutation.mutate()}
                >
                  <View className="wechat-login-mark" aria-hidden>
                    <View className="wechat-bubble primary" />
                    <View className="wechat-bubble secondary" />
                  </View>
                  {wechatAuthMutation.isPending ? "微信登录中" : "微信登录"}
                </Button>
                <View className="auth-login-note">
                  登录即表示同意平台服务协议与隐私规则。账户将自动进入对应的个人或企业工作区。
                </View>
                {errorText ? <View className="auth-error-banner">{errorText}</View> : null}
              </>
            ) : (
              <>
                <View className="auth-heading-block">
                  <View className="auth-title">进入你的 Agent 工作台</View>
                  <View className="section-copy">
                    启动实例、持续对话、浏览任务文件，并切换个人或企业工作区。
                  </View>
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
                        placeholder="显示名称"
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
                        placeholder="个人工作区名称，可留空"
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
              </>
            )}
          </View>

          <View className="auth-capability-list">
            {[
              {
                title: "独立实例",
                note: "每个任务使用隔离的运行环境",
              },
              {
                title: "持续对话",
                note: "随时追问、补充材料和确认操作",
              },
              {
                title: "文件可见",
                note: "结果文件归档在当前工作区",
              },
            ].map((item) => (
              <View className="auth-capability-row" key={item.title}>
                <View className="auth-capability-dot" />
                <View>
                  <View className="auth-capability-title">{item.title}</View>
                  <View className="auth-capability-note">{item.note}</View>
                </View>
              </View>
            ))}
          </View>
        </View>
      </MobilePageShell>
    </View>
  );
}
