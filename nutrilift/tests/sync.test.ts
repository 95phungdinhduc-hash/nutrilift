import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { NutriLiftDB, _setDb, db, put, remove } from "../src/db/db";
import { syncOnce, type Remote, type RemoteRow } from "../src/sync/engine";
import { exportBackup, importBackup } from "../src/sync/backup";

/** Máy chủ giả lập: giống trigger trong supabase/schema.sql (LWW + rev tăng dần). */
class FakeServer {
  rows = new Map<string, RemoteRow>();
  rev = 0;
  remote(): Remote {
    return {
      pull: async (since, limit) =>
        [...this.rows.values()].filter((r) => r.rev > since).sort((a, b) => a.rev - b.rev).slice(0, limit).map((r) => structuredClone(r)),
      push: async (rows) => {
        for (const r of rows) {
          const k = `${r.tbl}|${r.id}`;
          const old = this.rows.get(k);
          if (old && r.updated_at < old.updated_at) continue;
          this.rows.set(k, { ...structuredClone(r), rev: ++this.rev });
        }
      },
    };
  }
}

const deviceA = new NutriLiftDB("devA");
const deviceB = new NutriLiftDB("devB");
async function on<T>(d: NutriLiftDB, fn: () => Promise<T>): Promise<T> {
  _setDb(d);
  return fn();
}

describe("đồng bộ 2 thiết bị", () => {
  const server = new FakeServer();

  it("A ghi → B nhận", async () => {
    await on(deviceA, () => put("weights", { id: "w:2026-01-01", date: "2026-01-01", kg: 80 }));
    await on(deviceA, () => syncOnce(server.remote()));
    expect(await deviceA.outbox.count()).toBe(0);
    const r = await on(deviceB, () => syncOnce(server.remote()));
    expect(r.pulled).toBe(1);
    expect((await deviceB.weights.get("w:2026-01-01"))?.kg).toBe(80);
  });

  it("xung đột: bản sửa sau cùng thắng", async () => {
    await on(deviceA, () => put("weights", { id: "w:2026-01-02", date: "2026-01-02", kg: 79.5 }));
    await new Promise((r) => setTimeout(r, 5));
    await on(deviceB, () => put("weights", { id: "w:2026-01-02", date: "2026-01-02", kg: 79.8 }));
    await on(deviceB, () => syncOnce(server.remote()));
    await on(deviceA, () => syncOnce(server.remote())); // A đẩy bản cũ hơn → bị bỏ qua, A nhận bản của B
    await on(deviceB, () => syncOnce(server.remote()));
    expect((await deviceA.weights.get("w:2026-01-02"))?.kg).toBe(79.8);
    expect((await deviceB.weights.get("w:2026-01-02"))?.kg).toBe(79.8);
  });

  it("xoá được đồng bộ", async () => {
    await on(deviceB, () => remove("weights", "w:2026-01-01"));
    await on(deviceB, () => syncOnce(server.remote()));
    await on(deviceA, () => syncOnce(server.remote()));
    expect((await deviceA.weights.get("w:2026-01-01"))?.deleted).toBe(1);
  });

  it("sao lưu & khôi phục", async () => {
    const backup = await on(deviceA, () => exportBackup());
    expect(backup.tables.weights.length).toBe(1);
    const fresh = new NutriLiftDB("devC");
    const n = await on(fresh, () => importBackup(backup, "merge"));
    expect(n).toBe(1);
    expect((await fresh.weights.get("w:2026-01-02"))?.kg).toBe(79.8);
    expect(await fresh.outbox.count()).toBe(1);
    _setDb(deviceA);
    expect(db).toBe(deviceA);
  });
});
