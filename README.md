# 灵办词元移动端 / Lingban Mobile App

灵办词元面向轻度用户的移动入口。H5 保持首发形态，微信小程序构建与微信登录链路已具备联调条件；支付宝小程序继续在同一套 Taro 工程上推进特化。

Lingban Mobile is the lightweight client for end users. H5 remains the first delivery target, while the WeChat Mini Program build and login flow are ready for credentialed integration testing on the same Taro codebase.

## 仓库信息 / Repository

| 项目 | 内容 |
| --- | --- |
| GitHub | `git@github.com:copypasteltd/agent-workshop-app.git` |
| Monorepo 路径 | `app/mobile` |
| 主分支 | `main` |
| 技术栈 | Taro 4.2、React 18、TypeScript、TanStack Query、Zustand |
| 当前交付目标 | Mobile H5、WeChat Mini Program |
| 微信小程序账号 | `灵办` / `wx4b21e9b9200dcf9b` |
| 后续平台 | Alipay Mini Program |

This component consumes internal `workspace:*` packages. Development in the source monorepo requires the repository root workspace. Release automation exports the component together with its complete internal dependency closure.

## 产品流程 / Product Flow

1. 用户在工坊中发现可复用的业务工作流并查看服务详情。
2. 用户绑定账户级 Provider、MCP 与凭证，随后实例化服务。
3. 系统在首条用户消息前引导 Codex 询问本次执行所需信息。
4. 用户在任务详情中持续对话、上传材料、处理审批并查看进度。
5. 用户在任务文件页浏览 target path、切换路径、预览或下载产物。
6. 用户可停止并释放运行实例，随后归档、恢复归档或永久销毁实例记录。

1. Discover a reusable workflow in the Workshop catalog.
2. Bind account-level providers, MCP connections, and credentials, then instantiate the service.
3. Let Codex request run-specific information before the first user message.
4. Continue the full conversation, upload inputs, handle approvals, and monitor progress.
5. Browse the target path and preview or download generated artifacts.
6. Stop and release a run, then archive, restore, or permanently delete its record.

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

## 实例生命周期 / Run Lifecycle

- 任务列表和任务详情均提供“管理”入口。
- 活动实例支持停止并释放；停止期间禁用消息、附件和审批。
- 终态实例显示 Runtime 释放状态，并可继续查看消息与文件。
- 已释放实例支持归档、恢复和永久删除；销毁失败会显示诊断并允许重试。
- 未完成的 Session Capture 会阻止永久删除，避免固化资产损坏。
- 输入区保持可折叠，终态时替换为生命周期操作区。

Task list and conversation detail surfaces expose the same lifecycle operations. Capture gates protect reusable Session evidence, and terminal runs remain readable after runtime release.

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
TARO_APP_API_BASE_URL=https://codex-miniapp.sidcloud.cn
```

微信小程序默认使用 `https://codex-miniapp.sidcloud.cn`。构建环境仍可通过 `TARO_APP_API_BASE_URL` 覆盖，并需在微信公众平台将 `https://codex-miniapp.sidcloud.cn` 配置为 `request` 合法域名。健康检查地址为 `https://codex-miniapp.sidcloud.cn/health`。

The WeChat Mini Program defaults to `https://codex-miniapp.sidcloud.cn`, with build-time override support through `TARO_APP_API_BASE_URL`.

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
- 对话流只渲染后端持久化消息；文件与审批分别使用对应 API 投影，不根据运行状态或文件名生成模拟消息。
- Dashboard 创建的 Creator Source Run 会进入同一任务列表，并标记为 `Creator Source Session`，移动端可继续完整对话与查看文件。
- 明暗主题同步页面背景、导航栏、TabBar 与系统色彩。

Conversation history renders persisted backend messages only. Files and approvals use their dedicated API projections and never synthesize conversation entries from run status or filenames.
- H5 与小程序统一以 375 设计宽度构建。
- 登录态恢复完成前隐藏业务 TabBar，防止认证页和主导航叠加。

## Session Capture / Session Capture

The task conversation page provides a bottom sheet for Terminal and completed-turn Checkpoint capture. It submits safe workspace selection defaults, polls progress, restores state after reload, exposes retry for failed captures, and deep-links completed captures to the Creator workbench.

