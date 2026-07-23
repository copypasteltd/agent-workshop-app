import type { RunConversationAttachment } from "@lingban/contracts";
import { Button, Image, Video, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useMemo, useRef, useState } from "react";
import { mobileRunsApi } from "../lib/api";
import {
  parseAgentMessageMedia,
  type AgentMessageMediaReference,
} from "../lib/agentMessageImages";
import { mobileRunPreviewQueryKey } from "../lib/runQueryKeys";
import { useMobileQuery as useQuery } from "../lib/useMobileQuery";

type MobileMessageContentProps = {
  runId: string;
  targetPath: string;
  text: string;
  attachments?: Array<Pick<RunConversationAttachment, "label" | "path">>;
  onOpenFile: (filePath: string) => void;
};

function MobileRunMessageMedia({
  runId,
  media,
  onOpenFile,
}: {
  runId: string;
  media: AgentMessageMediaReference;
  onOpenFile: (filePath: string) => void;
}) {
  const [renderFailed, setRenderFailed] = useState(false);
  const pendingPollCountRef = useRef(0);
  const previewQuery = useQuery({
    queryKey: [...mobileRunPreviewQueryKey(runId, media.filePath), `message-${media.kind}`],
    queryFn: async () => {
      pendingPollCountRef.current += 1;
      return await mobileRunsApi.previewRunFile(runId, media.filePath);
    },
    retry: 3,
    retryDelay: (attempt) => Math.min(750 * 2 ** attempt, 4_000),
    refetchInterval: (query) => {
      const preview = query.state.data;
      if (preview?.mode === media.kind && preview.downloadUrl) {
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
    previewQuery.data?.mode === media.kind ? previewQuery.data.downloadUrl : null;

  useEffect(() => {
    setRenderFailed(false);
  }, [previewUrl]);

  const openImagePreview = async () => {
    if (!previewUrl || media.kind !== "image") return;
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
  const mediaLabel = media.kind === "video" ? "视频" : "图片";

  return (
    <View
      className={`message-image-card message-media-card ${media.kind}`}
      data-testid={`mobile-message-${media.kind}-${media.key}`}
    >
      <View className="message-image-head">
        <View className="message-image-label">{media.label}</View>
        <View className="message-image-path mono">{media.filePath}</View>
      </View>
      {previewUrl && !renderFailed ? (
        media.kind === "image" ? (
          <View className="message-image-frame" onClick={openImagePreview}>
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
          <View className="message-video-frame">
            <Video
              className="message-video-preview"
              src={previewUrl}
              controls
              objectFit="contain"
              showCenterPlayBtn
              enableProgressGesture
              onError={() => setRenderFailed(true)}
            />
          </View>
        )
      ) : (
        <View className="message-image-state">
          <View className={`message-image-state-mark ${loading ? "loading" : ""}`} />
          <View className="message-image-state-copy">
            {loading ? `正在读取${mediaLabel}` : `${mediaLabel}暂时无法预览`}
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
          <Button className="pill" onClick={() => onOpenFile(media.filePath)}>
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
    () => parseAgentMessageMedia(text, targetPath, attachments),
    [attachments, targetPath, text]
  );

  return (
    <>
      {parsed.displayText ? <View className="message-body">{parsed.displayText}</View> : null}
      {parsed.media.length > 0 ? (
        <View className="message-image-list message-media-list">
          {parsed.media.map((media) => (
            <MobileRunMessageMedia
              media={media}
              key={media.key}
              runId={runId}
              onOpenFile={onOpenFile}
            />
          ))}
        </View>
      ) : null}
    </>
  );
}
