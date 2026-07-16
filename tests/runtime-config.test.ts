import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  updateMany: vi.fn(async () => ({ count: 1 })),
  upsert: vi.fn(async () => ({})),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { setting: database },
}));

import { ensureRuntimeConfigDefaults } from "@/lib/runtime-config";

describe("OpenWA runtime defaults", () => {
  beforeEach(() => {
    database.updateMany.mockClear();
    database.upsert.mockClear();
  });

  it("migrates only the known Docker-era seeded row to the local non-Docker URL", async () => {
    await ensureRuntimeConfigDefaults();
    expect(database.updateMany).toHaveBeenCalledWith({
      where: {
        id: "c6c0a001-0a01-4d00-9000-000000000101",
        key: "runtime_openwa_base_url",
        value: "http://openwa:2785/api",
      },
      data: { value: "http://127.0.0.1:2785/api" },
    });
  });

  it("creates missing lifecycle defaults without overwriting existing administrator values", async () => {
    await ensureRuntimeConfigDefaults();
    expect(database.upsert).toHaveBeenCalledWith({ where: { key: "runtime_openwa_port" }, update: {}, create: { key: "runtime_openwa_port", value: "2785" } });
    expect(database.upsert).toHaveBeenCalledWith({ where: { key: "runtime_openwa_auto_start" }, update: {}, create: { key: "runtime_openwa_auto_start", value: "true" } });
  });
});
