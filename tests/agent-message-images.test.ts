import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeAgentImagePath,
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
