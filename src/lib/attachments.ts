import Taro from "@tarojs/taro";
import {
  inferAttachmentContentType,
  nextAttachmentDraftId,
  pickMiniProgramAttachments as pickMiniProgramAttachmentsWithRuntime,
  resolveAttachmentPickerCount,
  validateAttachment,
  type AttachmentDraft,
  type AttachmentPickerOptions,
  type MiniProgramAttachmentRuntime,
} from "./attachmentCore";

export {
  formatAttachmentSize,
  inferAttachmentContentType,
  isAttachmentPickerCancellation,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_COUNT,
  type AttachmentDraft,
  type AttachmentPickerOptions,
  type MiniProgramAttachmentRuntime,
  type MiniProgramChosenFile,
} from "./attachmentCore";

function defaultMiniProgramReadFile(filePath: string) {
  return new Promise<ArrayBuffer>((resolve, reject) => {
    Taro.getFileSystemManager().readFile({
      filePath,
      success(result) {
        if (result.data instanceof ArrayBuffer) {
          resolve(result.data);
          return;
        }

        reject(new Error("微信临时文件未返回二进制内容。"));
      },
      fail(result) {
        reject(new Error(result.errMsg || "微信临时文件读取失败。"));
      },
    });
  });
}

const defaultMiniProgramRuntime: MiniProgramAttachmentRuntime = {
  chooseMessageFile: (input) => Taro.chooseMessageFile(input),
  readFile: defaultMiniProgramReadFile,
};

export async function pickBrowserAttachments(
  options?: AttachmentPickerOptions
): Promise<AttachmentDraft[]> {
  if (typeof document === "undefined") {
    throw new Error("当前环境暂不支持浏览器文件选择器。");
  }

  return await new Promise<AttachmentDraft[]>((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = options?.multiple ?? true;
    input.accept = options?.accept ?? "";
    input.style.position = "fixed";
    input.style.left = "-9999px";

    const cleanup = () => {
      input.value = "";
      input.remove();
    };

    input.addEventListener(
      "change",
      () => {
        const files = Array.from(input.files ?? []).slice(0, resolveAttachmentPickerCount(options));
        cleanup();

        try {
          resolve(
            files.map((file) => {
              validateAttachment(file.name, file.size);
              return {
                id: nextAttachmentDraftId(),
                fileName: file.name,
                label: file.name,
                sizeBytes: file.size,
                contentType: file.type || inferAttachmentContentType(file.name),
                readContent: () => file.arrayBuffer(),
              };
            })
          );
        } catch (error) {
          reject(error);
        }
      },
      { once: true }
    );

    document.body.appendChild(input);
    input.click();

    window.setTimeout(() => {
      if (!document.body.contains(input)) {
        return;
      }
      cleanup();
      resolve([]);
    }, 60_000);
  });
}

export function pickMiniProgramAttachments(options?: AttachmentPickerOptions) {
  return pickMiniProgramAttachmentsWithRuntime(options, defaultMiniProgramRuntime);
}

export function pickLocalAttachments(options?: AttachmentPickerOptions) {
  return process.env.TARO_ENV === "weapp"
    ? pickMiniProgramAttachments(options)
    : pickBrowserAttachments(options);
}