Session Capture does not add a bottom navigation tab. The product navigation remains `工坊 / 任务 / 我的`, and the task detail remains a full Codex conversation surface.

## 当前状态 / Current Status

截至 2026-07-21，H5 已接入认证、工作区、工坊、服务、任务、实时对话、上传、文件、审批、Provider 选择、配额摘要、Session Capture、实例生命周期与个人中心主链。微信小程序生产构建、`Taro.login` 登录入口、统一认证令牌、请求运行时和实例生命周期入口已完成。

As of 2026-07-21, the H5 client covers the complete mobile workflow, including run lifecycle management. The WeChat Mini Program production build, `Taro.login` entry point, shared authentication tokens, request runtime, and lifecycle actions are implemented.

| 验证项 | 结果 |
| --- | --- |
| TypeScript | 通过 |
| H5 production build | 通过 |
| WeChat Mini Program production build | 通过 |
| 最新微信交付产物 | `r4`，60 个文件，`1,223,518 Byte`，SHA-256 `FB46E12C4A1497710D0EA56FAD665785F4277FF7CFFACDC9D67D61B6916481D2` |
| Public API health | `GET https://codex-miniapp.sidcloud.cn/health` 返回 `200` |
| WeChat login API local smoke | 通过 |
| Public WeChat login route | 已部署；无效 code 返回 `401 / AUTH_WECHAT_CODE_INVALID / 40029` |
| Current AppID account type | `gameApp=false / appType=0 / compileType=weapp` |
| WeChat Developer Tools Preview | 2026-07-22 通过，官方 CLI 预览包 `1,225,374 Byte` |
| Real WeChat login | 两次 `wx.login` code 均成功换取会话，并复用用户 `usr_00000012` 与工作区 `wsp_00000012` |
| Playwright Dashboard/Admin/H5 E2E | 34/34 通过，包含实例停止与释放链路 |
| Mobile 页面状态视觉检查 | 14/14 通过 |
| 当前验收地址 | `http://192.168.31.20:38120/` |

## 微信小程序交付包 / WeChat Mini Program Deliverable

微信开发者工具可直接导入 `app/mobile/dist`。该目录的 `project.config.json` 使用 `miniprogramRoot: "./"`，AppID 为 `wx4b21e9b9200dcf9b`，基础库固定为 `3.15.2`。

最新发布快照保留独立目录 `release/mini-program/lingban-weapp-20260722-r4` 和压缩包 `release/mini-program/lingban-weapp-20260722-r4.zip`。压缩包解压后可直接作为微信开发者工具项目导入，服务器下载地址为 `http://192.168.31.20:38120/downloads/lingban-weapp-20260722-r4.zip`。

WeChat Developer Tools can import `app/mobile/dist` directly. The release snapshot also contains a standalone directory and ZIP package whose root includes `app.js`, `app.json`, `app.wxss`, and `project.config.json`.

微信认证后端与公网路由已上线。当前使用 `灵办` 微信小程序凭证，并需在微信公众平台登记 `https://codex-miniapp.sidcloud.cn` 为 `request` 合法域名。文件上传、下载、预览和订阅消息需要继续完成微信端专项适配。支付宝端能力保持后续计划。

Credentialed WeChat device testing, file APIs, subscription messages, and review configuration remain before production submission.

## 微信分享 / WeChat Sharing

- 工坊首页、工坊详情和服务详情支持右上角菜单转发、页面内转发按钮及朋友圈分享。
- 工坊与服务详情分享会保留资源 ID；已登录用户直接进入详情，未登录用户完成微信登录后恢复分享目标。
- 任务会话、任务文件、Creator 和账户页面禁止分享，避免工作区消息、文件和运行状态进入外部分享链路。
- 分享接收方仍需通过 API 工作区权限校验，分享链接不会放宽目录可见范围。

Workshop discovery and service detail pages support WeChat friend and Timeline sharing with authenticated deep-link restoration. Private task, Creator, file, and account surfaces remain outside the sharing boundary.

## 2026-07-20 Creator Loop / 2026-07-20 Creator 闭环

