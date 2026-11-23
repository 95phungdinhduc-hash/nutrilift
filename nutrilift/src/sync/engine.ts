// Engine đồng bộ local-first: dữ liệu luôn nằm trong IndexedDB của thiết bị, mọi thay đổi được đưa vào
// hàng đợi (outbox) và đẩy lên máy chủ khi có mạng. Xung đột được giải quyết theo "bản ghi mới nhất thắng"
// (last-write-wins theo updatedAt), xoá được đồng bộ bằng tombstone (deleted = 1).
import { db, getMeta, setMeta } from "../db/db";
import { SYNC_TABLES, type SyncTable } from "../db/types";

export interface RemoteRow {
  tbl: string;
  id: string;
  data: any;
  updated_at: number;
  deleted: boolean;
  rev: number;
}

export interface Remote {
  /** Lấy các bản ghi có rev > sinceRev, sắp xếp tăng dần theo rev. */
  pull(sinceRev: number, limit: number): Promise<RemoteRow[]>;
  /** Ghi (upsert) các bản ghi; máy chủ tự bỏ qua bản ghi cũ hơn bản đang có. */
  push(rows: Omit<RemoteRow, "rev">[]): Promise<void>;
}

export interface SyncResult {
  pulled: number;
  pushed: number;
}

const PAGE = 1000;
const PUSH_BATCH = 200;
const FULL_RESYNC_MS = 7 * 24 * 3600 * 1000;

function isSyncTable(t: string): t is SyncTable {
  return (SYNC_TABLES as readonly string[]).includes(t);
}

/** Áp bản ghi từ máy chủ vào DB cục bộ nếu mới hơn. Trả về true nếu có thay đổi. */
async function applyRemote(row: RemoteRow): Promise<boolean> {
  if (!isSyncTable(row.tbl)) return false;
  const table = (db as any)[row.tbl];
  const local = await table.get(row.id);
  if (local && (local.updatedAt ?? 0) >= row.updated_at) return false;
  const rec = { ...(row.data ?? {}), id: row.id, updatedAt: row.updated_at, deleted: row.deleted ? 1 : 0 };
  await table.put(rec);
  return true;
}

export async function pullAll(remote: Remote, full = false): Promise<number> {
  const lastFull = await getMeta<number>("sync_last_full", 0);
  const doFull = full || Date.now() - lastFull > FULL_RESYNC_MS;
  let since = doFull ? 0 : await getMeta<number>("sync_rev", 0);
  let applied = 0;
  for (let guard = 0; guard < 1000; guard++) {
    const rows = await remote.pull(since, PAGE);
    if (!rows.length) break;
    await db.transaction("rw", [...SYNC_TABLES.map((t) => (db as any)[t]), db.meta], async () => {
      for (const r of rows) if (await applyRemote(r)) applied++;
      since = Math.max(since, ...rows.map((r) => r.rev));
      await db.meta.put({ id: "sync_rev", value: since });
    });
    if (rows.length < PAGE) break;
  }
  if (doFull) await setMeta("sync_last_full", Date.now());
  return applied;
}

export async function pushAll(remote: Remote): Promise<number> {
  let pushed = 0;
  for (let guard = 0; guard < 1000; guard++) {
    const entries = await db.outbox.limit(PUSH_BATCH).toArray();
    if (!entries.length) break;
    const rows: Omit<RemoteRow, "rev">[] = [];
    for (const e of entries) {
      const rec = await (db as any)[e.table]?.get(e.id);
      if (!rec) continue;
      const { updatedAt, deleted, ...data } = rec;
      rows.push({ tbl: e.table, id: e.id, data, updated_at: updatedAt ?? Date.now(), deleted: !!deleted });
    }
    if (rows.length) await remote.push(rows);
    // Chỉ xoá khỏi outbox nếu bản ghi chưa bị sửa tiếp trong lúc đẩy.
    await db.transaction("rw", db.outbox, async () => {
      for (const e of entries) {
        const cur = await db.outbox.get(e.key);
        if (cur && cur.updatedAt === e.updatedAt) await db.outbox.delete(e.key);
      }
    });
    pushed += rows.length;
    if (entries.length < PUSH_BATCH) break;
  }
  return pushed;
}

export async function syncOnce(remote: Remote, opts: { full?: boolean } = {}): Promise<SyncResult> {
  const pulled = await pullAll(remote, opts.full);
  const pushed = await pushAll(remote);
  await setMeta("sync_last", Date.now());
  return { pulled, pushed };
}

/** Đưa toàn bộ dữ liệu cục bộ vào hàng đợi (dùng khi đăng nhập lần đầu trên thiết bị đã có dữ liệu). */
export async function enqueueAll(): Promise<number> {
  let n = 0;
  await db.transaction("rw", [...SYNC_TABLES.map((t) => (db as any)[t]), db.outbox], async () => {
    for (const t of SYNC_TABLES) {
      const recs = await (db as any)[t].toArray();
      for (const r of recs) {
        await db.outbox.put({ key: `${t}|${r.id}`, table: t, id: r.id, updatedAt: r.updatedAt ?? 0 });
        n++;
      }
    }
  });
  return n;
}
