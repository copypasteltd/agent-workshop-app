import { defineConfig, type UserConfigExport } from "@tarojs/cli";
import path from "node:path";
import devConfig from "./dev";
import prodConfig from "./prod";

const sourceAliases = {
  "@lingban/api-sdk": path.resolve(__dirname, "../../../packages/api-sdk/src/index.ts"),
  "@lingban/contracts": path.resolve(__dirname, "../../../packages/contracts/src/index.ts"),
  "@lingban/domain-models": path.resolve(__dirname, "../../../packages/domain-models/src/index.ts"),
  "@lingban/ui-tokens": path.resolve(__dirname, "../../../packages/ui-tokens/src/index.ts"),
};

function alipayTemplateFallbackPlugin() {
  return {
    name: "lingban-alipay-template-fallback",
    enforce: "pre" as const,
    generateBundle(_outputOptions: unknown, bundle: Record<string, { type: string; fileName: string; source?: string; name?: string }>) {
      if (process.env.TARO_ENV !== "alipay") {
        return;
      }

      if (!bundle[".browserslistrc"]) {
        bundle[".browserslistrc"] = {
          type: "asset",
          fileName: ".browserslistrc",
          name: ".browserslistrc",
          source: "",
        };
      }
    },
  };
}

export default defineConfig<"vite">(async (merge) => {
  // Keep source aliases in development for local iteration, but use built workspace
  // packages in production builds to reduce cross-package compile pressure.
  const useSourceAliases =
    process.env.NODE_ENV === "development" || process.env.LINGBAN_USE_SOURCE_ALIASES === "1";
  const designWidth = process.env.TARO_ENV === "h5" ? 375 : 750;
  const baseConfig: UserConfigExport<"vite"> = {
    projectName: "lingban-mobile",
    date: "2026-7-7",
    designWidth,
    deviceRatio: {
      640: 2.34 / 2,
      750: 1,
      375: 2,
      828: 1.81 / 2,
    },
    sourceRoot: "src",
    outputRoot: "dist",
    plugins: ["@tarojs/plugin-generator"],
    defineConstants: {
      "process.env.TARO_APP_API_BASE_URL": JSON.stringify(
        process.env.TARO_APP_API_BASE_URL ?? ""
      ),
      "process.env.TARO_APP_E2E_AUTH_MODE": JSON.stringify(
        process.env.TARO_APP_E2E_AUTH_MODE ?? ""
      ),
    },
    copy: {
      patterns: [],
      options: {},
    },
    framework: "react",
    compiler: {
      type: "vite",
      vitePlugins: [alipayTemplateFallbackPlugin()],
    },
    alias: useSourceAliases ? sourceAliases : {},
    mini: {
      postcss: {
        pxtransform: {
          enable: true,
          config: {},
        },
        cssModules: {
          enable: false,
          config: {
            namingPattern: "module",
            generateScopedName: "[name]__[local]___[hash:base64:5]",
          },
        },
      },
    },
    h5: {
      publicPath: "/",
      staticDirectory: "static",
      miniCssExtractPluginOption: {
        ignoreOrder: true,
        filename: "css/[name].[hash].css",
        chunkFilename: "css/[name].[chunkhash].css",
      },
      postcss: {
        autoprefixer: {
          enable: true,
          config: {},
        },
        cssModules: {
          enable: false,
          config: {
            namingPattern: "module",
            generateScopedName: "[name]__[local]___[hash:base64:5]",
          },
        },
      },
    },
  };

  if (process.env.NODE_ENV === 'development') {
    return merge({}, baseConfig, devConfig);
  }
  return merge({}, baseConfig, prodConfig);
});
