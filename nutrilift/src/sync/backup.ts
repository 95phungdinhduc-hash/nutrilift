// Sao lưu / khôi phục toàn bộ dữ liệu ra file JSON (dùng khi không bật đồng bộ đám mây,
// hoặc để giữ một bản sao an toàn).
import { db } from "../db/db";
import { SYNC_TABLES } from "../db/types";

export interface BackupFile {
  app: "nutrilift";
  version: 1;
  exportedAt: string;
  tables: Record<string, any[]>;
}

export async function exportBackup(): Promise<BackupFile> {
  const tables: Record<string, any[]> = {};
  for (const t of SYNC_TABLES) {
    tables[t] = (await (db as any)[t].toArray()).filter((r: any) => !r.deleted);
  }
  return { app: "nutrilift", version: 1, exportedAt: new Date().toISOString(), tables };
}

export function backupFileName(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `nutrilift-backup-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
}

export function validateBackup(data: any): data is BackupFile {
  return data && data.app === "nutrilift" && typeof data.tables === "object";
}

/**
 * Nhập bản sao lưu. mode "merge": giữ bản ghi mới hơn (theo updatedAt); "replace": xoá dữ liệu hiện tại trước.
 * Mọi bản ghi nhập vào đều được đưa vào hàng đợi đồng bộ.
 */
export async function importBackup(data: BackupFile, mode: "merge" | "replace"): Promise<number> {
  let count = 0;
  const tables = [...SYNC_TABLES.map((t) => (db as any)[t]), db.outbox];
  await db.transaction("rw", tables, async () => {
    if (mode === "replace") {
      for (const t of SYNC_TABLES) {
        const existing = await (db as any)[t].toArray();
        // Ghi tombstone để thiết bị khác cũng xoá
        for (const r of existing) {
          const now = Date.now();
          await (db as any)[t].put({ ...r, deleted: 1, updatedAt: now });
          await db.outbox.put({ key: `${t}|${r.id}`, table: t, id: r.id, updatedAt: now });
        }
      }
    }
    for (const t of SYNC_TABLES) {
      const rows: any[] = data.tables[t] ?? [];
      for (const r of rows) {
        if (!r || typeof r.id !== "string") continue;
        const local = await (db as any)[t].get(r.id);
        const incomingTs = mode === "replace" ? Date.now() : r.updatedAt ?? 0;
        if (mode === "merge" && local && (local.updatedAt ?? 0) >= incomingTs) continue;
        const rec = { ...r, deleted: 0, updatedAt: mode === "replace" ? incomingTs + 1 : incomingTs };
        await (db as any)[t].put(rec);
        await db.outbox.put({ key: `${t}|${r.id}`, table: t, id: r.id, updatedAt: rec.updatedAt });
        count++;
      }
    }
  });
  return count;
}

export function downloadJson(obj: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(obj)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
