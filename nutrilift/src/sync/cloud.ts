// Kết nối Supabase (Postgres + Auth miễn phí) để đồng bộ giữa các thiết bị qua Internet.
import { createClient, type SupabaseClient, type RealtimeChannel } from "@supabase/supabase-js";
import { db, onLocalChange, setMeta } from "../db/db";
import { enqueueAll, syncOnce, type Remote, type RemoteRow } from "./engine";

export interface CloudConfig {
  url: string;
  anonKey: string;
}

export type SyncState = "off" | "signed_out" | "idle" | "syncing" | "error" | "offline";

export interface SyncStatus {
  state: SyncState;
  email?: string;
  lastSync?: number;
  error?: string;
  pending?: number;
}

const CONFIG_KEY = "nl_supabase";
const TABLE = "nl_records";

export function getCloudConfig(): CloudConfig | undefined {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) {
      const c = JSON.parse(raw);
      if (c?.url && c?.anonKey) return c;
    }
  } catch {
    /* ignore */
  }
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (url && anonKey) return { url, anonKey };
  return undefined;
}

export function setCloudConfig(c: CloudConfig | undefined) {
  if (c) localStorage.setItem(CONFIG_KEY, JSON.stringify({ url: c.url.trim().replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, ""), anonKey: c.anonKey.trim() }));
  else localStorage.removeItem(CONFIG_KEY);
  resetClient();
}

let client: SupabaseClient | undefined;
let clientUrl = "";
let channel: RealtimeChannel | undefined;
let status: SyncStatus = { state: "off" };
const statusListeners = new Set<(s: SyncStatus) => void>();

function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  statusListeners.forEach((fn) => fn(status));
}

export function getSyncStatus(): SyncStatus {
  return status;
}

export function subscribeSyncStatus(fn: (s: SyncStatus) => void): () => void {
  statusListeners.add(fn);
  fn(status);
  return () => statusListeners.delete(fn);
}

function resetClient() {
  if (channel) {
    channel.unsubscribe();
    channel = undefined;
  }
  client = undefined;
  clientUrl = "";
}

export function getClient(): SupabaseClient | undefined {
  const cfg = getCloudConfig();
  if (!cfg) return undefined;
  if (!client || clientUrl !== cfg.url) {
    client = createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: "nl_auth" },
    });
    clientUrl = cfg.url;
  }
  return client;
}

function makeRemote(c: SupabaseClient, userId: string): Remote {
  return {
    async pull(sinceRev, limit) {
      const { data, error } = await c
        .from(TABLE)
        .select("tbl,id,data,updated_at,deleted,rev")
        .gt("rev", sinceRev)
        .order("rev", { ascending: true })
        .limit(limit);
      if (error) throw new Error(error.message);
      return (data ?? []) as RemoteRow[];
    },
    async push(rows) {
      const { error } = await c
        .from(TABLE)
        .upsert(
          rows.map((r) => ({ ...r, user_id: userId })),
          { onConflict: "user_id,tbl,id" }
        );
      if (error) throw new Error(error.message);
    },
  };
}

let syncing: Promise<void> | undefined;
let again = false;

export async function syncNow(opts: { full?: boolean } = {}): Promise<void> {
  if (syncing) {
    again = true;
    return syncing;
  }
  syncing = (async () => {
    try {
      const c = getClient();
      if (!c) {
        setStatus({ state: "off" });
        return;
      }
      const { data } = await c.auth.getSession();
      const session = data.session;
      if (!session) {
        setStatus({ state: "signed_out", email: undefined });
        return;
      }
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        setStatus({ state: "offline", pending: await db.outbox.count() });
        return;
      }
      setStatus({ state: "syncing", email: session.user.email ?? undefined });
      await syncOnce(makeRemote(c, session.user.id), opts);
      setStatus({ state: "idle", lastSync: Date.now(), error: undefined, pending: await db.outbox.count() });
    } catch (e: any) {
      setStatus({ state: "error", error: e?.message ?? String(e), pending: await db.outbox.count().catch(() => undefined) });
    } finally {
      syncing = undefined;
      if (again) {
        again = false;
        setTimeout(() => syncNow(), 500);
      }
    }
  })();
  return syncing;
}

// ---------- Tài khoản ----------
export async function signUp(email: string, password: string) {
  const c = getClient();
  if (!c) throw new Error("Chưa cấu hình máy chủ đồng bộ");
  const { data, error } = await c.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: location.origin + location.pathname },
  });
  if (error) throw new Error(error.message);
  return { needsConfirm: !data.session };
}

export async function signIn(email: string, password: string) {
  const c = getClient();
  if (!c) throw new Error("Chưa cấu hình máy chủ đồng bộ");
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  // Lần đầu đăng nhập trên thiết bị: đưa toàn bộ dữ liệu cục bộ lên (gộp theo bản ghi mới nhất).
  await enqueueAll();
  await setMeta("sync_rev", 0);
  await syncNow({ full: true });
  startRealtime();
}

export async function signOut() {
  const c = getClient();
  if (c) await c.auth.signOut();
  if (channel) {
    channel.unsubscribe();
    channel = undefined;
  }
  setStatus({ state: "signed_out", email: undefined });
}

function startRealtime() {
  const c = getClient();
  if (!c || channel) return;
  try {
    channel = c
      .channel("nl_records_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: TABLE }, () => scheduleSync(800))
      .subscribe();
  } catch {
    /* Realtime là tuỳ chọn */
  }
}

let timer: ReturnType<typeof setTimeout> | undefined;
export function scheduleSync(delay = 2500) {
  if (!getCloudConfig()) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => syncNow(), delay);
}

let listenersInstalled = false;
let authSubscribedFor = "";
/** Khởi động đồng bộ nền: khi mở app, khi có thay đổi, khi quay lại tab, khi có mạng, định kỳ 60 giây. */
export async function startSync() {
  if (!listenersInstalled) {
    listenersInstalled = true;
    onLocalChange(() => scheduleSync());
    window.addEventListener("online", () => scheduleSync(500));
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") scheduleSync(300);
    });
    setInterval(() => {
      if (document.visibilityState === "visible" && getCloudConfig()) syncNow();
    }, 60000);
  }
  const c = getClient();
  if (!c) {
    setStatus({ state: "off" });
    return;
  }
  if (authSubscribedFor !== clientUrl) {
    authSubscribedFor = clientUrl;
    c.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setStatus({ email: session.user.email ?? undefined });
        startRealtime();
      }
    });
  }
  const { data } = await c.auth.getSession();
  if (data.session) startRealtime();
  await syncNow();
}

/** Kiểm tra cấu hình: gọi thử bảng nl_records. */
export async function testConnection(cfg: CloudConfig): Promise<string | undefined> {
  try {
    const c = createClient(cfg.url, cfg.anonKey, { auth: { persistSession: false } });
    const { error } = await c.from(TABLE).select("id").limit(1);
    if (error) {
      if (/does not exist|relation/i.test(error.message)) return "Chưa tạo bảng — hãy chạy file supabase/schema.sql trong SQL Editor";
      // Bảng tồn tại nhưng khách chưa có quyền đọc: kết nối vẫn đúng, đăng nhập xong sẽ có quyền.
      if (/permission denied/i.test(error.message)) return undefined;
      return error.message;
    }
    return undefined;
  } catch (e: any) {
    return e?.message ?? String(e);
  }
}
