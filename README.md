# 灵办词元移动端 / Lingban Mobile App

## 仓库定位 / Repository Role

本目录是灵办词元的轻量端，当前以 H5 首发，后续继续适配微信小程序与支付宝小程序。目录位于 `app/mobile`，属于拆分分支 `agent-workshop-app`。

This directory contains the lightweight Lingban client. The first release target is H5, with later specialization for WeChat Mini Program and Alipay Mini Program. It lives at `app/mobile` and is part of the `agent-workshop-app` branch.

## 产品职责 / Product Scope

- 工坊发现、服务详情、立即启动
- 任务列表、多筛选、多会话入口
- 任务详情中的完整 Codex 对话
- 文件浏览、路径切换、下载入口
- 我的页面、工作区切换、偏好与授权摘要

## 页面结构 / Page Structure

| 路径 | 作用 |
| --- | --- |
| `src/pages/workshops/index.tsx` | 工坊首页 |
| `src/pages/workshops/detail.tsx` | 工坊详情 |
| `src/pages/services/detail.tsx` | 服务详情与启动入口 |
| `src/pages/tasks/index.tsx` | 任务列表、筛选、标签与搜索 |
| `src/pages/tasks/detail.tsx` | 任务会话页，完整对话模式 |
| `src/pages/tasks/files.tsx` | 文件列表、路径切换与下载入口 |
| `src/pages/me/index.tsx` | 我的、工作区切换、偏好与资产摘要 |

## 代码结构 / Code Structure

| 路径 | 作用 | 关键文件 |
| --- | --- | --- |
| `src/lib/` | API、catalog、runStream、workspace、theme、quota 适配 | `api.ts`, `runStream.ts`, `useMobileWorkspace.ts` |
| `src/stores/` | 认证态与 UI 态 | `mobileAuthStore.ts`, `mobileUiStore.ts` |
| `src/components/` | 认证门面与通用交互组件 | `MobileAuthGate.tsx`, `MobileAuthScreen.tsx` |
| `src/assets/` | logo、tabbar、工坊插图 | `logo.svg`, `tabbar/*` |
| `src/styles/` | 样式基线 | `prototype.css`, `app.css` |

## 技术栈 / Tech Stack

- Taro 4
- React 18
- TypeScript
- Zustand
- TanStack Query

## 开发命令 / Commands

```bash
pnpm -C app/mobile dev:h5
pnpm -C app/mobile build:h5
pnpm -C app/mobile dev:weapp
pnpm -C app/mobile build:weapp
pnpm -C app/mobile dev:alipay
pnpm -C app/mobile build:alipay
pnpm -C app/mobile typecheck
```

## 交互约束 / Interaction Rules

- 默认导航为 `工坊 / 任务 / 我的`
- 任务页承载多任务列表，点入后进入具体会话
- 参数收集在实例化后由 Codex 首轮追问引导完成
- 文件查看页必须支持路径选择、路径输入与即时切换
- 工作区选择入口位于“我的”页面

## 当前状态 / Current Status

当前代码已经完成基于定稿原型的 Taro 工程落位，并具备工坊、任务、文件、我的四类核心页面。后续重点是接入真实 run 数据流、下载链路、凭证授权与多端环境差异处理。