移动端现已提供任务列表“新建实例”入口、空白 Codex 创建页、完整实例对话、文件入口、Session Capture、Creator 项目、Draft/Replay/Seal 和 Package/Release/Activation 页面。“我的”页承载 Creator 入口与工作区切换。360x800、390x844、430x932 视口无横向溢出，固定输入区不会遮挡末条消息。

`pnpm typecheck`、Creator Flow `4/4`、H5 production build、WeChat production build 和 `scripts/verify-weapp-build.mjs` 均通过。微信开发者工具导入仓库根路径，`miniprogramRoot` 指向 `dist/`。

The mobile client now exposes blank Codex creation and the complete Creator publication path. Type checking, creator-flow tests, H5 build, and WeChat artifact verification pass.

## 2026-07-21 Dark Theme Compatibility / 2026-07-21 暗色主题兼容

Creator 新增页面已完成 H5 与微信小程序暗色主题统一：工作区摘要、表单控件、运行能力折叠区、开关行、底部操作区和禁用按钮均使用显式组件类与稳定尺寸。关键布局不依赖微信构建可能省略的通配子选择器，Taro `Button` 原生背景、边框和伪元素已统一重置。

360x800、390x844、430x932 暗色视口均无横向溢出，运行能力入口保持深色背景，底部操作区按正常文档流排列。交付微信开发者工具前必须最后执行 `pnpm build:weapp`，确保 `dist/` 保留微信小程序产物。

The Creator pages now apply explicit cross-platform component classes, stable form dimensions, native Taro button resets, and normal-flow footer actions. Dark-theme layout checks pass at 360x800, 390x844, and 430x932 without horizontal overflow.

## 2026-07-21 WeChat Capability Loading / 2026-07-21 微信能力加载

微信小程序统一通过 `useMobileQuery` 直接调度 API，由 `Taro.request` 负责网络请求与 20 秒超时。该适配层覆盖加载、成功、失败、手动刷新、定时刷新、`select` 数据转换和 QueryClient 缓存同步；H5 继续使用 TanStack Query。页面代码禁止直接从 `@tanstack/react-query` 导入 `useQuery`，生产构建会同时检查源码和微信页面产物。

新建实例页现在区分加载中、加载失败和未配置状态。请求失败后显示“重新加载”，MCP 与 Credential 在查询完成前不会提前显示空态。全部账户级运行能力加载成功后，页面启用“启动空白 Codex”。

路由详情页使用 `useMobileRouteParams` 在 Taro 页面生命周期内接收参数，查询组件会在参数就绪后挂载。微信基础库固定为稳定版 `3.15.2`，规避灰度基础库 `3.17.0` 的 `subPageFrameEndTime` 内部异常。

如果微信开发者工具同时加载旧页面块和新公共块，应关闭项目与 IDE，清理该项目的 `WeappCompileCache` 后重新执行 `pnpm build:weapp` 和预览。`scripts/verify-weapp-build.mjs` 会校验基础库版本、API 地址、直接查询适配层和页面查询边界。

The WeChat runtime dispatches API calls through a dedicated lifecycle adapter while H5 retains TanStack Query. Route-bound pages mount their query content after Taro exposes route parameters. Production verification pins base library `3.15.2` and rejects direct TanStack `useQuery` calls in WeChat pages.

## 2026-07-21 Lifecycle Confirmation / 2026-07-21 生命周期确认

任务列表与任务详情的停止确认按钮统一使用 4 字文案“确认停止”，满足 Taro H5 与微信小程序 `showModal.confirmText` 长度限制。ActionSheet 取消仅结束菜单交互，弹窗创建失败会显示错误提示，业务动作异常不会被菜单取消逻辑吞掉。

微信构建校验会扫描所有 `confirmText` 常量并按平台加权长度规则拒绝超限文案。H5 E2E 会打开生命周期菜单、确认停止、断言 `POST /v1/runs/:runId/stop` 的 `graceful` 请求，并检查页面进入“运行环境已释放”状态。

Task-list and task-detail stop confirmations use a platform-compliant four-character label. Build verification rejects oversized modal labels, while H5 E2E asserts the stop request and released runtime state.
