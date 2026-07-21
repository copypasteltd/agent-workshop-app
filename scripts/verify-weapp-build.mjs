import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const projectRoot = process.cwd();
const distRoot = path.join(projectRoot, "dist");
const requiredFiles = [
  "app.js",
  "app.json",
  "app.wxss",
  "project.config.json",
  "taro.js",
];

function listJavaScriptFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return listJavaScriptFiles(absolutePath);
    }
    return entry.isFile() && entry.name.endsWith(".js") ? [absolutePath] : [];
  });
}

function listSourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return listSourceFiles(absolutePath);
    }
    return entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name) ? [absolutePath] : [];
  });
}

for (const relativePath of requiredFiles) {
  const absolutePath = path.join(distRoot, relativePath);
  if (!statSync(absolutePath).isFile()) {
    throw new Error(`Missing WeChat build artifact: ${relativePath}`);
  }
}

const unresolvedConstants = new Set();
let hasZodJitlessConfig = false;
let hasExpectedApiBaseUrl = false;
let hasUnconfiguredApiPlaceholder = false;
for (const filePath of listJavaScriptFiles(distRoot)) {
  const source = readFileSync(filePath, "utf8");
  for (const match of source.matchAll(/\bENABLE_[A-Z0-9_]+\b/g)) {
    unresolvedConstants.add(match[0]);
  }
  if (/\.config\(\{\s*jitless\s*:\s*(?:!0|true)\s*\}\)/.test(source)) {
    hasZodJitlessConfig = true;
  }
  if (source.includes("https://codex-miniapp.sidcloud.cn")) {
    hasExpectedApiBaseUrl = true;
  }
  if (source.includes("api-not-configured.invalid")) {
    hasUnconfiguredApiPlaceholder = true;
  }
}

if (unresolvedConstants.size > 0) {
  throw new Error(
    `Unresolved WeChat runtime constants: ${[...unresolvedConstants].sort().join(", ")}`
  );
}

if (!hasZodJitlessConfig) {
  throw new Error(
    "Missing Zod jitless runtime configuration required by WeChat AppService"
  );
}

if (!hasExpectedApiBaseUrl) {
  throw new Error(
    "Missing the configured WeChat API base URL: https://codex-miniapp.sidcloud.cn"
  );
}

if (hasUnconfiguredApiPlaceholder) {
  throw new Error("Unconfigured API placeholder leaked into the WeChat build");
}

const creatorLaunchPageSource = readFileSync(
  path.join(distRoot, "pages", "tasks", "new.js"),
  "utf8"
);
const requiredCreatorCapabilityMarkers = [
  "[creator-launch] loading capabilities",
  "[creator-launch] capabilities loaded",
  "listProviders",
  "listMcps",
  "listCredentials",
];
for (const marker of requiredCreatorCapabilityMarkers) {
  if (!creatorLaunchPageSource.includes(marker)) {
    throw new Error(`Missing direct Creator capability loader marker: ${marker}`);
  }
}
if (creatorLaunchPageSource.includes(".useQuery(")) {
  throw new Error("Creator launch capability loading must not depend on useQuery scheduling");
}

const taskDetailPageSource = readFileSync(
  path.join(distRoot, "pages", "tasks", "detail.js"),
  "utf8"
);
for (const marker of [
  "mobile-task-composer-toggle",
  "composer-collapsed",
  "composer-expanded",
  "task-composer-chevron",
]) {
  if (!taskDetailPageSource.includes(marker)) {
    throw new Error(`Missing collapsible task composer marker: ${marker}`);
  }
}

const appStyleSource = readFileSync(path.join(distRoot, "app-origin.wxss"), "utf8");
for (const marker of [
  "--task-composer-reserve",
  "--task-composer-expanded-reserve",
  "height:176rpx!important",
  "scroll-padding-bottom:calc(var(--task-composer-reserve)",
]) {
  if (!appStyleSource.includes(marker)) {
    throw new Error(`Missing task composer layout constraint: ${marker}`);
  }
}

