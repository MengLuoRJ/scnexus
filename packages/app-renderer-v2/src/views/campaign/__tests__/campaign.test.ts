import { afterEach, expect, test, vi } from "vitest";
import { effectScope } from "vue";
import type { AnalysisResult, ContentRecord } from "@scnexus/app-shared/types/content.type";
import { AppError, ERRORS, toErrorDto } from "@scnexus/app-shared/errors/app.error";
const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  active: vi.fn(),
  analyze: vi.fn(),
  cancel: vi.fn(),
  install: vi.fn(),
  prepare: vi.fn(),
  activate: vi.fn(),
  removePreview: vi.fn(),
  remove: vi.fn(),
  scan: vi.fn(),
}));
vi.mock("../../../ipcs/scii-game-setting", () => ({
  apiGameSettingGet: async () => ({ ok: true, data: { gameRoot: "D:\\Game", paths: {} } }),
}));
vi.mock("../../../ipcs/campaign", () => ({
  apiCampaignList: mocks.list,
  apiCampaignActive: mocks.active,
  apiCampaignAnalyze: mocks.analyze,
  apiCampaignCancel: mocks.cancel,
  apiCampaignInstall: mocks.install,
  apiCampaignPrepareActivation: mocks.prepare,
  apiCampaignActivate: mocks.activate,
  apiCampaignPrepareDeactivation: mocks.removePreview,
  apiCampaignPrepareUninstall: mocks.removePreview,
  apiCampaignDeactivate: mocks.remove,
  apiCampaignUninstall: mocks.remove,
  apiCampaignScan: mocks.scan,
}));
import { useCampaign } from "../useCampaign";
const scopes: ReturnType<typeof effectScope>[] = [];
afterEach(() => {
  for (const scope of scopes.splice(0)) scope.stop();
  vi.resetAllMocks();
});
function setup() {
  mocks.list.mockResolvedValue({ ok: true, data: { records: [] } });
  mocks.active.mockResolvedValue({ ok: true, data: { active: {} } });
  mocks.cancel.mockResolvedValue({ ok: true, data: undefined });
  const scope = effectScope();
  scopes.push(scope);
  return scope.run(() => useCampaign())!;
}
const analysis = {
  analysisId: "a",
  recommendedMode: "ccm",
  modes: { scnexus: {}, ccm: {}, auto: null },
  conflicts: [{ mode: "ccm", files: [] }],
  existingInstallations: { scnexus: [], ccm: [], auto: [] },
} as unknown as AnalysisResult;
const record = { localId: "r", gameRoot: "D:\\Game" } as ContentRecord;

test("analysis selects recommendation, submits exact decisions and refreshes after install", async () => {
  const service = setup();
  mocks.analyze.mockResolvedValue({ ok: true, data: analysis });
  mocks.install.mockResolvedValue({ ok: true, data: record });
  await service.analyze({ kind: "directory", path: "D:\\Package" });
  expect(service.mode.value).toBe("ccm");
  await service.confirm([{ conflictId: "c", action: "keep" }], []);
  expect(mocks.install).toHaveBeenCalledWith({
    analysisId: "a",
    mode: "ccm",
    decisions: [{ conflictId: "c", action: "keep" }],
  });
  expect(service.analysis.value).toBeNull();
  expect(mocks.list).toHaveBeenCalledOnce();
});
test("activation errors retain preview and original error for user correction", async () => {
  const service = setup();
  mocks.prepare.mockResolvedValue({
    ok: true,
    data: { activationId: "act", localId: "r", files: [], conflicts: [] },
  });
  const error = toErrorDto(new AppError(ERRORS.TASK_CONFLICT));
  mocks.activate.mockResolvedValue({ ok: false, error });
  await service.prepare(record, "activate");
  await service.confirm([], []);
  expect(service.error.value?.errorId).toBe(error.errorId);
  expect(service.activation.value?.activationId).toBe("act");
  await service.close();
  expect(mocks.cancel).toHaveBeenCalledWith("act");
  expect(service.activation.value).toBeNull();
});
test("shared removal decisions are forwarded and inactive game records are excluded", async () => {
  const service = setup();
  mocks.removePreview.mockResolvedValue({
    ok: true,
    data: { removalId: "rm", operation: "uninstall", files: [] },
  });
  mocks.remove.mockResolvedValue({ ok: true, data: {} });
  mocks.list.mockResolvedValue({
    ok: true,
    data: { records: [record, { ...record, localId: "other", gameRoot: "D:\\Other" }] },
  });
  await service.prepare(record, "uninstall");
  await service.confirm([], [{ conflictId: "shared", action: "keep" }]);
  expect(mocks.remove).toHaveBeenCalledWith("rm", [{ conflictId: "shared", action: "keep" }]);
  expect(service.records.value).toEqual([record]);
});
test("unmount cancels a preview returned by in-flight analysis", async () => {
  const service = setup();
  let resolve: (value: unknown) => void = () => {};
  mocks.analyze.mockReturnValue(new Promise((done) => (resolve = done)));
  const operation = service.analyze({ kind: "archive", path: "D:\\package.zip" });
  await Promise.resolve();
  scopes[0]!.stop();
  resolve({ ok: true, data: analysis });
  await operation;
  expect(mocks.cancel).toHaveBeenCalledWith("a");
  expect(service.analysis.value).toBeNull();
});

test("scan exposes diagnostics and deactivation refreshes active state", async () => {
  const service = setup();
  mocks.scan.mockResolvedValue({
    ok: true,
    data: { diagnostics: [{ path: "broken", message: "Invalid CCM package" }] },
  });
  await service.scan();
  expect(service.diagnostics.value).toEqual([{ path: "broken", message: "Invalid CCM package" }]);
  mocks.removePreview.mockResolvedValue({
    ok: true,
    data: { removalId: "off", operation: "deactivate", files: [] },
  });
  mocks.remove.mockResolvedValue({ ok: true, data: {} });
  await service.prepare(record, "deactivate");
  await service.confirm([], []);
  expect(mocks.remove).toHaveBeenCalledWith("off", []);
  expect(service.removal.value).toBeNull();
});
