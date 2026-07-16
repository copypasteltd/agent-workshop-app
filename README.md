# 灵办词元移动端 / Lingban Mobile App

灵办词元面向轻度用户的移动入口。当前首发形态为 H5，后续在同一套 Taro 工程上完成微信小程序与支付宝小程序特化。

Lingban Mobile is the lightweight client for end users. H5 is the first delivery target; WeChat Mini Program and Alipay Mini Program specialization will follow on the same Taro codebase.

## 仓库信息 / Repository

| 项目 | 内容 |
| --- | --- |
| GitHub | `git@github.com:copypasteltd/agent-workshop-app.git` |
| Monorepo 路径 | `app/mobile` |
| 主分支 | `main` |
| 技术栈 | Taro 4.2、React 18、TypeScript、TanStack Query、Zustand |
| 当前交付目标 | Mobile H5 |
| 后续平台 | WeChat Mini Program、Alipay Mini Program |

This component consumes internal `workspace:*` packages. Development in the source monorepo requires the repository root workspace. Release automation exports the component together with its complete internal dependency closure.

## 产品流程 / Product Flow

1. 用户在工坊中发现可复用的业务工作流并查看服务详情。
2. 用户绑定账户级 Provider、MCP 与凭证，随后实例化服务。
3. 系统在首条用户消息前引导 Codex 询问本次执行所需信息。
4. 用户在任务详情中持续对话、上传材料、处理审批并查看进度。
5. 用户在任务文件页浏览 target path、切换路径、预览或下载产物。

1. Discover a reusable workflow in the Workshop catalog.
2. Bind account-level providers, MCP connections, and credentials, then instantiate the service.
3. Let Codex request run-specific information before the first user message.
4. Continue the full conversation, upload inputs, handle approvals, and monitor progress.
5. Browse the target path and preview or download generated artifacts.

## 页面结构 / Page Map

| 页面 | 职责 |
| --- | --- |
| `pages/workshops/index` | 工坊发现、搜索、分类、收藏与最近使用 |
| `pages/workshops/detail` | 工坊详情、服务集合与能力说明 |
| `pages/services/detail` | 服务详情、Provider 路由、账户授权与启动入口 |
| `pages/tasks/index` | 多任务列表、状态/标签筛选、搜索与任务入口 |
| `pages/tasks/detail` | 完整 Codex 对话、信息收集、附件、审批、实时状态与结果卡片 |
| `pages/tasks/files` | target path 文件树、路径输入、路径切换、预览与下载 |
| `pages/me/index` | 工作区切换、账户资料、主题、语言、授权、资产与配额摘要 |

底部导航固定为 `工坊 / 任务 / 我的`。文件能力归属于具体任务详情，避免增加独立文件 Tab。

The bottom navigation is fixed to `Workshop / Tasks / Me`. File access remains scoped to an individual task.

## 工程结构 / Code Structure

| 路径 | 作用 |
| --- | --- |
| `src/app.tsx` | QueryClient、认证启动、主题与 Taro TabBar 同步 |
| `src/app.config.ts` | 页面注册、窗口配置与多端 TabBar 资源 |
| `src/components/MobileAuthGate.tsx` | 会话恢复与认证门面 |
| `src/components/MobileAuthScreen.tsx` | 登录、注册与认证错误反馈 |
| `src/lib/api.ts` | API SDK、Token 刷新、Provider 接口与 API 地址解析 |
| `src/lib/runStream.ts` | WebSocket/SSE 运行事件订阅 |
| `src/lib/useMobileWorkspace.ts` | 当前工作区读取与切换 |
| `src/stores/` | 认证状态、主题、语言与本地 UI 状态 |
| `src/assets/` | 品牌 Logo、TabBar 图标与内容图片 |
| `src/pages/` | 工坊、服务、任务、文件与个人中心页面 |

## API 地址解析 / API Resolution

H5 按以下优先级确定 API 地址：

1. `window.__LINGBAN_RUNTIME_CONFIG__.apiBaseUrl`
2. `TARO_APP_API_BASE_URL`
3. 浏览器运行地址推导：本机使用 `:3100`，部署端口 `38120` 映射到同主机 `:38130`
4. 同源地址

H5 resolves the API base URL from runtime configuration, build-time environment variables, known deployment ports, and finally the current origin.

```env
TARO_APP_API_BASE_URL=http://127.0.0.1:3100
```

## 开发与验证 / Development

在 monorepo 根目录执行：

```bash
pnpm install
pnpm -C app/mobile typecheck
pnpm -C app/mobile dev:h5
pnpm -C app/mobile build:h5
pnpm -C app/mobile build:weapp
pnpm -C app/mobile build:alipay
```

Standalone workspace exports expose the same commands from their generated root package.

## 交互约束 / Interaction Rules

- 任务初始化仅注入账户级 Provider、MCP、Skill 与凭证绑定。
- 本次任务的材料、参数与目标由 Codex 在完整对话中动态收集。
- 任务详情顶部摘要支持折叠，主要视区持续承载对话。
- 任务、文件与审批均使用真实 API 和实时事件流。
- 明暗主题同步页面背景、导航栏、TabBar 与系统色彩。
- H5 以 375 设计宽度构建；小程序仍使用 750 设计宽度。
- 登录态恢复完成前隐藏业务 TabBar，防止认证页和主导航叠加。

## Session Capture / Session Capture

The task conversation page provides a bottom sheet for Terminal and completed-turn Checkpoint capture. It submits safe workspace selection defaults, polls progress, restores state after reload, exposes retry for failed captures, and deep-links completed captures to the Creator workbench.

Session Capture does not add a bottom navigation tab. The product navigation remains `工坊 / 任务 / 我的`, and the task detail remains a full Codex conversation surface.

## 当前状态 / Current Status

截至 2026-07-17，H5 已接入认证、工作区、工坊、服务、任务、实时对话、上传、文件、审批、Provider 选择、配额摘要、Session Capture 与个人中心主链。生产构建已完成移动端布局、明暗主题、TabBar 资源与认证滚动修复。

As of 2026-07-17, the H5 client covers authentication, workspaces, workshops, services, tasks, realtime conversations, uploads, files, approvals, provider selection, quota summaries, Session Capture, and account views.

| 验证项 | 结果 |
| --- | --- |
| TypeScript | 通过 |
| H5 production build | 通过 |
| Playwright Dashboard/Admin/H5 E2E | 32/32 通过 |
| Mobile 页面状态视觉检查 | 14/14 通过 |
| 当前验收地址 | `http://192.168.31.20:38120/` |

微信与支付宝小程序的端侧登录、授权、文件 API、支付能力和审核配置仍需按平台完成专项接入。

Platform-specific login, authorization, file APIs, payment capabilities, and review configuration remain for the mini-program targets.
