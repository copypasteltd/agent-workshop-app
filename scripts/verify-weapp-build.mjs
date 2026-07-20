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

const sourceProject = JSON.parse(
  readFileSync(path.join(projectRoot, "project.config.json"), "utf8")
);
const outputProject = JSON.parse(
  readFileSync(path.join(distRoot, "project.config.json"), "utf8")
);
JSON.parse(readFileSync(path.join(distRoot, "app.json"), "utf8"));

if (sourceProject.appid !== outputProject.appid) {
  throw new Error(
    `WeChat AppID mismatch: source=${sourceProject.appid}, output=${outputProject.appid}`
  );
}

console.log("WeChat build verification passed.");
