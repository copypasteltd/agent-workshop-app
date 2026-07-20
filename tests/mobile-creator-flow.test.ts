import test from "node:test";
import assert from "node:assert/strict";
import {
  areCreatorReleaseGatesPassed,
  hydrateCreatorPublishOperationKeys,
  resolveMobileCreatorProjectAction,
  resolveMobileCreatorPublishStage,
} from "../src/lib/mobileCreatorFlow.ts";
import {
  MOBILE_REQUEST_TIMEOUT_MS,
  resolveMobileNetworkMode,
} from "../src/lib/mobileNetwork.ts";
import { loadMobileCreatorCapabilities } from "../src/lib/mobileCreatorCapabilities.ts";

test("WeChat queries bypass the browser online manager and requests have a finite timeout", () => {
  assert.equal(resolveMobileNetworkMode("weapp"), "always");
  assert.equal(resolveMobileNetworkMode("h5"), "online");
  assert.equal(resolveMobileNetworkMode(undefined), "online");
  assert.equal(MOBILE_REQUEST_TIMEOUT_MS, 20_000);
});

test("creator capability loading directly invokes every required API loader", async () => {
  const calls: string[] = [];
  const load = <T>(name: string, value: T) => async () => {
    calls.push(name);
    return value;
  };
  const result = await loadMobileCreatorCapabilities({
    loadProviders: load("providers", ["provider"]),
    loadProviderBindings: load("provider-bindings", ["provider-binding"]),
    loadMcps: load("mcps", ["mcp"]),
    loadMcpBindings: load("mcp-bindings", ["mcp-binding"]),
    loadCredentials: load("credentials", ["credential"]),
  });

  assert.deepEqual(calls, [
    "providers",
    "provider-bindings",
    "mcps",
    "mcp-bindings",
    "credentials",
  ]);
  assert.deepEqual(result, {
    providers: ["provider"],
    providerBindings: ["provider-binding"],
    mcps: ["mcp"],
    mcpBindings: ["mcp-binding"],
    credentials: ["credential"],
  });
});

test("creator project action follows the source, draft, seal, and publication lifecycle", () => {
  assert.deepEqual(
    resolveMobileCreatorProjectAction({
      status: "DRAFT",
      sourceRunId: null,
      currentDraftId: null,
    }),
    { label: "项目待启动", route: "none" }
  );
  assert.equal(
    resolveMobileCreatorProjectAction({
      status: "RECORDING",
      sourceRunId: "run_1",
      currentDraftId: null,
    }).route,
    "run"
  );
  assert.equal(
    resolveMobileCreatorProjectAction({
      status: "EDITING",
      sourceRunId: "run_1",
      currentDraftId: "sdr_1",
    }).route,
    "draft"
  );
  for (const status of ["SEALED", "PACKAGED", "PUBLISHED"] as const) {
    assert.equal(
      resolveMobileCreatorProjectAction({
        status,
        sourceRunId: "run_1",
        currentDraftId: "sdr_1",
      }).route,
      "publish"
    );
  }
});

test("legacy publication drafts receive stable package and release operation keys", () => {
  const generated: string[] = [];
  const createOperationId = (prefix: string) => {
    const id = `${prefix}-${generated.length + 1}`;
    generated.push(id);
    return id;
  };
  const hydrated = hydrateCreatorPublishOperationKeys(
    { sessionProjectId: "spj_1" },
    createOperationId
  );
  assert.equal(hydrated.packageIdempotencyKey, "creator-package-1");
  assert.equal(hydrated.releaseIdempotencyKey, "creator-release-2");

  const restored = hydrateCreatorPublishOperationKeys(hydrated, createOperationId);
  assert.equal(restored.packageIdempotencyKey, hydrated.packageIdempotencyKey);
  assert.equal(restored.releaseIdempotencyKey, hydrated.releaseIdempotencyKey);
  assert.equal(generated.length, 2);
});

test("publication resumes from the first incomplete stage", () => {
  assert.equal(resolveMobileCreatorPublishStage({ packageReady: false, releaseReady: false, gatesPassed: false, active: false }), "package");
  assert.equal(resolveMobileCreatorPublishStage({ packageReady: true, releaseReady: false, gatesPassed: false, active: false }), "release");
  assert.equal(resolveMobileCreatorPublishStage({ packageReady: true, releaseReady: true, gatesPassed: false, active: false }), "gates");
  assert.equal(resolveMobileCreatorPublishStage({ packageReady: true, releaseReady: true, gatesPassed: true, active: false }), "activation");
  assert.equal(resolveMobileCreatorPublishStage({ packageReady: true, releaseReady: true, gatesPassed: true, active: true }), "complete");
});

test("release gates require a non-empty fully accepted set", () => {
  assert.equal(areCreatorReleaseGatesPassed([]), false);
  assert.equal(areCreatorReleaseGatesPassed([{ status: "passed" }, { status: "waived" }]), true);
  assert.equal(areCreatorReleaseGatesPassed([{ status: "passed" }, { status: "pending" }]), false);
  assert.equal(areCreatorReleaseGatesPassed([{ status: "failed" }]), false);
});
