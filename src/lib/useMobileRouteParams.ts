import { getCurrentInstance, useDidShow, useLoad, useReady } from "@tarojs/taro";
import { useState } from "react";

function readCurrentRouteParams<Params extends Partial<Record<string, string>>>() {
  const params = getCurrentInstance().router?.params;
  return params ? params as Params : null;
}

export function useMobileRouteParams<
  Params extends Partial<Record<string, string>>,
>() {
  const [params, setParams] = useState<Params | null>(() => readCurrentRouteParams<Params>());

  const syncCurrentParams = () => {
    const current = readCurrentRouteParams<Params>();
    if (current) {
      setParams(current);
    }
  };

  useLoad((options) => {
    setParams(options as Params);
  });
  useReady(syncCurrentParams);
  useDidShow(syncCurrentParams);

  return params;
}
