import embeddedLogo from "../assets/logo-ui.png";

export const mobileLogoSource =
  process.env.TARO_ENV === "weapp" ? "/assets/logo-ui.png" : embeddedLogo;
