import type { RunConversationAttachment } from "@lingban/contracts";
import { Button, Image, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useMemo, useRef, useState } from "react";
import { mobileRunsApi } from "../lib/api";
import { parseAgentMessageImages, type AgentMessageImageReference } from "../lib/agentMessageImages";
import { mobileRunPreviewQueryKey } from "../lib/runQueryKeys";
import { useMobileQuery as useQuery } from "../lib/useMobileQuery";

type MobileMessageContentProps = {
  runId: string;
  targetPath: string;
  text: string;
  attachments?: Array<Pick<RunConversationAttachment, "label" | "path">>;
  onOpenFile: (filePath: string) => void;
};

function MobileRunMessageImage({
  runId,
  image,
  onOpenFile,
}: {
  runId: string;
  image: AgentMessageImageReference;
  onOpenFile: (filePath: string) => void;
}) {
  const [renderFailed, setRenderFailed] = useState(false);
  const pendingPollCountRef = useRef(0);
  const previewQuery = useQuery({
    queryKey: [...mobileRunPreviewQueryKey(runId, image.filePath), "message-image"],
    queryFn: async () => {
      pendingPollCountRef.current += 1;
      return await mobileRunsApi.previewRunFile(runId, image.filePath);
    },
    retry: 3,
    retryDelay: (attempt) => Math.min(750 * 2 ** attempt, 4_000),
    refetchInterval: (query) => {
      const preview = query.state.data;
      if (preview?.mode === "image" && preview.downloadUrl) {
        const expiresAt = preview.downloadExpiresAt
          ? Date.parse(preview.downloadExpiresAt)
          : Number.NaN;
        return Number.isFinite(expiresAt)
          ? Math.max(5_000, expiresAt - Date.now() - 30_000)
          : false;
      }
      return pendingPollCountRef.current < 15 ? 2_000 : false;
    },
    staleTime: 45_000,
  });
  const previewUrl =
    previewQuery.data?.mode === "image" ? previewQuery.data.downloadUrl : null;

  useEffect(() => {
    setRenderFailed(false);
  }, [previewUrl]);

  const openPreview = async () => {
    if (!previewUrl) return;
    try {
      await Taro.previewImage({ current: previewUrl, urls: [previewUrl] });
    } catch {
      if (process.env.TARO_ENV === "h5" && typeof window !== "undefined") {
        window.open(previewUrl, "_blank", "noopener,noreferrer");
      }
    }
  };

  const loading = previewQuery.isPending || previewQuery.isFetching;
  const unavailable = previewQuery.isError || !previewUrl || renderFailed;

  return (
    <View className="message-image-card" data-testid={`mobile-message-image-${image.key}`}>
      <View className="message-image-head">
        <View className="message-image-label">{image.label}</View>
        <View className="message-image-path mono">{image.filePath}</View>
      </View>
      {previewUrl && !renderFailed ? (
        <View className="message-image-frame" onClick={openPreview}>
          <Image
            className="message-image-preview"
            src={previewUrl}
            mode="aspectFit"
            lazyLoad
            showMenuByLongpress
            onError={() => setRenderFailed(true)}
          />
        </View>
      ) : (
        <View className="message-image-state">
          <View className={`message-image-state-mark ${loading ? "loading" : ""}`} />
          <View className="message-image-state-copy">
            {loading ? "正在读取图片" : "图片暂时无法预览"}
          </View>
        </View>
      )}
      {unavailable && !loading ? (
        <View className="message-image-actions">
          <Button
            className="pill active"
            onClick={() => {
              pendingPollCountRef.current = 0;
              void previewQuery.refetch();
            }}
          >
            重新加载
          </Button>
          <Button className="pill" onClick={() => onOpenFile(image.filePath)}>
            在文件中查看
          </Button>
        </View>
      ) : null}
    </View>
  );
}

export function MobileMessageContent({
  runId,
  targetPath,
  text,
  attachments = [],
  onOpenFile,
}: MobileMessageContentProps) {
  const parsed = useMemo(
    () => parseAgentMessageImages(text, targetPath, attachments),
    [attachments, targetPath, text]
  );

  return (
    <>
      {parsed.displayText ? <View className="message-body">{parsed.displayText}</View> : null}
      {parsed.images.length > 0 ? (
        <View className="message-image-list">
          {parsed.images.map((image) => (
            <MobileRunMessageImage
              image={image}
              key={image.key}
              runId={runId}
              onOpenFile={onOpenFile}
            />
          ))}
        </View>
      ) : null}
    </>
  );
}
