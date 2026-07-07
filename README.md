# 灵办词元移动端 / Lingban Mobile App

## 概览 / Overview

本仓库是灵办词元的移动端实现，当前以 H5 首发为主，技术栈固定为 Taro + React。产品定位面向轻度用户，强调看到即用、任务即聊、文件即看。

This repository contains the Lingban mobile client. The first release target is H5, built with Taro + React. The experience is designed for lightweight users with an instant-use workflow: discover a workshop, start a run, chat with Codex, and inspect files directly on mobile.

## 当前范围 / Current Scope

- 工坊列表、工坊详情、服务详情页
- 任务列表、任务详情、完整对话页
- target path 文件浏览与路径切换
- “我的”页中的个人资料、工作区切换、偏好设置
- 明暗主题适配
- H5 优先发布，后续再做微信小程序和支付宝小程序特化

- Workshop list, workshop detail, and service detail views
- Task list, task detail, and full conversational run view
- Target-path file browser with path switching
- Profile, workspace switching, and preferences under the Me page
- Light and dark themes
- H5-first release, with later specialization for WeChat Mini Program and Alipay Mini Program

## 技术栈 / Tech Stack

- Taro 4
- React 18
- TypeScript
- Zustand
- TanStack Query
- Workspace-shared packages: `@lingban/api-sdk`, `@lingban/contracts`, `@lingban/domain-models`, `@lingban/ui-tokens`

## 目录结构 / Directory Structure

```text
src/
  app.tsx
  app.config.ts
  pages/
    workshops/
    services/
    tasks/
    me/
  stores/
  lib/
  data/
  styles/
  assets/
config/
types/
```

## 开发命令 / Scripts

```bash
pnpm dev:h5
pnpm build:h5
pnpm dev:weapp
pnpm build:weapp
pnpm dev:alipay
pnpm build:alipay
```

## 开发约束 / Development Notes

- H5 是当前默认验证入口
- 页面信息架构以 `工坊 / 任务 / 我的` 为主导航
- 任务页必须保持完整对话模式
- 参数补全依赖运行时对话引导，不在任务初始化阶段硬编码收集

- H5 is the primary validation target
- The primary navigation model is `Workshops / Tasks / Me`
- The task page must stay in full conversational mode
- Input completion is guided at runtime through conversation rather than hard-coded at task creation time

## 状态 / Status

当前仓库已完成高保真原型向 Taro 工程的落位，后续会继续接入真实 API、实时订阅、文件下载和运行控制。

The repository already contains the production-oriented Taro application shell derived from the approved prototype. The next steps are real API integration, realtime subscriptions, file download, and run control.
