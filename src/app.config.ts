const tabbarAssetRoot =
  process.env.NODE_ENV === "development" ? "/assets/tabbar" : "assets/tabbar";

export default defineAppConfig({
  pages: [
    "pages/workshops/index",
    "pages/auth/index",
    "pages/workshops/detail",
    "pages/services/detail",
    "pages/tasks/index",
    "pages/tasks/new",
    "pages/tasks/detail",
    "pages/tasks/files",
    "pages/creator/projects",
    "pages/creator/project",
    "pages/creator/draft",
    "pages/creator/publish",
    "pages/me/index",
  ],
  window: {
    backgroundTextStyle: "light",
    navigationBarBackgroundColor: "#111826",
    navigationBarTitleText: "灵办词元",
    navigationBarTextStyle: "white",
  },
  tabBar: {
    color: "#8c98ad",
    selectedColor: "#c7ffd7",
    backgroundColor: "#0e1524",
    borderStyle: "black",
    list: [
      {
        pagePath: "pages/workshops/index",
        text: "工坊",
        iconPath: `${tabbarAssetRoot}/workshops.png`,
        selectedIconPath: `${tabbarAssetRoot}/workshops-active.png`,
      },
      {
        pagePath: "pages/tasks/index",
        text: "任务",
        iconPath: `${tabbarAssetRoot}/tasks.png`,
        selectedIconPath: `${tabbarAssetRoot}/tasks-active.png`,
      },
      {
        pagePath: "pages/me/index",
        text: "我的",
        iconPath: `${tabbarAssetRoot}/me.png`,
        selectedIconPath: `${tabbarAssetRoot}/me-active.png`,
      },
    ],
  },
});
