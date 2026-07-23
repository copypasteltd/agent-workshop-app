export const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;
export const MAX_ATTACHMENT_COUNT = 9;

export type AttachmentDraft = {
  id: string;
  fileName: string;
  label: string;
  sizeBytes: number;
  contentType: string | null;
  readContent: () => Promise<ArrayBuffer>;
};

export type MiniProgramChosenFile = {
  name: string;
  path: string;
  size: number;
  type?: string;
};

export type MiniProgramAttachmentRuntime = {
  chooseMessageFile(input: {
    count: number;
    type: "all";
  }): Promise<{ tempFiles: MiniProgramChosenFile[] }>;
  readFile(filePath: string): Promise<ArrayBuffer>;
};

export type AttachmentPickerOptions = {
  multiple?: boolean;
  accept?: string;
  maxCount?: number;
};

export function nextAttachmentDraftId() {
  return `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function describePlatformError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object" && "errMsg" in error) {
    return String((error as { errMsg?: unknown }).errMsg ?? "");
  }

  return "";
}

export function isAttachmentPickerCancellation(error: unknown) {
  return /(?:^|[:\s])(?:cancel|canceled|cancelled)(?:$|[:\s])/iu.test(
    describePlatformError(error)
  );
}

export function inferAttachmentContentType(fileName: string) {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  const contentTypes: Record<string, string> = {
    txt: "text/plain",
    md: "text/markdown",
    csv: "text/csv",
    json: "application/json",
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    zip: "application/zip",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    mp4: "video/mp4",
    m4v: "video/x-m4v",
    mov: "video/quicktime",
    webm: "video/webm",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    wav: "audio/wav",
  };

  return contentTypes[extension] ?? null;
}

export function validateAttachment(fileName: string, sizeBytes: number) {
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0) {
    throw new Error(`${fileName || "附件"}的文件大小无效。`);
  }

  if (sizeBytes > MAX_ATTACHMENT_BYTES) {
    throw new Error(`${fileName || "附件"}超过 50 MB 上传上限。`);
  }
}

export function resolveAttachmentPickerCount(options?: AttachmentPickerOptions) {
  if (options?.multiple === false) {
    return 1;
  }

  return Math.max(1, Math.min(MAX_ATTACHMENT_COUNT, options?.maxCount ?? MAX_ATTACHMENT_COUNT));
}

export function formatAttachmentSize(sizeBytes: number) {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return "0 B";
  }

  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }

  if (sizeBytes < 1024 * 1024 * 1024) {
    return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${(sizeBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export async function pickMiniProgramAttachments(
  options: AttachmentPickerOptions | undefined,
  runtime: MiniProgramAttachmentRuntime
): Promise<AttachmentDraft[]> {
  let selected: { tempFiles: MiniProgramChosenFile[] };
  try {
    selected = await runtime.chooseMessageFile({
      count: resolveAttachmentPickerCount(options),
      type: "all",
    });
  } catch (error) {
    if (isAttachmentPickerCancellation(error)) {
      return [];
    }
    const detail = describePlatformError(error);
    throw new Error(detail ? `微信附件选择失败：${detail}` : "微信附件选择失败。");
  }

  return selected.tempFiles.map((file) => {
    const fileName = file.name.trim() || file.path.split(/[\\/]/u).pop() || "attachment";
    validateAttachment(fileName, file.size);
    return {
      id: nextAttachmentDraftId(),
      fileName,
      label: fileName,
      sizeBytes: file.size,
      contentType: inferAttachmentContentType(fileName),
      readContent: () => runtime.readFile(file.path),
    };
  });
}
