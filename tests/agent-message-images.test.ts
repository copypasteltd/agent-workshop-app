import assert from "node:assert/strict";
import test from "node:test";
import {
  isAgentMediaAttachment,
  normalizeAgentImagePath,
  normalizeAgentMediaPath,
  parseAgentMessageMedia,
  parseAgentMessageImages,
} from "../src/lib/agentMessageImages.ts";

test("normalizes target-relative and container image paths", () => {
  const target = "/srv/lingban/runs/run_1/target";
  assert.equal(normalizeAgentImagePath("./outputs/result.png", target), "outputs/result.png");
  assert.equal(
    normalizeAgentImagePath("/workspace/target/screens/final.webp", target),
    "screens/final.webp"
  );
  assert.equal(
    normalizeAgentImagePath("/srv/lingban/runs/run_1/target/final.jpg", target),
    "final.jpg"
  );
});

test("rejects escaped, remote and unrelated absolute paths", () => {
  const target = "/srv/lingban/runs/run_1/target";
  assert.equal(normalizeAgentImagePath("../secret.png", target), null);
  assert.equal(normalizeAgentImagePath("https://example.com/image.png", target), null);
  assert.equal(normalizeAgentImagePath("/etc/secret.png", target), null);
});

test("extracts markdown and attachment images without duplicates", () => {
  const parsed = parseAgentMessageImages(
    "Results:\n![cover](./outputs/cover.png)\n`./outputs/detail.webp`",
    "/srv/lingban/runs/run_1/target",
    [
      { label: "cover duplicate", path: "outputs/cover.png" },
      { label: "report", path: "outputs/report.pdf" },
    ]
  );

  assert.equal(parsed.displayText, "Results:\n\n`./outputs/detail.webp`");
  assert.deepEqual(
    parsed.images.map((image) => ({ label: image.label, filePath: image.filePath })),
    [
      { label: "cover", filePath: "outputs/cover.png" },
      { label: "detail.webp", filePath: "outputs/detail.webp" },
    ]
  );
});

test("extracts a bare relative image filename", () => {
  const parsed = parseAgentMessageImages(
    "结果已写入 `cover.png`。",
    "/workspace/target"
  );

  assert.deepEqual(parsed.images.map((image) => image.filePath), ["cover.png"]);
});

test("keeps unsupported remote image markup visible", () => {
  const text = "Remote: ![external](https://example.com/image.png)";
  const parsed = parseAgentMessageImages(text, "/srv/lingban/runs/run_1/target");
  assert.equal(parsed.displayText, text);
  assert.deepEqual(parsed.images, []);
});

test("normalizes local video paths and rejects escaped video paths", () => {
  const target = "/srv/lingban/runs/run_1/target";
  assert.equal(normalizeAgentMediaPath("./output/episode.mp4", target), "output/episode.mp4");
  assert.equal(
    normalizeAgentMediaPath("/workspace/target/output/episode.webm", target),
    "output/episode.webm"
  );
  assert.equal(normalizeAgentMediaPath("../outside.mov", target), null);
  assert.equal(isAgentMediaAttachment("output/episode.m4v", target), true);
});

test("extracts markdown, html and attachment videos without duplicates", () => {
  const parsed = parseAgentMessageMedia(
    "完成：\n[播放短剧](./output/episode.mp4)\n<video src='./output/trailer.webm'></video>",
    "/workspace/target",
    [
      { label: "duplicate", path: "output/episode.mp4" },
      { label: "notes", path: "output/notes.txt" },
    ]
  );

  assert.deepEqual(
    parsed.videos.map((video) => ({ label: video.label, filePath: video.filePath })),
    [
      { label: "播放短剧", filePath: "output/episode.mp4" },
      { label: "trailer.webm", filePath: "output/trailer.webm" },
    ]
  );
  assert.equal(parsed.displayText, "完成：");
});

test("keeps unsupported remote video links visible", () => {
  const text = "[远程视频](https://example.com/episode.mp4)";
  const parsed = parseAgentMessageMedia(text, "/workspace/target");
  assert.equal(parsed.displayText, text);
  assert.deepEqual(parsed.videos, []);
});