for (const filePath of listSourceFiles(path.join(projectRoot, "src"))) {
  const source = readFileSync(filePath, "utf8");
  for (const match of source.matchAll(/confirmText\s*:\s*["']([^"']+)["']/g)) {
    const label = match[1];
    const weightedLength = label.replace(/[\u0391-\uFFE5]/g, "aa").length;
    if (weightedLength > 8) {
      throw new Error(
        `WeChat confirmText exceeds the platform limit: ${path.relative(projectRoot, filePath)} -> ${label}`
      );
    }
  }
  if (filePath === path.join(projectRoot, "src", "lib", "useMobileQuery.ts")) {
    continue;
  }
  if (
    /import\s*\{[^}]*\buseQuery\b[^}]*\}\s*from\s*["']@tanstack\/react-query["']/.test(
      source
    )
  ) {
    throw new Error(
      `WeChat page queries must use useMobileQuery: ${path.relative(projectRoot, filePath)}`
    );
  }
}

for (const filePath of listJavaScriptFiles(path.join(distRoot, "pages"))) {
  const source = readFileSync(filePath, "utf8");
  if (source.includes(".useQuery(")) {
    throw new Error(
      `Direct TanStack useQuery call leaked into WeChat page: ${path.relative(distRoot, filePath)}`
    );
  }
}

const commonSource = readFileSync(path.join(distRoot, "common.js"), "utf8");
if (!commonSource.includes("useMobileQuery")) {
  throw new Error("Missing the WeChat direct-query compatibility layer");
}

const sourceProject = JSON.parse(
  readFileSync(path.join(projectRoot, "project.config.json"), "utf8")
);
const outputProject = JSON.parse(
  readFileSync(path.join(distRoot, "project.config.json"), "utf8")
);
const appConfig = JSON.parse(readFileSync(path.join(distRoot, "app.json"), "utf8"));

const shareablePages = [
  "pages/workshops/index",
  "pages/workshops/detail",
  "pages/services/detail",
];
for (const pagePath of shareablePages) {
  if (!appConfig.pages.includes(pagePath)) {
    throw new Error(`Missing shareable page registration: ${pagePath}`);
  }
  const pageSource = readFileSync(path.join(distRoot, `${pagePath}.js`), "utf8");
  if (
    !/enableShareAppMessage\s*[:=]\s*!0/.test(pageSource) ||
    !/enableShareTimeline\s*[:=]\s*!0/.test(pageSource)
  ) {
    throw new Error(`WeChat sharing is not fully enabled for: ${pagePath}`);
  }
}

for (const pagePath of [
  "pages/auth/index",
  "pages/tasks/index",
  "pages/tasks/new",
  "pages/tasks/detail",
  "pages/tasks/files",
  "pages/creator/projects",
  "pages/creator/project",
  "pages/creator/draft",
  "pages/creator/publish",
  "pages/me/index",
]) {
  const pageSource = readFileSync(path.join(distRoot, `${pagePath}.js`), "utf8");
  if (
    /enableShareAppMessage\s*[:=]\s*!0/.test(pageSource) ||
    /enableShareTimeline\s*[:=]\s*!0/.test(pageSource)
  ) {
    throw new Error(`Private mobile page unexpectedly enables sharing: ${pagePath}`);
  }
  if (!pageSource.includes("useMobileShareDisabled")) {
    throw new Error(`Private mobile page does not hide the WeChat share menu: ${pagePath}`);
  }
}

const shareSource = readFileSync(path.join(distRoot, "common.js"), "utf8");
for (const marker of [
  "lingban:mobile:pending-share-route",
  "/pages/workshops/detail",
  "/pages/services/detail",
  "shareAppMessage",
  "shareTimeline",
]) {
  if (!shareSource.includes(marker)) {
    throw new Error(`Missing WeChat sharing runtime marker: ${marker}`);
  }
}

if (sourceProject.libVersion !== "3.15.2" || outputProject.libVersion !== "3.15.2") {
  throw new Error(
    `WeChat base library must use stable 3.15.2: source=${sourceProject.libVersion}, output=${outputProject.libVersion}`
  );
}

if (sourceProject.appid !== outputProject.appid) {
  throw new Error(
    `WeChat AppID mismatch: source=${sourceProject.appid}, output=${outputProject.appid}`
  );
}

console.log("WeChat build verification passed.");
