import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_ATTACHMENT_BYTES,
  inferAttachmentContentType,
  isAttachmentPickerCancellation,
  pickMiniProgramAttachments,
  type MiniProgramAttachmentRuntime,
} from "../src/lib/attachmentCore.ts";

test("infers common attachment content types", () => {
  assert.equal(inferAttachmentContentType("receipt.PDF"), "application/pdf");
  assert.equal(inferAttachmentContentType("episode.mp4"), "video/mp4");
  assert.equal(inferAttachmentContentType("archive.unknown"), null);
});

test("maps WeChat message files to repeatable attachment drafts", async () => {
  const contents = new Map([
    ["wxfile://report", new Uint8Array([1, 2, 3]).buffer],
    ["wxfile://clip", new Uint8Array([4, 5]).buffer],
  ]);
  const runtime: MiniProgramAttachmentRuntime = {
    async chooseMessageFile(input) {
      assert.deepEqual(input, { count: 9, type: "all" });
      return {
        tempFiles: [
          { name: "report.pdf", path: "wxfile://report", size: 3, type: "file" },
          { name: "clip.mp4", path: "wxfile://clip", size: 2, type: "video" },
        ],
      };
    },
    async readFile(filePath) {
      const content = contents.get(filePath);
      assert.ok(content);
      return content;
    },
  };

  const drafts = await pickMiniProgramAttachments({ multiple: true }, runtime);
  assert.equal(drafts.length, 2);
  assert.deepEqual(
    drafts.map((draft) => ({
      fileName: draft.fileName,
      sizeBytes: draft.sizeBytes,
      contentType: draft.contentType,
    })),
    [
      { fileName: "report.pdf", sizeBytes: 3, contentType: "application/pdf" },
      { fileName: "clip.mp4", sizeBytes: 2, contentType: "video/mp4" },
    ]
  );
  assert.equal((await drafts[0].readContent()).byteLength, 3);
  assert.equal((await drafts[0].readContent()).byteLength, 3);
});

test("treats WeChat picker cancellation as an empty selection", async () => {
  const runtime: MiniProgramAttachmentRuntime = {
    async chooseMessageFile() {
      throw { errMsg: "chooseMessageFile:fail cancel" };
    },
    async readFile() {
      throw new Error("readFile should not run");
    },
  };

  assert.equal(isAttachmentPickerCancellation({ errMsg: "chooseMessageFile:fail cancel" }), true);
  assert.deepEqual(await pickMiniProgramAttachments(undefined, runtime), []);
});

test("rejects files above the API upload limit before reading", async () => {
  const runtime: MiniProgramAttachmentRuntime = {
    async chooseMessageFile() {
      return {
        tempFiles: [
          {
            name: "oversized.zip",
            path: "wxfile://oversized",
            size: MAX_ATTACHMENT_BYTES + 1,
            type: "file",
          },
        ],
      };
    },
    async readFile() {
      throw new Error("readFile should not run");
    },
  };

  await assert.rejects(
    () => pickMiniProgramAttachments(undefined, runtime),
    /超过 50 MB 上传上限/u
  );
});
